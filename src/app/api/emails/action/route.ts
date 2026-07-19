import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import {
  getGmailTransporter, buildRelanceHtml, ACCROCHE,
  buildBesoinInfosHtml, BESOIN_INFOS_OBJET,
} from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Déclenchement MANUEL des emails clients depuis le dashboard :
//   • type "relance"      → envoie la 1re relance devis ET démarre la séquence
//                           auto (le cron enchaîne #2/#3 les jours suivants).
//   • type "besoin_infos" → email "on a essayé de vous joindre, il nous manque
//                           des infos pour établir votre devis".
// Suivi anti-doublon partagé avec le cron : settings/emails_auto_etat.
const ETAT_KEY = "emails_auto_etat";
type EtatPresta = { relance?: number; relanceStart?: string; avisEnvoye?: boolean; avisAnnule?: boolean };
type Etat = Record<string, EtatPresta>;

async function lireEtat(): Promise<Etat> {
  if (!supabase) return {};
  const { data } = await supabase.from("settings").select("value").eq("key", ETAT_KEY).maybeSingle();
  try { return data?.value ? JSON.parse(data.value as string) as Etat : {}; } catch { return {}; }
}
async function ecrireEtat(etat: Etat): Promise<string | null> {
  if (!supabase) return "Supabase non configuré";
  const { error } = await supabase.from("settings").upsert({ key: ETAT_KEY, value: JSON.stringify(etat) }, { onConflict: "key" });
  return error ? error.message : null;
}
async function lireFiscal(clientId: string): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data } = await supabase.from("settings").select("value").eq("key", "fiscal_clients").maybeSingle();
  try { const m = data?.value ? JSON.parse(data.value as string) : {}; return m[clientId]; } catch { return undefined; }
}

// GET ?prestationId=… → état de la séquence de relance pour l'UI.
export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const id = new URL(req.url).searchParams.get("prestationId");
  if (!id) return NextResponse.json({ error: "prestationId requis" }, { status: 400 });
  const etat = await lireEtat();
  const e = etat[id] || {};
  return NextResponse.json({ relance: e.relance ?? 0, relanceStart: e.relanceStart ?? null });
}

// POST { prestationId, type }
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { prestationId, type } = await req.json() as { prestationId?: string; type?: string };
  if (!prestationId) return NextResponse.json({ error: "prestationId requis" }, { status: 400 });
  if (type !== "relance" && type !== "besoin_infos") {
    return NextResponse.json({ error: "type invalide" }, { status: 400 });
  }

  // Charge la prestation + le client.
  const { data: p, error } = await supabase
    .from("prestations")
    .select("id, prix, type_prestation, client_id, clients(id, prenom, nom, email)")
    .eq("id", prestationId)
    .single();
  if (error || !p) return NextResponse.json({ error: "Prestation introuvable" }, { status: 404 });

  const client = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
  const email  = client.email as string | undefined;
  if (!email) return NextResponse.json({ error: "Ce client n'a pas d'adresse email." }, { status: 400 });

  const gmail = await getGmailTransporter();
  if (!gmail) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

  const prenom     = (client.prenom as string) || "";
  const typePresta = (p.type_prestation as string) || "";

  try {
    if (type === "besoin_infos") {
      await gmail.transporter.sendMail({
        from: `"KinouClean" <${gmail.user}>`, to: email,
        subject: BESOIN_INFOS_OBJET,
        html: buildBesoinInfosHtml({ prenom, typePresta }),
      });
      return NextResponse.json({ success: true, sentTo: email, type });
    }

    // type === "relance" : envoie la 1re relance et démarre la séquence.
    const fiscal = await lireFiscal((client.id as string) || (p.client_id as string));
    await gmail.transporter.sendMail({
      from: `"KinouClean" <${gmail.user}>`, to: email,
      subject: ACCROCHE[1].objet,
      html: buildRelanceHtml({ prenom, typePresta, prix: String(p.prix ?? ""), niveau: 1, fiscal }),
    });

    const etat = await lireEtat();
    etat[prestationId] = { ...(etat[prestationId] ?? {}), relance: 1, relanceStart: new Date().toISOString() };
    const errEtat = await ecrireEtat(etat);
    if (errEtat) return NextResponse.json({ error: `Email envoyé mais suivi non enregistré : ${errEtat}` }, { status: 500 });

    return NextResponse.json({ success: true, sentTo: email, type, relance: 1 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur d'envoi" }, { status: 500 });
  }
}
