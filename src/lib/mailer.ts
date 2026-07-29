// ─────────────────────────────────────────────────────────────────────────────
// Emails clients (relances devis, besoin d'infos) — templates + envoi Gmail.
// Partagé entre le cron (relances auto #2/#3) et /api/emails/action (déclenchés
// manuellement : besoin d'infos, 1re relance) pour garantir un contenu identique.
// ─────────────────────────────────────────────────────────────────────────────
import nodemailer from "nodemailer";
import { getSettingRaw } from "./settings";

// Lit un réglage (settings) avec repli sur une variable d'environnement.
// Lecture FRAÎCHE en tableau (voir src/lib/settings.ts pour le pourquoi).
export async function getSetting(key: string, envFallback?: string): Promise<string | null> {
  if (envFallback) return envFallback;
  return getSettingRaw(key);
}

// Transporteur Gmail (adresse + mot de passe d'application, via settings ou env).
export async function getGmailTransporter() {
  const user = await getSetting("gmail_user", process.env.GMAIL_USER);
  const pass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) return null;
  return { transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }), user };
}

// ─── Relance devis (ton commercial, concis, orienté conversion) ─────────────────
const TEL = "06 20 79 97 47";
const TEL_LINK = "tel:0620799747";

export const ACCROCHE: Record<number, { objet: string; intro: string }> = {
  1: {
    objet: "Votre devis KinouClean est prêt",
    intro: "Votre devis a bien été établi et reste à votre disposition. Souhaitez-vous que nous réservions votre créneau d'intervention ?",
  },
  2: {
    objet: "Votre devis KinouClean — souhaitez-vous réserver ?",
    intro: "Nous revenons vers vous concernant votre devis. Nos disponibilités se réservent rapidement : nous serions ravis de bloquer le créneau qui vous convient.",
  },
  3: {
    objet: "Votre devis KinouClean — dernière relance",
    intro: "Sauf erreur de notre part, votre devis est toujours en attente. Il s'agit de notre dernière relance à ce sujet ; n'hésitez pas à nous solliciter, nous restons à votre disposition.",
  },
};

const FISCAL_BLOC: Record<string, string> = {
  avance: `<table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:10px;padding:14px 16px;margin:0 0 18px;"><tr><td style="font-size:14px;color:#1E40AF;line-height:1.6;">
    <strong>Avance immédiate</strong> — vous ne réglez que <strong>50 %</strong> du montant : l'État prend l'autre moitié en charge immédiatement, sans avance de trésorerie de votre part.
  </td></tr></table>`,
  credit: `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border-radius:10px;padding:14px 16px;margin:0 0 18px;"><tr><td style="font-size:14px;color:#9A3412;line-height:1.6;">
    <strong>Crédit d'impôt 50 %</strong> — cette prestation à domicile divise votre coût réel par deux (art. 199 sexdecies du CGI).
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
    <p style="font-size:16px;color:#1F2937;margin:0 0 14px;">Bonjour Madame, Monsieur,</p>
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 18px;">${intro}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;padding:16px;margin:0 0 18px;">
      <tr><td style="font-size:14px;color:#4B5563;line-height:1.8;">
        <strong>Prestation :</strong> ${d.typePresta || "—"}<br/>
        <strong>Montant :</strong> ${d.prix ? `${d.prix} €` : "—"}
      </td></tr>
    </table>
    ${fiscalBloc}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td align="center">
      <a href="${TEL_LINK}" style="display:inline-block;background:#1C3557;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:13px 30px;border-radius:10px;">Réserver mon créneau</a>
    </td></tr></table>
    <p style="font-size:14px;color:#6B7280;line-height:1.6;margin:0 0 18px;text-align:center;">
      ou répondez simplement à cet email — nous fixerons une date qui vous convient.
    </p>
    <p style="font-size:13px;color:#9CA3AF;line-height:1.7;margin:0;text-align:center;">
      Prestataires vérifiés · Satisfaction garantie · Intervention rapide<br/>
      <span style="color:#4B5563;">Pour toute question, contactez-nous au <strong>${TEL}</strong>.</span>
    </p>
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:18px 0 0;">Bien cordialement,<br/><strong>L'équipe KinouClean</strong></p>`);
}

// ─── Besoin d'informations pour établir le devis (suite au formulaire de contact) ─
export const BESOIN_INFOS_OBJET = "Votre demande de devis — informations complémentaires | KinouClean";

export function buildBesoinInfosHtml(d: { prenom: string; typePresta: string }): string {
  const presta = d.typePresta ? ` concernant votre projet de <strong>${d.typePresta.toLowerCase()}</strong>` : "";
  return shell(`
    <p style="font-size:16px;color:#1F2937;margin:0 0 16px;">Bonjour ${d.prenom || ""},</p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 16px;">
      Nous avons bien reçu votre demande transmise via notre <strong>formulaire de contact</strong>${presta}, et nous vous en remercions.
    </p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 16px;">
      Nous avons cherché à vous joindre par téléphone afin d'échanger sur votre besoin, sans parvenir à vous contacter pour le moment.
    </p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 12px;">
      Afin d'établir un <strong>devis précis et personnalisé</strong>, quelques précisions nous seraient utiles :
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;padding:18px 20px;margin:0 0 20px;">
      <tr><td style="font-size:14px;color:#374151;line-height:1.9;">
        • La <strong>surface</strong> concernée ou le <strong>nombre de pièces</strong><br/>
        • L'<strong>état</strong> des lieux / le niveau de salissure<br/>
        • Les éventuelles <strong>contraintes d'accès</strong> (étage, ascenseur, stationnement…)<br/>
        • La <strong>date</strong> ou la période souhaitée pour l'intervention
      </td></tr>
    </table>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 8px;">
      Vous pouvez simplement <strong>répondre à cet email</strong> avec ces éléments, ou nous joindre directement :
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="font-size:15px;color:#1C3557;line-height:1.8;font-weight:bold;">
        📞 06 20 79 97 47
      </td></tr>
    </table>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 4px;">
      Nous restons à votre entière disposition et reviendrons vers vous dans les meilleurs délais.
    </p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:16px 0 0;">
      Bien cordialement,<br/>
      <strong>L'équipe KinouClean</strong><br/>
      <span style="font-size:13px;color:#9CA3AF;">Nettoyage professionnel à domicile · Île-de-France</span>
    </p>`);
}

// ─── Demande d'avis (étoiles cliquables → page d'avis pré-notée) ────────────────
export const AVIS_OBJET = "Votre avis compte pour nous ⭐";

// `lienBase` = URL de la page d'avis avec ses paramètres (nom, prestation), SANS
// la note. Chaque étoile ajoute &note=N : la page redirige vers Google (≥4) ou
// ouvre un formulaire de commentaire (≤3).
export function buildAvisHtml(d: { prenom: string; typePresta: string; lienBase: string }): string {
  const sep = d.lienBase.includes("?") ? "&" : "?";
  const etoile = (n: number) =>
    `<a href="${d.lienBase}${sep}note=${n}" style="text-decoration:none;font-size:40px;line-height:1;color:#F59E0B;padding:0 4px;">★</a>`;
  return shell(`
    <p style="font-size:16px;color:#1F2937;margin:0 0 14px;">Bonjour ${d.prenom || ""},</p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 8px;">
      Merci de votre confiance pour votre prestation${d.typePresta ? ` de ${d.typePresta.toLowerCase()}` : ""} ✨.
    </p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 20px;">
      Votre satisfaction est notre priorité. En un clic, quelle note donneriez-vous à votre expérience ?
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr><td align="center">
      ${[1,2,3,4,5].map(etoile).join("")}
    </td></tr></table>
    <p style="font-size:13px;color:#9CA3AF;line-height:1.6;margin:0 0 24px;text-align:center;">
      Cliquez sur le nombre d'étoiles qui correspond à votre satisfaction.
    </p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0;">
      Merci infiniment pour le temps que vous nous accordez 🙏<br/><strong>L'équipe KinouClean</strong>
    </p>`);
}

// Message de rappel WhatsApp (RDV du lendemain), avec plusieurs prestations
// listées si le client en a plusieurs le même jour.
export function buildRappelMessage(d: { prenom: string; prestations: string[]; date: string; heure?: string; adresse?: string }): string {
  const liste = d.prestations.filter(Boolean).join(" + ") || "Prestation KinouClean";
  return (
    `Bonjour ${d.prenom || ""} 👋,\n\n` +
    `Petit rappel de votre rendez-vous KinouClean prévu demain :\n\n` +
    `🧹 ${liste}\n` +
    `📅 ${d.date || "demain"}${d.heure ? ` à ${d.heure}` : ""}\n` +
    (d.adresse ? `📍 ${d.adresse}\n` : "") +
    `\nEn cas d'empêchement, merci de nous prévenir au plus tôt. À demain !`
  );
}

// ─── Email de confirmation à la création (récapitulatif de la demande) ──────────
export function confirmationObjet(rdvFixe: boolean): string {
  return rdvFixe
    ? "✅ Votre rendez-vous KinouClean est confirmé"
    : "✅ Votre demande est bien enregistrée — KinouClean";
}
// Rétrocompat : objet par défaut.
export const CONFIRMATION_OBJET = confirmationObjet(false);

export function buildConfirmationHtml(d: {
  prenom: string; typePresta: string; quantite: string;
  adresse: string; date: string; heure: string; prix: string;
}): string {
  const presta = [d.typePresta, d.quantite && d.quantite !== "1" ? `(${d.quantite})` : ""].filter(Boolean).join(" ");
  const dateStr = [d.date, d.heure].filter(Boolean).join(" à ");
  const rdvFixe = !!d.date; // un rendez-vous est calé → tout est confirmé
  const ligne = (label: string, valeur: string) => `
    <tr><td style="padding:10px 14px;border-bottom:1px solid #eef0f4;font-size:14px;color:#6B7280;">${label}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #eef0f4;font-size:14px;color:#1F2937;font-weight:bold;">${valeur || "—"}</td></tr>`;

  // Intro + clôture adaptées : RDV fixé → confirmé, sinon → on recontacte.
  const intro = rdvFixe
    ? "Votre rendez-vous est confirmé. En voici le récapitulatif :"
    : "Nous avons bien enregistré votre demande. En voici le récapitulatif :";
  const cloture = rdvFixe
    ? `Pour toute <strong>modification</strong> ou question, répondez simplement à cet email ou appelez-nous au <strong>${TEL}</strong>. À très bientôt !`
    : `Nous revenons vers vous très rapidement pour confirmer les détails. Pour toute question, répondez simplement à cet email ou appelez-nous au <strong>${TEL}</strong>.`;

  return shell(`
    <p style="font-size:16px;color:#1F2937;margin:0 0 14px;">Bonjour ${d.prenom || ""},</p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 18px;">${intro}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;overflow:hidden;margin:0 0 20px;">
      ${ligne("Prestation", presta)}
      ${ligne(rdvFixe ? "Rendez-vous" : "Date souhaitée", dateStr)}
      ${ligne("Adresse", d.adresse)}
      ${ligne("Montant", d.prix ? `${d.prix} €` : "—")}
    </table>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:0 0 4px;">${cloture}</p>
    <p style="font-size:15px;color:#4B5563;line-height:1.7;margin:16px 0 0;">Bien cordialement,<br/><strong>L'équipe KinouClean</strong></p>`);
}

// Envoie l'email de confirmation via Gmail. Renvoie true si envoyé.
export async function sendConfirmationEmail(to: string, d: {
  prenom: string; typePresta: string; quantite: string;
  adresse: string; date: string; heure: string; prix: string;
}): Promise<boolean> {
  const gmail = await getGmailTransporter();
  if (!gmail) return false;
  await gmail.transporter.sendMail({
    from: `"KinouClean" <${gmail.user}>`, to,
    subject: confirmationObjet(!!d.date),
    html: buildConfirmationHtml(d),
  });
  return true;
}
