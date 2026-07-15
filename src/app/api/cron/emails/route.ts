import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Cron quotidien des emails automatiques.
//
// MODES (sécurité anti-spam) :
//   • (aucun paramètre)  → SIMULATION : calcule et liste, n'envoie rien.
//                          C'est ce que fait le cron quotidien tant que
//                          ENVOI_AUTO_ACTIF = false.
//   • ?test=1            → TEST : envoie POUR DE VRAI, mais tous les emails sont
//                          redirigés vers TON adresse (AUTH_EMAIL). Aucun client
//                          n'est contacté. Sert à valider le rendu.
//   • ?send=1            → RÉEL : envoie vraiment aux clients (déclenchement manuel).
//
// ANTI-DOUBLON : la colonne prestations.relance_devis_niveau (0→3) mémorise la
// dernière relance envoyée. On n'envoie jamais deux fois le même niveau.
//
// Sécurité d'accès : secret CRON_SECRET (header Bearer envoyé par Vercel Cron,
// ou ?key=<secret> pour un test manuel).
// ─────────────────────────────────────────────────────────────────────────────

const RELANCE_JOURS    = [3, 5, 7]; // relances devis à J+3, J+5, J+7
const RELANCE_AGE_MAX  = 10;        // au-delà : plus aucun email auto → "à appeler"
const AVIS_JOURS       = 2;         // demande d'avis à J+2 (48h) — armée à l'étape 3
const DONE_STATUTS     = ["CONFIRMÉ", "PAYÉ", "TERMINÉ"];

// Le cron quotidien reste en simulation tant que ce drapeau est false.
// On le passera à true une fois le rendu validé (étape 2 bis).
const ENVOI_AUTO_ACTIF = false;

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

// Niveau de relance attendu pour un devis de cet âge (0 = aucune).
function niveauCible(age: number): number {
  if (age >= 7) return 3;
  if (age >= 5) return 2;
  if (age >= 3) return 1;
  return 0;
}

function getCronSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) {
    if (/^cron_?secret$/i.test(k) && v) return v;
  }
  return undefined;
}

function authorize(req: Request): { ok: boolean; reason?: string } {
  const secret = getCronSecret();
  if (!secret) return { ok: false, reason: "CRON_SECRET non configuré sur Vercel" };
  const auth = req.headers.get("authorization");
  const key  = new URL(req.url).searchParams.get("key");
  if (auth === `Bearer ${secret}` || key === secret) return { ok: true };
  return { ok: false, reason: "Non autorisé" };
}

// ─── Envoi Gmail ──────────────────────────────────────────────────────────────
async function getSetting(key: string, envFallback?: string): Promise<string | null> {
  if (envFallback) return envFallback;
  if (!supabase) return null;
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) || null;
}

async function getGmailTransporter() {
  const user = await getSetting("gmail_user", process.env.GMAIL_USER);
  const pass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) return null;
  return { transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }), user };
}

// ─── Contenu de l'email de relance ────────────────────────────────────────────
const ACCROCHE: Record<number, { objet: string; intro: string }> = {
  1: {
    objet: "Votre devis KinouClean",
    intro: "Avez-vous eu le temps de consulter le devis que nous vous avons transmis ?",
  },
  2: {
    objet: "Votre devis KinouClean — petite relance",
    intro: "Nous revenons vers vous au sujet de votre devis, resté sans réponse pour le moment.",
  },
  3: {
    objet: "Votre devis KinouClean — dernier rappel",
    intro: "Sauf erreur de notre part, votre devis est toujours en attente. C'est notre dernier message à ce sujet.",
  },
};

function buildRelanceHtml(d: { prenom: string; typePresta: string; prix: string; niveau: number }): string {
  const { intro } = ACCROCHE[d.niveau] ?? ACCROCHE[1];
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#1C3557;padding:28px 32px;">
          <div style="color:#ffffff;font-size:20px;font-weight:bold;">KinouClean</div>
          <div style="color:rgba(255,255,255,0.6);font-size:11px;letter-spacing:2px;margin-top:4px;">NETTOYAGE PROFESSIONNEL À DOMICILE</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;color:#1F2937;margin:0 0 16px;">Bonjour ${d.prenom || ""},</p>
          <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 20px;">${intro}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;padding:16px;margin:0 0 20px;">
            <tr><td style="font-size:14px;color:#4B5563;line-height:1.8;">
              🧹 <strong>Prestation :</strong> ${d.typePresta || "—"}<br/>
              💶 <strong>Montant :</strong> ${d.prix ? `${d.prix} €` : "—"}
            </td></tr>
          </table>
          <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 20px;">
            Si vous souhaitez avancer, répondez simplement à cet email ou appelez-nous : nous fixerons une date qui vous arrange.
            Une question, un ajustement du devis ? Nous sommes à votre écoute.
          </p>
          <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0;">Belle journée,<br/><strong>L'équipe KinouClean</strong></p>
        </td></tr>
        <tr><td style="background:#1C3557;padding:16px 32px;text-align:center;">
          <div style="color:rgba(255,255,255,0.6);font-size:11px;">KinouClean · Organisme agréé SAP n° D3289580</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const params   = new URL(req.url).searchParams;
  const mode: "simulation" | "test" | "reel" =
    params.get("test") === "1" ? "test"
    : params.get("send") === "1" ? "reel"
    : ENVOI_AUTO_ACTIF ? "reel" : "simulation";

  const testEmail = process.env.AUTH_EMAIL || null;
  if (mode === "test" && !testEmail) {
    return NextResponse.json({ error: "AUTH_EMAIL introuvable : impossible d'envoyer le test" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("prestations")
    .select("id, prix, statut, created_at, date_intervention, type_prestation, relance_devis_niveau, clients(prenom, nom, email)")
    .eq("archive", false);

  if (error) {
    const manqueColonne = /relance_devis_niveau/.test(error.message);
    return NextResponse.json({
      error: manqueColonne
        ? "Colonnes manquantes : exécute d'abord le SQL supabase/migrations/002_emails_auto.sql dans Supabase."
        : error.message,
    }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data || [];

  const envoyes:  unknown[] = [];
  const aEnvoyer: unknown[] = [];
  const aAppeler: unknown[] = [];
  const demandeAvis: unknown[] = [];
  const erreurs:  unknown[] = [];

  const gmail = mode === "simulation" ? null : await getGmailTransporter();
  if (mode !== "simulation" && !gmail) {
    return NextResponse.json({
      error: "Gmail non connecté : va dans Configuration → Connexion Gmail (adresse + mot de passe d'application).",
    }, { status: 503 });
  }

  for (const p of rows) {
    const client = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
    const nom    = `${client.prenom || ""} ${client.nom || ""}`.trim() || "(client sans nom)";
    const email  = client.email || null;
    const prix   = parseFloat(p.prix);

    const devisExiste = !isNaN(prix) && prix > 0;
    const aUneDate    = !!(p.date_intervention && String(p.date_intervention).trim());
    const clos        = DONE_STATUTS.includes(p.statut) || p.statut === "ANNULÉ";

    // ── Relance devis ──
    if (devisExiste && !aUneDate && !clos) {
      const age = daysSince(p.created_at);
      if (age != null && age > RELANCE_AGE_MAX) {
        aAppeler.push({ nom, email, prix, ageJours: age });
      } else if (age != null && age >= RELANCE_JOURS[0]) {
        const cible  = niveauCible(age);
        const actuel = Number(p.relance_devis_niveau ?? 0);
        if (cible > actuel) {
          const cible_ = cible;
          const info = { nom, email, prix, ageJours: age, niveau: cible_ };

          if (!email) {
            aEnvoyer.push({ ...info, bloque: "pas d'email" });
          } else if (mode === "simulation") {
            aEnvoyer.push(info);
          } else {
            const dest = mode === "test" ? testEmail! : email;
            try {
              await gmail!.transporter.sendMail({
                from   : `"KinouClean" <${gmail!.user}>`,
                to     : dest,
                subject: (ACCROCHE[cible_] ?? ACCROCHE[1]).objet + (mode === "test" ? ` [TEST — destiné à ${email}]` : ""),
                html   : buildRelanceHtml({ prenom: client.prenom || "", typePresta: p.type_prestation || "", prix: p.prix, niveau: cible_ }),
              });
              // En mode test on NE marque PAS comme envoyé (pour pouvoir retester).
              if (mode === "reel") {
                await supabase.from("prestations").update({ relance_devis_niveau: cible_ }).eq("id", p.id);
              }
              envoyes.push({ ...info, envoyeA: dest });
            } catch (e: unknown) {
              erreurs.push({ ...info, erreur: e instanceof Error ? e.message : "Erreur envoi" });
            }
          }
        }
      }
    }

    // ── Demande d'avis (armée à l'étape 3 — listée seulement) ──
    if (DONE_STATUTS.includes(p.statut)) {
      const age = daysSince(p.date_intervention);
      if (age != null && age === AVIS_JOURS) {
        demandeAvis.push({ nom, email, prestation: p.type_prestation || "—", dateIntervention: p.date_intervention });
      }
    }
  }

  const report = {
    mode:
      mode === "simulation" ? "🧪 SIMULATION — aucun email envoyé"
      : mode === "test"     ? `✉️ TEST — tout est envoyé à ${testEmail} (aucun client contacté, rien n'est marqué comme envoyé)`
      :                       "🚀 RÉEL — emails envoyés aux clients",
    executeLe: new Date().toISOString(),
    reglages: { relanceJours: RELANCE_JOURS, relanceAgeMax: RELANCE_AGE_MAX, avisJours: AVIS_JOURS, envoiAutoQuotidien: ENVOI_AUTO_ACTIF },
    resume:
      mode === "simulation"
        ? `${aEnvoyer.length} relance(s) partiraient. ${aAppeler.length} devis à appeler (>J+${RELANCE_AGE_MAX}). ${demandeAvis.length} demande(s) d'avis (non armées).`
        : `${envoyes.length} relance(s) envoyée(s), ${erreurs.length} erreur(s). ${aAppeler.length} devis à appeler.`,
    relancesEnvoyees: envoyes,
    relancesAEnvoyer: aEnvoyer,
    erreurs,
    aAppeler,
    demandeAvis,
  };

  console.log("[CRON emails]", mode, "|", report.resume);
  return NextResponse.json(report);
}
