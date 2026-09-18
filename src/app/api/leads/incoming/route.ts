import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { leadExisteDeja } from "@/lib/inbox";
import { getSettingRaw } from "@/lib/settings";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Webhook d'entrée des leads : le formulaire du site (WordPress / Forminator)
// POST ici les données du contact → création automatique d'un PROSPECT (NOUVEAU).
//
// Sécurité : en-tête `x-api-key` (ou ?key=) devant correspondre à
//   LEADS_WEBHOOK_SECRET (ou, à défaut, CRON_SECRET) — variables d'env Vercel.
//
// Anti-doublon : même logique que l'import email — si un prospect OU un client
// existe déjà (même email OU même téléphone), on NE recrée rien. Un lead reçu à
// la fois par ce webhook ET par l'email du formulaire ne crée donc qu'un prospect.
// ─────────────────────────────────────────────────────────────────────────────

// Clé attendue : d'abord la variable d'env dédiée, sinon la clé réglée dans
// Configuration (settings/leads_webhook_secret) — pour la configurer sans Vercel.
async function getSecret(): Promise<string | undefined> {
  if (process.env.LEADS_WEBHOOK_SECRET) return process.env.LEADS_WEBHOOK_SECRET;
  const s = await getSettingRaw("leads_webhook_secret");
  return s || undefined;
}

// Test de vie : GET renvoie juste un statut (sans rien exposer).
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "leads/incoming", method: "POST", secured: !!(await getSecret()) });
}

export async function POST(req: Request) {
  const secret = await getSecret();
  const key = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("key") || "";
  if (!secret || key !== secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }

  const clean = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim().slice(0, 500);
  const prenom     = clean(body.prenom);
  const nom        = clean(body.nom);
  const email      = clean(body.email).toLowerCase();
  const tel        = clean(body.tel ?? body.telephone ?? body.phone);
  const prestation = clean(body.prestation ?? body.type_presta ?? body.typePresta) || "Demande de devis";
  const adresse    = clean(body.adresse ?? body.address);
  const message    = clean(body.message);
  const budget     = clean(body.budget ?? body.prix);
  // Souhait de créneau (préférence, PAS une réservation) : rangé dans les notes.
  // Accepte les champs À PLAT (date_souhaitee, heure…) OU un objet imbriqué `creneau`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cr: any = (body.creneau && typeof body.creneau === "object") ? body.creneau : {};
  const dateSouhaitee = clean(body.date_souhaitee ?? body.date ?? body.date_rdv ?? cr.date_souhaitee ?? cr.date);
  const heure         = clean(body.heure ?? body.time ?? body.heure_souhaitee ?? cr.heure_souhaitee ?? cr.heure ?? cr.time);
  const momentRaw     = clean(body.moment ?? body.moment_journee ?? cr.moment ?? cr.moment_journee);
  const delaiRaw      = clean(body.delai ?? body.delay ?? cr.delai ?? cr.delay);

  if (!email && !tel) {
    return NextResponse.json({ error: "email ou téléphone requis" }, { status: 400 });
  }

  // Rend lisibles les valeurs « machine » éventuelles (apres_midi → Après-midi…).
  const MOMENT_LABEL: Record<string, string> = { matin: "Matin", apres_midi: "Après-midi", "apres-midi": "Après-midi", apresmidi: "Après-midi", soiree: "Soirée", soir: "Soirée", week_end: "Week-end", "week-end": "Week-end", weekend: "Week-end", peu_importe: "Peu importe", peuimporte: "Peu importe" };
  const DELAI_LABEL: Record<string, string>  = { des_que_possible: "Dès que possible", cette_semaine: "Cette semaine", semaine_prochaine: "La semaine prochaine", la_semaine_prochaine: "La semaine prochaine", pas_presse: "Pas pressé" };
  const pretty = (v: string, map: Record<string, string>) => map[v.toLowerCase().replace(/\s+/g, "_")] || v;
  const moment = momentRaw ? pretty(momentRaw, MOMENT_LABEL) : "";
  const delai  = delaiRaw ? pretty(delaiRaw, DELAI_LABEL) : "";

  // Date ISO (2026-09-22) → JJ/MM/AAAA pour un affichage lisible dans la fiche.
  const dateFr = /^\d{4}-\d{2}-\d{2}$/.test(dateSouhaitee) ? dateSouhaitee.split("-").reverse().join("/") : dateSouhaitee;

  // Résumé lisible du créneau souhaité, ajouté en tête des notes du prospect.
  const creneau = [dateFr, heure, moment, delai].filter(Boolean).join(" · ");
  const notes = [creneau ? `Créneau souhaité : ${creneau}` : "", message].filter(Boolean).join("\n") || null;

  // Anti-doublon : déjà présent (prospect ou client) → on confirme sans recréer.
  const dejaLa = await leadExisteDeja(email, tel);
  if (dejaLa) {
    return NextResponse.json({ ok: true, duplicate: true, where: dejaLa });
  }

  const today = new Date().toISOString().split("T")[0];
  const { error } = await supabase.from("prospects").insert({
    prenom, nom,
    tel        : tel || null,
    email      : email || null,
    source     : "Site (formulaire direct)",
    type_presta: prestation,
    adresse    : adresse || null,
    budget     : budget || null,      // estimation éventuelle
    notes      : notes,               // message + souhait de créneau (date/moment/délai)
    statut     : "NOUVEAU",
    date_relance: today,              // à rappeler dès aujourd'hui → visible d'emblée
    commentaires: [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, created: true });
}
