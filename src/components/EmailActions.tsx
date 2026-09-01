"use client";

import { useState, useEffect } from "react";
import { Mail, Bell, Loader2, MessageCircle, CheckCircle2, CalendarClock } from "lucide-react";

// Actions de contact client pour une prestation (email + WhatsApp), réutilisé
// dans la modale Prestations et le panneau détail Agenda.
//   • Besoin d'infos  : email OU WhatsApp (client injoignable / infos manquantes).
//   • Relance devis   : email (démarre la séquence auto suivie) OU WhatsApp (ponctuel).
// L'email de relance amorce la séquence automatique (cron) ; le WhatsApp est un
// envoi manuel unique, non suivi.
const waTel = (tel: string) => tel.replace(/\s/g, "").replace(/^0/, "33");

function waLink(tel: string, message: string) {
  return `https://wa.me/${waTel(tel)}?text=${encodeURIComponent(message)}`;
}

export default function EmailActions({
  prestationId,
  clientEmail,
  clientTel,
  prenom = "",
  typePresta = "",
  prix,
  quantite = "",
  adresse = "",
  date = "",
  heure = "",
  compact = false,
}: {
  prestationId: string;
  clientEmail?: string | null;
  clientTel?: string | null;
  prenom?: string;
  typePresta?: string;
  prix?: string;
  quantite?: string;
  adresse?: string;
  date?: string;
  heure?: string;
  compact?: boolean;
}) {
  const [busy, setBusy]            = useState<"" | "relance" | "besoin_infos" | "confirmation" | "rappel">("");
  const [relanceNiveau, setNiveau] = useState<number | null>(null);
  const [confirmSent, setConfirmSent] = useState(false); // confirmation déjà envoyée ?
  const [rappelSent, setRappelSent]   = useState(false); // rappel de RDV déjà envoyé ?
  const [feedback, setFeedback]    = useState("");

  useEffect(() => {
    fetch(`/api/emails/action?prestationId=${prestationId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setNiveau(d.relance ?? 0); setConfirmSent(!!d.confirmEnvoye); setRappelSent(!!d.rappelEnvoye); } })
      .catch(() => {});
  }, [prestationId]);

  async function sendEmail(type: "relance" | "besoin_infos") {
    setBusy(type); setFeedback("");
    try {
      const res = await fetch("/api/emails/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prestationId, type }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      if (type === "relance") {
        setNiveau(d.relance ?? 1);
        setFeedback("✅ 1re relance envoyée par email — les suivantes s'enchaînent automatiquement.");
      } else {
        setFeedback("✅ Email « besoin d'infos » envoyé au client.");
      }
    } catch (e) {
      setFeedback(`❌ ${e instanceof Error ? e.message : "Erreur d'envoi"}`);
    } finally {
      setBusy("");
    }
  }

  // Récapitulatif de confirmation (même contenu que le mail auto de création).
  async function sendConfirmation() {
    setBusy("confirmation"); setFeedback("");
    try {
      const res = await fetch("/api/emails/send-confirmation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prestationId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setConfirmSent(true);
      setFeedback(`✅ Récapitulatif ${date ? "de confirmation " : ""}envoyé par email.`);
    } catch (e) {
      setFeedback(`❌ ${e instanceof Error ? e.message : "Erreur d'envoi"}`);
    } finally {
      setBusy("");
    }
  }

  // Rappel de rendez-vous + inscription avance immédiate (email).
  async function sendRappel() {
    setBusy("rappel"); setFeedback("");
    try {
      const res = await fetch("/api/emails/send-rappel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prestationId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setRappelSent(true);
      setFeedback("✅ Rappel de RDV + lien d'inscription envoyé par email.");
    } catch (e) {
      setFeedback(`❌ ${e instanceof Error ? e.message : "Erreur d'envoi"}`);
    } finally {
      setBusy("");
    }
  }

  // Messages WhatsApp (envoi manuel) — professionnels, sans emoji, vouvoiement.
  const msgBesoinInfos =
    `Bonjour Madame, Monsieur,\n\n` +
    `Nous sommes l'équipe KinouClean. Suite à votre demande transmise via notre formulaire de contact${typePresta ? ` (${typePresta})` : ""}, nous avons cherché à vous joindre par téléphone sans succès.\n\n` +
    `Afin d'établir votre devis, pourriez-vous nous préciser : la surface ou le nombre de pièces, l'état des lieux, les contraintes d'accès et la date souhaitée ?\n\n` +
    `Vous pouvez répondre directement à ce message.\n\nBien cordialement,\nL'équipe KinouClean`;
  const msgRelance =
    `Bonjour Madame, Monsieur,\n\n` +
    `Votre devis${typePresta ? ` pour ${typePresta.toLowerCase()}` : ""}${prix ? ` d'un montant de ${prix} €` : ""} est prêt. Souhaitez-vous que nous réservions votre créneau d'intervention ?\n\n` +
    `Nous restons à votre entière disposition.\n\nBien cordialement,\nL'équipe KinouClean`;

  // Récapitulatif WhatsApp — même logique que le mail : RDV calé → confirmé,
  // sinon → demande enregistrée.
  const rdvFixe   = !!date;
  const prestaWA  = [typePresta, quantite && quantite !== "1" ? `(${quantite})` : ""].filter(Boolean).join(" ") || "Prestation KinouClean";
  const msgConfirmation =
    `Bonjour ${prenom || ""} 👋,\n\n` +
    (rdvFixe
      ? `Votre rendez-vous KinouClean est confirmé ✅\n\n`
      : `Votre demande a bien été enregistrée chez KinouClean ✅\n\n`) +
    `📋 Récapitulatif :\n` +
    `🧹 Prestation : ${prestaWA}\n` +
    `📍 Adresse : ${adresse || "—"}\n` +
    `${rdvFixe ? "📅 Rendez-vous" : "📅 Date souhaitée"} : ${date || "—"}${heure ? ` à ${heure}` : ""}\n` +
    `💶 Montant : ${prix ? `${prix} €` : "—"}\n\n` +
    (rdvFixe
      ? `Pour toute modification ou question, répondez simplement à ce message ou appelez-nous au 06 20 79 97 47. À très bientôt !`
      : `Nous revenons vers vous très rapidement pour confirmer les détails. Pour toute question, appelez-nous au 06 20 79 97 47.`) +
    `\n\nL'équipe KinouClean`;

  // Rappel de RDV + avance immédiate — même contenu que l'email, SANS lien
  // (chaque client reçoit son lien personnel directement).
  const ligneInscription =
    `💡 Avance immédiate (−50 %) : pour ne régler que la moitié, pensez à finaliser votre inscription à l'aide du lien personnel qui vous a été transmis.`;
  const msgRappel =
    `Bonjour ${prenom || ""} 👋,\n\n` +
    `Votre rendez-vous KinouClean est bien programmé — petit rappel :\n\n` +
    `🧹 ${prestaWA}\n` +
    `📅 ${date || "—"}${heure ? ` à ${heure}` : ""}\n` +
    (adresse ? `📍 ${adresse}\n` : "") +
    `\n${ligneInscription}\n\n` +
    `En cas d'empêchement, prévenez-nous au plus tôt au 06 20 79 97 47. À très bientôt !\n\nL'équipe KinouClean`;

  const hasEmail = !!clientEmail;
  const hasTel   = !!clientTel;

  const emailBtn = "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50";
  const waBtn    = "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 text-xs font-medium transition-colors";

  if (!hasEmail && !hasTel) {
    return (
      <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
        Ni email ni téléphone pour ce client — impossible d&apos;envoyer.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Récapitulatif / confirmation — même contenu que le mail auto de création */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-gray-600 font-medium">
          {date ? "Confirmation RDV" : "Récap demande"}
        </span>
        <div className="flex gap-1.5">
          {hasEmail && (
            <button type="button" onClick={sendConfirmation} disabled={busy !== ""}
              title={confirmSent ? "Déjà envoyé — cliquer pour renvoyer" : "Envoyer la confirmation par email"}
              className={`${emailBtn} ${confirmSent ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" : "border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50"}`}>
              {busy === "confirmation" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} {confirmSent ? "Envoyé ✅" : "Email"}
            </button>
          )}
          {hasTel && (
            <a href={waLink(clientTel!, msgConfirmation)} target="_blank" rel="noopener noreferrer" className={waBtn}>
              <MessageCircle size={13} /> WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Rappel de RDV + inscription avance immédiate — visible si un RDV est calé */}
      {rdvFixe && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-gray-600 font-medium">Rappel RDV + inscription</span>
          <div className="flex gap-1.5">
            {hasEmail && (
              <button type="button" onClick={sendRappel} disabled={busy !== ""}
                title={rappelSent ? "Déjà envoyé — cliquer pour renvoyer" : "Envoyer le rappel de RDV + lien avance immédiate par email"}
                className={`${emailBtn} ${rappelSent ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" : "border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50"}`}>
                {busy === "rappel" ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />} {rappelSent ? "Envoyé ✅" : "Email"}
              </button>
            )}
            {hasTel && (
              <a href={waLink(clientTel!, msgRappel)} target="_blank" rel="noopener noreferrer" className={waBtn}>
                <MessageCircle size={13} /> WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {/* Besoin d'infos */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-gray-600 font-medium">Besoin d&apos;infos</span>
        <div className="flex gap-1.5">
          {hasEmail && (
            <button type="button" onClick={() => sendEmail("besoin_infos")} disabled={busy !== ""}
              className={`${emailBtn} border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50`}>
              {busy === "besoin_infos" ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Email
            </button>
          )}
          {hasTel && (
            <a href={waLink(clientTel!, msgBesoinInfos)} target="_blank" rel="noopener noreferrer" className={waBtn}>
              <MessageCircle size={13} /> WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Relance devis */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-gray-600 font-medium">
          Relance devis{(relanceNiveau ?? 0) >= 1 ? <span className="text-orange-600"> · niv. {relanceNiveau}/3</span> : ""}
        </span>
        <div className="flex gap-1.5">
          {hasEmail && (
            <button type="button" onClick={() => sendEmail("relance")} disabled={busy !== "" || (relanceNiveau ?? 0) >= 1}
              className={`${emailBtn} text-white bg-orange-500 border-orange-500 hover:bg-orange-600 disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200`}>
              {busy === "relance" ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
              {(relanceNiveau ?? 0) >= 1 ? "Démarrée" : "Démarrer (email)"}
            </button>
          )}
          {hasTel && (
            <a href={waLink(clientTel!, msgRelance)} target="_blank" rel="noopener noreferrer" className={waBtn}>
              <MessageCircle size={13} /> WhatsApp
            </a>
          )}
        </div>
      </div>

      {!compact && (
        <p className="text-[11px] text-gray-400 leading-snug">
          Email « Démarrer » lance la séquence de relances automatiques (J+2 / J+4). Le WhatsApp est un envoi manuel unique.
        </p>
      )}
      {feedback && (
        <p className={`text-xs font-medium ${feedback.startsWith("❌") ? "text-red-600" : "text-green-600"}`}>{feedback}</p>
      )}
    </div>
  );
}
