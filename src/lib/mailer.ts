// ─────────────────────────────────────────────────────────────────────────────
// Emails clients (relances devis, besoin d'infos) — templates + envoi Gmail.
// Partagé entre le cron (relances auto #2/#3) et /api/emails/action (déclenchés
// manuellement : besoin d'infos, 1re relance) pour garantir un contenu identique.
// ─────────────────────────────────────────────────────────────────────────────
import nodemailer from "nodemailer";
import { supabase } from "./supabase";

// Lit un réglage (settings) avec repli sur une variable d'environnement.
export async function getSetting(key: string, envFallback?: string): Promise<string | null> {
  if (envFallback) return envFallback;
  if (!supabase) return null;
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) || null;
}

// Transporteur Gmail (adresse + mot de passe d'application, via settings ou env).
export async function getGmailTransporter() {
  const user = await getSetting("gmail_user", process.env.GMAIL_USER);
  const pass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) return null;
  return { transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }), user };
}

// ─── Relance devis ─────────────────────────────────────────────────────────────
export const ACCROCHE: Record<number, { objet: string; intro: string }> = {
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

const FISCAL_BLOC: Record<string, string> = {
  avance: `<table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:10px;padding:14px 16px;margin:0 0 20px;"><tr><td style="font-size:14px;color:#1E40AF;line-height:1.6;">
    💡 <strong>Avance immédiate</strong> — vous ne réglez que <strong>50 %</strong> du montant : l'État prend l'autre moitié en charge, sans avance de trésorerie de votre part.
  </td></tr></table>`,
  credit: `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border-radius:10px;padding:14px 16px;margin:0 0 20px;"><tr><td style="font-size:14px;color:#9A3412;line-height:1.6;">
    💡 <strong>Crédit d'impôt 50 %</strong> — cette prestation à domicile ouvre droit au crédit d'impôt (art. 199 sexdecies du CGI) : votre coût réel est divisé par deux.
  </td></tr></table>`,
};

function shell(inner: string): string {
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
        <tr><td style="padding:32px;">${inner}</td></tr>
        <tr><td style="background:#1C3557;padding:16px 32px;text-align:center;">
          <div style="color:rgba(255,255,255,0.6);font-size:11px;">KinouClean · Organisme agréé SAP n° D3289580</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function buildRelanceHtml(d: { prenom: string; typePresta: string; prix: string; niveau: number; fiscal?: string }): string {
  const { intro } = ACCROCHE[d.niveau] ?? ACCROCHE[1];
  const fiscalBloc = (d.fiscal && FISCAL_BLOC[d.fiscal]) || "";
  return shell(`
    <p style="font-size:16px;color:#1F2937;margin:0 0 16px;">Bonjour ${d.prenom || ""},</p>
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 20px;">${intro}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;padding:16px;margin:0 0 20px;">
      <tr><td style="font-size:14px;color:#4B5563;line-height:1.8;">
        🧹 <strong>Prestation :</strong> ${d.typePresta || "—"}<br/>
        💶 <strong>Montant :</strong> ${d.prix ? `${d.prix} €` : "—"}
      </td></tr>
    </table>
    ${fiscalBloc}
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 20px;">
      Si vous souhaitez avancer, répondez simplement à cet email ou appelez-nous : nous fixerons une date qui vous arrange.
      Une question, un ajustement du devis ? Nous sommes à votre écoute.
    </p>
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0;">Belle journée,<br/><strong>L'équipe KinouClean</strong></p>`);
}

// ─── Besoin d'informations pour établir le devis (client injoignable) ───────────
export const BESOIN_INFOS_OBJET = "Nous avons essayé de vous joindre — KinouClean";

export function buildBesoinInfosHtml(d: { prenom: string; typePresta: string }): string {
  const presta = d.typePresta ? ` pour votre demande de <strong>${d.typePresta.toLowerCase()}</strong>` : "";
  return shell(`
    <p style="font-size:16px;color:#1F2937;margin:0 0 16px;">Bonjour ${d.prenom || ""},</p>
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 20px;">
      Nous avons essayé de vous joindre par téléphone${presta}, sans succès pour le moment.
    </p>
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 20px;">
      Afin d'établir un devis précis et adapté, nous aurions besoin de quelques informations complémentaires
      (surface / nombre de pièces, état, contraintes d'accès, date souhaitée…).
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;padding:16px;margin:0 0 20px;">
      <tr><td style="font-size:14px;color:#4B5563;line-height:1.7;">
        👉 <strong>Le plus simple :</strong> répondez directement à cet email, ou rappelez-nous au
        <strong>01 70 25 39 85</strong> — nous finaliserons votre devis ensemble en quelques minutes.
      </td></tr>
    </table>
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0;">À très vite,<br/><strong>L'équipe KinouClean</strong></p>`);
}
