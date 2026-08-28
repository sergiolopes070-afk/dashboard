import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getSettingJSON, setSettingRaw } from "@/lib/settings";
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
type EtatPresta = { relance?: number; relanceStart?: string; avisEnvoye?: boolean; avisAnnule?: boolean; confirmEnvoye?: boolean; confirmDate?: string };
type Etat = Record<string, EtatPresta>;

async function lireEtat(): Promise<Etat> {
  return getSettingJSON<Etat>(ETAT_KEY, {});
}
async function ecrireEtat(etat: Etat): Promise<string | null> {
  return setSettingRaw(ETAT_KEY, JSON.stringify(etat));
}
async function lireFiscal(clientId: string): Promise<string | undefined> {
  const m = await getSettingJSON<Record<string, string>>("fiscal_clients", {});
  return m[clientId];
}

// GET ?prestationId=… → état de la séquence de relance pour l'UI.
export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const id = new URL(req.url).searchParams.get("prestationId");
  const etat = await lireEtat();
  // Sans prestationId → renvoie le niveau de relance de TOUTES les prestations
  // (pour afficher un badge dans le tableau sans ouvrir chaque prestation).
  if (!id) {
    // Ne renvoie un badge QUE pour les relances encore vivantes : prestation
    // existante, non archivée. Une prestation archivée/supprimée fige sa séquence
    // et ne doit plus afficher « Relance x/3 » (badge trompeur).
    const ids = Object.entries(etat).filter(([, e]) => e.relance).map(([pid]) => pid);
    const niveaux: Record<string, number> = {};
    if (ids.length && supabase) {
      const { data } = await supabase
        .from("prestations")
        .select("id")
        .in("id", ids)
        .eq("archive", false);
      const actifs = new Set((data || []).map(r => r.id as string));
      for (const pid of ids) {
        if (actifs.has(pid)) niveaux[pid] = etat[pid].relance as number;
      }
    }
    return NextResponse.json({ niveaux });
  }
  const e = etat[id] || {};
  return NextResponse.json({ relance: e.relance ?? 0, relanceStart: e.relanceStart ?? null, confirmEnvoye: !!e.confirmEnvoye });
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
