// ─────────────────────────────────────────────────────────────────────────────
// Messages WhatsApp des prospects — version GRATUITE (sans API) : le dashboard
// prépare le texte, le gérant l'envoie en UN geste via un lien wa.me prérempli.
// Pur et utilisable côté navigateur (aucune dépendance serveur).
//
// Même intention que les emails (src/lib/mailer.ts : buildBesoinInfosHtml,
// buildProspectInfosRelanceHtml, buildProspectRelanceHtml) mais style WhatsApp :
// texte brut, court (≤ 600 caractères), 1-2 emojis maximum.
//
// Étapes (clé stockée dans suivi.waEnvois) :
//   "infos-0"  demande d'infos initiale   "infos-R1..R3" relances demande d'infos
//   "devis-0"  devis envoyé par email     "devis-R1..R3" relances devis
// ─────────────────────────────────────────────────────────────────────────────

import { cassepropre, remiseAppliqueeProspect, RemiseAppliquee } from "./devisKinou";
import { versJour, jourParis, jjmmIso } from "./prospectRelanceCadence";

export type WaEtape = "infos-0" | "infos-R1" | "infos-R2" | "infos-R3" | "devis-0" | "devis-R1" | "devis-R2" | "devis-R3";
export const WA_ETAPES: WaEtape[] = ["infos-0", "infos-R1", "infos-R2", "infos-R3", "devis-0", "devis-R1", "devis-R2", "devis-R3"];
export const estWaEtape = (s: unknown): s is WaEtape => typeof s === "string" && (WA_ETAPES as string[]).includes(s);

const SIGNATURE = "L'équipe KinouClean";

// Données utiles à la rédaction (toutes facultatives sauf l'étape).
export interface WaDonnees {
  genre?: string; prenom?: string; nom?: string;
  prestation?: string;   // ex. « Nettoyage canapé »
  devisNum?: string;     // ex. « D-2026-042 »
  prix?: string;         // ex. « 120 » ou « 120,50 »
  devisDate?: string;    // JJ/MM/AAAA (date d'envoi du devis)
  remise?: RemiseAppliquee; // réduction DÉJÀ appliquée au devis → R3 la rappelle (pas de −10 %)
}

// ─── Numéro WhatsApp (mobiles français uniquement) ────────────────────────────
// Chiffres seuls ; 0X… → 33X… ; 0033… → 33… Seuls les mobiles 06/07 (+33 6/7)
// sont retenus — les fixes (01-05, 09) n'ont pas WhatsApp.
export function waMobile(tel?: string | null): string | null {
  let d = (tel || "").replace(/\D/g, "");
  if (d.startsWith("0033")) d = d.slice(2);
  else if (d.startsWith("0")) d = "33" + d.slice(1);
  return /^33[67]\d{8}$/.test(d) ? d : null;
}

// Lien wa.me prérempli (ou null si pas de mobile).
export function waLien(tel: string | null | undefined, texte: string): string | null {
  const num = waMobile(tel);
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(texte)}` : null;
}

// ─── Rédaction ────────────────────────────────────────────────────────────────
function civilite(genre?: string): string {
  const g = (genre || "").trim().toLowerCase();
  if (/^(mme|madame|f|femme|mlle|mademoiselle)/.test(g)) return "Madame";
  if (/^(m\.?|mr|monsieur|h|homme)/.test(g)) return "Monsieur";
  return "";
}
// « Bonjour Madame Dupont, » (comme les emails) ; à défaut le prénom ; sinon « Bonjour, ».
function bonjour(d: WaDonnees): string {
  const civ = civilite(d.genre), nom = (d.nom || "").trim(), prenom = (d.prenom || "").trim();
  if (civ && nom) return `Bonjour ${civ} ${cassepropre(nom)},`;
  if (prenom) return `Bonjour ${cassepropre(prenom)},`;
  return "Bonjour,";
}
const projet = (d: WaDonnees) => (d.prestation ? ` concernant votre projet de ${d.prestation.toLowerCase()}` : "");
const prixNum = (d: WaDonnees) => { const n = parseFloat((d.prix || "").replace(",", ".")); return !isNaN(n) && n > 0 ? n : null; };
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));
// « votre devis n° D-042 (120 €) »
function votreDevis(d: WaDonnees): string {
  const p = prixNum(d);
  return `votre devis${d.devisNum ? ` n° ${d.devisNum}` : ""}${p != null ? ` (${fmt(p)} €)` : ""}`;
}
const LISTE_INFOS =
  "• le type d'article (canapé, matelas, fauteuil, tapis…)\n" +
  "• le nombre de places ou les dimensions\n" +
  "• l'état (taches, salissures…)\n" +
  "• la date souhaitée et votre ville";

function corps(etape: WaEtape, d: WaDonnees): string {
  switch (etape) {
    case "infos-0":
      return `Nous avons bien reçu votre demande${projet(d)}, merci ! Nous avons essayé de vous joindre, sans succès.\n\n` +
        `Pour vous faire un devis précis, pourriez-vous nous indiquer :\n${LISTE_INFOS}\n\n` +
        "Une photo nous aide beaucoup 📸 Vous pouvez répondre directement ici.";
    case "infos-R1":
      return `Petit message de suivi${projet(d)}. Nous n'avons pas encore reçu vos précisions pour établir votre devis ` +
        "(type d'article, nombre de places ou dimensions, état, date et ville).\n\nUn simple message ici suffit 🙂";
    case "infos-R2":
      return `Sauf erreur, nous n'avons pas eu de retour à notre précédent message${projet(d)} (envoyé aussi par email).\n\n` +
        "Nous restons disponibles : quelques infos et une photo, et nous vous préparons un devis précis 🙂";
    case "infos-R3":
      return `Dernier petit message${projet(d)}. Sans nouvelles de votre part, nous clôturerons votre demande dans les prochains jours.\n\n` +
        "Un message suffit pour la rouvrir à tout moment 🙂";
    case "devis-0":
      return `Nous venons de vous envoyer ${votreDevis(d)} par email${d.prestation ? ` pour votre projet de ${d.prestation.toLowerCase()}` : ""} 📩\n\n` +
        "Pour réserver votre créneau ou pour toute question, répondez simplement ici.";
    case "devis-R1":
      return `${cap(votreDevis(d))}${d.prestation ? ` pour votre projet de ${d.prestation.toLowerCase()}` : ""} est prêt et vous attend dans vos emails.\n\n` +
        "Souhaitez-vous que nous réservions votre créneau d'intervention ? Répondez simplement ici 🙂";
    case "devis-R2": {
      const le = versJour(d.devisDate);
      return `Nous revenons vers vous concernant ${votreDevis(d)}${le ? `, envoyé par email le ${jjmmIso(le)}` : ", envoyé par email"}. ` +
        "Il arrive qu'un email passe inaperçu (pensez à vérifier vos spams).\n\n" +
        "Nous restons à votre disposition pour fixer une date qui vous convient 🙂";
    }
    case "devis-R3": {
      const r = d.remise && d.remise.montant > 0 ? d.remise : null;
      if (r) {
        return `Dernière relance concernant votre devis${d.devisNum ? ` n° ${d.devisNum}` : ""}, envoyé par email. ` +
          `Pour rappel, une réduction de ${fmt(r.montant)} € est déjà appliquée à votre devis : ${fmt(r.total)} € au lieu de ${fmt(r.sousTotal)} € 🎁\n\n` +
          "Répondez simplement ici pour réserver votre créneau.";
      }
      const p = prixNum(d);
      return `Dernière relance concernant ${votreDevis(d)}, envoyé par email. ` +
        `Pour vous aider à vous décider, nous vous offrons -10 %${p != null ? ` : ${fmt(p * 0.9)} € au lieu de ${fmt(p)} €` : ""} 🎁\n\n` +
        "Offre valable quelques jours : répondez simplement ici pour en profiter.";
    }
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Message complet prêt à envoyer (texte brut, ≤ 600 caractères).
export function waMessage(etape: WaEtape, d: WaDonnees): string {
  const txt = `${bonjour(d)}\n\n${corps(etape, d)}\n\n${SIGNATURE}`;
  return txt.length > 600 ? txt.slice(0, 597).trimEnd() + "…" : txt;
}

// Libellé humain de l'étape (journal + UI) : « Relance devis R2 ».
export function waLibelle(etape: WaEtape): string {
  switch (etape) {
    case "infos-0": return "Demande d'infos";
    case "devis-0": return "Annonce du devis";
    default: return `Relance ${etape.startsWith("devis") ? "devis" : "infos"} ${etape.slice(-2)}`;
  }
}

// ─── Étape WhatsApp à envoyer AUJOURD'HUI ────────────────────────────────────
// Règle : l'EMAIL de l'étape est parti aujourd'hui (auto ou manuel) et aucun
// WhatsApp n'a encore été noté pour cette étape aujourd'hui. Une seule étape par
// prospect (la plus avancée du jour) — jamais deux messages le même jour.
export interface WaSuivi {
  devisDate?: string; relanceDates?: string[]; infosDate?: string; infoRelanceDates?: string[];
  autoStop?: string; waEnvois?: Record<string, string>;
}
export function etapeWaDuJour(s: WaSuivi | undefined, today: string = jourParis()): WaEtape | null {
  const v = s || {};
  if (v.autoStop === "reponse") return null; // a répondu → pas de relance
  const auj = (x?: string) => versJour(x) === today;
  const r = v.relanceDates || [], ri = v.infoRelanceDates || [];
  const candidats: [boolean, WaEtape][] = [
    [auj(r[2]), "devis-R3"], [auj(r[1]), "devis-R2"], [auj(r[0]), "devis-R1"], [auj(v.devisDate), "devis-0"],
    [auj(ri[2]), "infos-R3"], [auj(ri[1]), "infos-R2"], [auj(ri[0]), "infos-R1"], [auj(v.infosDate), "infos-0"],
  ];
  const etape = candidats.find(([ok]) => ok)?.[1];
  if (!etape) return null;
  return versJour(v.waEnvois?.[etape]) === today ? null : etape;
}

// Prospect éligible : actif, pas déjà client, avec un mobile, étape du jour en attente.
export function waAEnvoyer(
  p: { statut?: string; tel?: string; dejaClient?: unknown; suivi?: WaSuivi },
  today: string = jourParis(),
): WaEtape | null {
  if (p.statut === "CONVERTI" || p.statut === "PERDU" || p.dejaClient || !waMobile(p.tel)) return null;
  return etapeWaDuJour(p.suivi, today);
}

// Données de rédaction depuis un prospect (forme /api/prospects).
export function waDonneesProspect(p: {
  genre?: string; prenom?: string; nom?: string; typePresta?: string; budget?: string;
  besoins?: { typePresta?: string; prix?: string; quantite?: unknown; nombre?: unknown }[];
  suivi?: { devisNum?: string; devisDate?: string; remise?: unknown };
}, remise?: RemiseAppliquee): WaDonnees {
  const b = Array.isArray(p.besoins) ? p.besoins[0] : undefined;
  return {
    genre: p.genre, prenom: p.prenom, nom: p.nom,
    prestation: b?.typePresta || p.typePresta || "",
    prix: b?.prix || p.budget || "",
    devisNum: p.suivi?.devisNum, devisDate: p.suivi?.devisDate,
    // Réduction déjà appliquée (suivi.remise) : explicite, sinon recalculée depuis
    // les besoins — mêmes montants que le devis (calcTotaux).
    remise: remise ?? remiseAppliqueeProspect(p.besoins, p.budget, p.typePresta, p.suivi?.remise),
  };
}

// ─── Messages clients (hors prospects) ───────────────────────────────────────
// Demande d'avis après prestation : même texte que le bouton « Copier message fin
// de prestation » (agenda + fiches clients). `lien` = page /avis/<id>?nom=…
export function waTexteAvis(d: { prenom?: string; prestation?: string; lien: string }): string {
  return `Bonjour ${(d.prenom || "").trim()} 👋,\n\n` +
    `J'espère que votre ${d.prestation ? `prestation de ${d.prestation}` : "prestation"} s'est très bien passée 😊.\n\n` +
    `Votre satisfaction est notre priorité et nous serions ravis d'avoir votre retour !\n\n` +
    `Si vous avez quelques instants, pourriez-vous laisser un avis ici ⭐ :\n${d.lien}\n\n` +
    `Merci infiniment pour votre confiance 🙏\n\nÀ très bientôt,\n${SIGNATURE}`;
}

// Rappel court d'un RDV à venir (date JJ/MM/AAAA, heure HH:MM — toutes facultatives).
export function waTexteRappelRdv(d: { prenom?: string; date?: string; heure?: string; adresse?: string }): string {
  const prenom = (d.prenom || "").trim();
  const quand = d.date ? `le ${d.date}${d.heure ? ` à ${d.heure}` : ""}` : d.heure ? `à ${d.heure}` : "";
  return `Bonjour${prenom ? ` ${prenom}` : ""},\n\n` +
    `Petit rappel de votre rendez-vous KinouClean${quand ? ` ${quand}` : ""} 🙂` +
    (d.adresse ? `\n📍 ${d.adresse}` : "") +
    `\n\nEn cas d'empêchement, merci de nous prévenir au plus tôt en répondant simplement ici.\n\nÀ très bientôt,\n${SIGNATURE}`;
}
