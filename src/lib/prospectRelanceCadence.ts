// ─────────────────────────────────────────────────────────────────────────────
// Relances AUTOMATIQUES des prospects — calcul PUR (aucune dépendance serveur :
// utilisable par le cron, la route manuelle ET la page Prospects).
//
// Cadence (jours calendaires, heure de Paris) comptée depuis le DÉMARRAGE de la
// séquence = date d'envoi du devis (si devis envoyé), sinon de la demande d'infos :
//   R1 à J+2, R2 à J+5, R3 à J+9 — jamais un dimanche (reporté au lundi),
//   et au moins ECART_MIN_JOURS entre deux emails (cas d'une relance manuelle
//   tardive ou d'une séquence en retard : pas de rafale d'un jour sur l'autre).
// Clôture (statut PERDU) : CLOTURE_APRES_R3 jours après l'envoi de R3, sans réponse.
// ─────────────────────────────────────────────────────────────────────────────

export const CADENCE_JOURS = [2, 5, 9] as const;   // R1, R2, R3 depuis le démarrage
export const CLOTURE_APRES_R3 = 3;                  // clôture 3 j après R3
export const ECART_MIN_JOURS = 2;                   // écart mini entre 2 emails au même prospect
export const AGE_MAX_SEQUENCE = 30;                 // séquence démarrée il y a + de 30 j → plus de relance auto
export const PLAFOND_JOUR = 30;                     // max d'emails de relance auto par jour
export const RELANCES_AUTO_KEY = "relances_auto_actif";      // "false" = coupé (défaut : actif)
export const RELANCES_AUTO_DERNIER_KEY = "relances_auto_dernier"; // résultat du dernier passage (JSON)

const TZ = "Europe/Paris";

// Suivi commercial (settings/prospects_suivi) — champs utiles au calcul.
export interface SuiviAuto {
  devisEnvoye?: boolean; devisDate?: string; relanceNiveau?: number; relanceDate?: string; relanceDates?: string[];
  infosEnvoye?: boolean; infosDate?: string; infoRelanceNiveau?: number; infoRelanceDates?: string[];
  autoRelance?: boolean;      // false = relances auto désactivées pour CE prospect
  autoStop?: string;          // "reponse" = a répondu → plus aucune relance auto
  reponduLe?: string;         // ISO de la réponse détectée
  dernierEnvoiIso?: string;   // horodatage précis du dernier email envoyé (manuel ou auto)
}

export type Piste = "devis" | "infos";

export type EtatAuto =
  | { etat: "programmee"; piste: Piste; niveau: number; date: string }  // prochaine relance R{niveau} le {date}
  | { etat: "cloture"; piste: Piste; date: string }                     // R3 envoyée → clôture le {date}
  | { etat: "reponse"; le?: string }
  | { etat: "desactivee" }      // coupé pour ce prospect
  | { etat: "pause" }           // interrupteur global coupé
  | { etat: "terminee" }        // prospect converti / perdu
  | { etat: "sans_email" }
  | { etat: "deja_client" }
  | { etat: "non_demarree" }    // ni devis ni demande d'infos envoyés
  | { etat: "trop_ancienne"; piste: Piste; debut: string };

// ─── Dates "YYYY-MM-DD" ───────────────────────────────────────────────────────
export function jourParis(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}
export function addJours(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const estDimanche = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 0;
export const horsDimanche = (iso: string) => (estDimanche(iso) ? addJours(iso, 1) : iso);
const maxIso = (a: string, b: string) => (a > b ? a : b);

// "JJ/MM/AAAA", "YYYY-MM-DD" ou ISO complet → jour "YYYY-MM-DD" (Paris).
export function versJour(s?: string | null): string | null {
  if (!s) return null;
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : jourParis(d);
}

// Séquence en cours : piste (devis prioritaire), jour de démarrage, niveau atteint.
export function sequence(s: SuiviAuto | undefined): { piste: Piste; debut: string; niveau: number; dates: (string | undefined)[] } | null {
  const v = s || {};
  if (v.devisEnvoye) {
    const debut = versJour(v.devisDate);
    if (debut) return { piste: "devis", debut, niveau: Math.min(v.relanceNiveau || 0, 3), dates: v.relanceDates || [] };
  }
  if (v.infosEnvoye) {
    const debut = versJour(v.infosDate);
    if (debut) return { piste: "infos", debut, niveau: Math.min(v.infoRelanceNiveau || 0, 3), dates: v.infoRelanceDates || [] };
  }
  return null;
}

// Jour du DERNIER email envoyé au prospect (toutes pistes confondues).
export function dernierEnvoiJour(s: SuiviAuto | undefined): string | null {
  const v = s || {};
  const jours = [v.devisDate, v.infosDate, v.relanceDate, v.dernierEnvoiIso, ...(v.relanceDates || []), ...(v.infoRelanceDates || [])]
    .map(versJour).filter((x): x is string => !!x);
  return jours.length ? jours.reduce(maxIso) : null;
}

// État des relances auto d'un prospect + prochaine échéance.
export function etatAuto(
  p: { statut?: string; email?: string | null; dejaClient?: unknown },
  s: SuiviAuto | undefined,
  opts: { global: boolean; today?: string },
): EtatAuto {
  const v = s || {};
  const today = opts.today || jourParis();
  if (p.statut === "CONVERTI" || p.statut === "PERDU") return { etat: "terminee" };
  if (v.autoStop === "reponse") return { etat: "reponse", le: v.reponduLe };
  if (v.autoRelance === false) return { etat: "desactivee" };
  if (!opts.global) return { etat: "pause" };
  if (!(p.email || "").trim()) return { etat: "sans_email" };
  if (p.dejaClient) return { etat: "deja_client" };
  const seq = sequence(v);
  if (!seq) return { etat: "non_demarree" };

  const dernier = dernierEnvoiJour(v) || seq.debut;
  if (seq.niveau >= 3) {
    const r3 = versJour(seq.dates[2]) || versJour(v.relanceDate) || dernier;
    return { etat: "cloture", piste: seq.piste, date: addJours(r3, CLOTURE_APRES_R3) };
  }
  // Garde-fou : une vieille séquence (devis d'il y a plus d'un mois) n'est pas relancée.
  if (addJours(seq.debut, AGE_MAX_SEQUENCE) < today) return { etat: "trop_ancienne", piste: seq.piste, debut: seq.debut };

  const niveau = seq.niveau + 1;
  const theorique = addJours(seq.debut, CADENCE_JOURS[niveau - 1]);
  const date = horsDimanche(maxIso(theorique, addJours(dernier, ECART_MIN_JOURS)));
  return { etat: "programmee", piste: seq.piste, niveau, date };
}

// Relances auto actives (interrupteur global) : actif sauf valeur explicite "false".
export const autoGlobalActif = (raw: string | null | undefined) => raw !== "false";

// ─── Libellés (UI) ────────────────────────────────────────────────────────────
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
export const jjmmIso = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const jourCourt = (iso: string) => `${JOURS_COURTS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${jjmmIso(iso)}`;

// Jour où une relance due le `date` partira VRAIMENT : le passage du matin (cron
// 08:00 UTC ≈ 9 h à Paris) a déjà eu lieu après 9 h → au plus tôt demain. Affichage seul.
export function prochainPassage(date: string, today: string = jourParis()): string {
  const heureParis = Number(new Date().toLocaleString("fr-FR", { timeZone: TZ, hour: "2-digit", hour12: false }).slice(0, 2));
  const passage = heureParis < 9 ? today : addJours(today, 1);
  return horsDimanche(maxIso(date, passage));
}

export function libelleEtatAuto(e: EtatAuto, today: string = jourParis()): string {
  switch (e.etat) {
    case "programmee": {
      // Échéance passée ou du jour après le passage de 9 h → prochain passage (hors dimanche).
      const d = prochainPassage(e.date, today);
      return `R${e.niveau}${e.piste === "infos" ? " (demande d'infos)" : ""} le ${jourCourt(d)}`;
    }
    case "cloture": return `terminées — clôture auto le ${jourCourt(e.date < today ? today : e.date)} sans réponse`;
    case "reponse": { const j = versJour(e.le); return `arrêtées — a répondu${j ? ` le ${jjmmIso(j)}` : ""}`; }
    case "desactivee": return "désactivées pour ce prospect";
    case "pause": return "en pause (interrupteur global coupé dans Configuration)";
    case "terminee": return "terminées";
    case "sans_email": return "impossibles (pas d'email)";
    case "deja_client": return "désactivées (déjà client)";
    case "non_demarree": return "pas encore démarrées (envoie le devis ou la demande d'infos)";
    case "trop_ancienne": return `non programmées (séquence du ${jjmmIso(e.debut)}, trop ancienne)`;
  }
}
