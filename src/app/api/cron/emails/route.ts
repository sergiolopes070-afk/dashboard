import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Cron quotidien des emails automatiques — ÉTAPE 1 : MODE SIMULATION.
//
// Ce endpoint est appelé 1×/jour par Vercel Cron (voir vercel.json). Pour
// l'instant il N'ENVOIE RIEN : il calcule et RENVOIE la liste des emails qui
// PARTIRAIENT (relances devis J+3/5/7, demandes d'avis J+2), pour qu'on vérifie
// qu'il vise les bonnes personnes avant d'armer l'envoi réel (étapes 2 et 3).
//
// Sécurité : seul un appel portant le secret CRON_SECRET est accepté
// (header Authorization: Bearer <secret>, ce que Vercel Cron envoie
// automatiquement quand la variable CRON_SECRET existe ; ou ?key=<secret> pour
// un test manuel dans le navigateur).
// ─────────────────────────────────────────────────────────────────────────────

const RELANCE_JOURS = [3, 5, 7];              // relances devis à J+3, J+5, J+7
const AVIS_JOURS     = 2;                      // demande d'avis à J+2 (48h)
const DONE_STATUTS   = ["CONFIRMÉ", "PAYÉ", "TERMINÉ"]; // devis considéré "répondu"

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function authorize(req: Request): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: "CRON_SECRET non configuré sur Vercel" };
  const auth = req.headers.get("authorization");
  const key  = new URL(req.url).searchParams.get("key");
  if (auth === `Bearer ${secret}` || key === secret) return { ok: true };
  return { ok: false, reason: "Non autorisé" };
}

export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }
  if (!supabase) {
    return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  }

  // Prestations actives (non archivées) avec les infos client.
  const { data, error } = await supabase
    .from("prestations")
    .select("id, prix, statut, created_at, date_intervention, type_prestation, clients(prenom, nom, email)")
    .eq("archive", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data || [];

  const relanceDevis: unknown[] = [];
  const demandeAvis:  unknown[] = [];
  const aAppeler:     unknown[] = [];

  for (const p of rows) {
    const client = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
    const nom    = `${client.prenom || ""} ${client.nom || ""}`.trim() || "(client sans nom)";
    const email  = client.email || null;
    const prix   = parseFloat(p.prix);

    // ── Relance devis : montant renseigné ET pas de date d'intervention ──
    // Règle métier (validée) : un devis accepté = une date d'intervention posée.
    // Donc "sans réponse / pas accepté" = montant renseigné + AUCUNE date.
    const devisExiste = !isNaN(prix) && prix > 0;
    const aUneDate    = !!(p.date_intervention && String(p.date_intervention).trim());
    const clos        = DONE_STATUTS.includes(p.statut) || p.statut === "ANNULÉ";
    if (devisExiste && !aUneDate && !clos) {
      const age = daysSince(p.created_at);
      if (age != null && RELANCE_JOURS.includes(age)) {
        relanceDevis.push({
          nom, email, prix, ageJours: age,
          niveau: RELANCE_JOURS.indexOf(age) + 1,
          manqueEmail: !email,
        });
      } else if (age != null && age > 7) {
        aAppeler.push({ nom, email, prix, ageJours: age });
      }
    }

    // ── Demande d'avis : prestation terminée depuis 48h ──
    if (DONE_STATUTS.includes(p.statut)) {
      const age = daysSince(p.date_intervention);
      if (age != null && age === AVIS_JOURS) {
        demandeAvis.push({
          nom, email, prestation: p.type_prestation || "—",
          dateIntervention: p.date_intervention,
          manqueEmail: !email,
        });
      }
    }
  }

  const report = {
    mode: "🧪 SIMULATION — aucun email n'a été envoyé",
    executeLe: new Date().toISOString(),
    reglages: { relanceJours: RELANCE_JOURS, avisJours: AVIS_JOURS },
    resume:
      `${relanceDevis.length} relance(s) devis + ${demandeAvis.length} demande(s) d'avis ` +
      `auraient été envoyées. ${aAppeler.length} devis à appeler (>J+7).`,
    relanceDevis,
    demandeAvis,
    aAppeler,
  };

  // Trace dans les logs Vercel pour vérification.
  console.log("[CRON emails — SIMULATION]", JSON.stringify(report.resume));

  return NextResponse.json(report);
}
