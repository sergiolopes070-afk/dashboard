// ============================================================
// KINOUCLEAN DASHBOARD – Calculs financiers (source unique)
// ------------------------------------------------------------
// Toutes les pages (accueil, pilotage, dépenses, historique, API dashboard)
// passent par ce module pour que le CA, les commissions, les charges et le
// bénéfice d'une période soient IDENTIQUES partout.
//
// Règles :
//  • CA réalisé   = prestations ARCHIVÉES hors annulations (estAnnulation),
//                   dont la date d'intervention (JJ/MM/AAAA) tombe dans la période.
//  • Commission   = par prestation : "%" → prix × val / 100, "€" → val.
//  • Charges      = ponctuelles datées dans la période
//                 + mensuelles × nb d'occurrences mensuelles depuis leur date de début
//                   (au prorata des jours si la période est plus courte qu'un mois).
//  • Bénéfice net = CA réalisé − commissions − charges.
//  • CA prévu     = prestations NON archivées à date future (jamais ajouté au CA réalisé).
//
// Fonctions pures, sans import serveur → utilisable côté client comme côté API.
// Dates de période au format ISO "AAAA-MM-JJ", bornes incluses.
// ============================================================

import { Prestation, Depense, estAnnulation, STATUT_ANNULE } from "./constants";
import { isoParis } from "./dateParis";

// ─── Dates ───────────────────────────────────────────────────────────────────

/** "JJ/MM/AAAA" → "AAAA-MM-JJ" ("" si invalide). */
export function frDateToIso(fr?: string | null): string {
  if (!fr) return "";
  const p = fr.split("/");
  if (p.length !== 3) return "";
  return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
}

/** Date locale → "AAAA-MM-JJ" (sans le décalage UTC de toISOString). */
export function isoLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** iso ∈ [debut, fin] (bornes incluses). Une date vide n'est jamais dans la période. */
export function inPeriode(iso: string, debut: string, fin: string): boolean {
  return !!iso && iso >= debut && iso <= fin;
}

/** Bornes d'un mois (mois 0-11). */
export function periodeMois(annee: number, mois: number): { debut: string; fin: string } {
  const dernier = new Date(annee, mois + 1, 0).getDate();
  const mm = String(mois + 1).padStart(2, "0");
  return { debut: `${annee}-${mm}-01`, fin: `${annee}-${mm}-${String(dernier).padStart(2, "0")}` };
}

/** Nombre de jours (inclus) entre deux dates ISO. */
export function nbJours(debut: string, fin: string): number {
  const a = new Date(debut + "T00:00:00").getTime();
  const b = new Date(fin + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

// ─── Prestations ─────────────────────────────────────────────────────────────

/** Prix d'une prestation (0 si vide/invalide). */
export const prixPresta = (p: Prestation) => parseFloat(p.prix) || 0;

/** Commission prestataire d'une prestation. */
export function commissionPresta(p: Prestation): number {
  const v = parseFloat(p.commission) || 0;
  return (p.commissionType || "%") === "%" ? prixPresta(p) * v / 100 : v;
}

/** Prestation archivée qui compte dans le CA (= pas une annulation). */
export const estRealisee = (p: Prestation) => !estAnnulation(p.archiveReason);

/** Prestations archivées réalisées, filtrées sur la période si fournie. */
export function prestationsRealisees(archive: Prestation[], debut?: string, fin?: string): Prestation[] {
  return archive.filter(p => estRealisee(p) && (debut == null || fin == null || inPeriode(frDateToIso(p.date), debut, fin)));
}

/** CA réalisé (archivé hors annulations), sur la période si fournie. */
export function caRealise(archive: Prestation[], debut?: string, fin?: string): number {
  return prestationsRealisees(archive, debut, fin).reduce((s, p) => s + prixPresta(p), 0);
}

/**
 * CA prévu : prestations NON archivées dont la date est aujourd'hui ou plus tard
 * (hors statut ANNULÉ). Chiffre séparé, jamais ajouté au CA réalisé.
 */
// Défaut = aujourd'hui à PARIS (sur le serveur UTC, isoLocal() donnait la veille entre 0 h et 2 h).
export function caPrevu(prestations: Prestation[], aPartirDe: string = isoParis()): { ca: number; nb: number } {
  const liste = prestations.filter(p => p.statut !== STATUT_ANNULE && frDateToIso(p.date) >= aPartirDe && !!frDateToIso(p.date));
  return { ca: liste.reduce((s, p) => s + prixPresta(p), 0), nb: liste.length };
}

// ─── Charges ─────────────────────────────────────────────────────────────────

/**
 * Pour une dépense mensuelle, nombre de fois où elle tombe dans [debut, fin],
 * à partir de sa date de début (jamais avant).
 * Ex : dépense créée le 15 jan, période fév→mars → 2 occurrences (15 fév + 15 mar).
 * Jour > fin de mois (ex. 31) → dernier jour du mois.
 */
export function countMonthlyOccurrences(expenseIso: string, debut: string, fin: string): number {
  if (!expenseIso) return 0;
  const expDay = parseInt(expenseIso.slice(8, 10), 10);
  const start  = new Date(debut + "T00:00:00");
  const end    = new Date(fin   + "T00:00:00");
  let count = 0;
  const cur  = new Date(start.getFullYear(), start.getMonth(), 1);
  const endM = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endM) {
    const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const day     = Math.min(expDay, lastDay);
    const occIso  = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (occIso >= debut && occIso <= fin && occIso >= expenseIso) count++;
    cur.setMonth(cur.getMonth() + 1);
  }
  return count;
}

export interface OptionsCharges {
  /**
   * Proratiser les charges mensuelles au jour près (montant × jours / jours du mois).
   * Par défaut : oui si la période fait moins de 28 jours (vue semaine).
   */
  prorata?: boolean;
}

const prorataAuto = (debut: string, fin: string, o?: OptionsCharges) => o?.prorata ?? nbJours(debut, fin) < 28;

/** Montant d'UNE dépense imputé à la période. */
export function chargeDepense(d: Depense, debut: string, fin: string, o?: OptionsCharges): number {
  const montant = Number(d.montant) || 0;
  if (d.type !== "mensuel") return inPeriode(d.date, debut, fin) ? montant : 0;
  if (!prorataAuto(debut, fin, o)) return montant * countMonthlyOccurrences(d.date, debut, fin);
  // Prorata : chaque jour (depuis le début de la charge) vaut montant / jours du mois
  const from = d.date && d.date > debut ? d.date : debut;
  if (!d.date || from > fin) return 0;
  let total = 0;
  const cur = new Date(from + "T00:00:00");
  const end = new Date(fin + "T00:00:00");
  while (cur <= end) {
    total += montant / new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

/** Dépenses ayant un montant imputé sur la période. */
export function depensesDansPeriode(depenses: Depense[], debut: string, fin: string, o?: OptionsCharges): Depense[] {
  return depenses.filter(d => chargeDepense(d, debut, fin, o) > 0);
}

/** Total des charges de la période. */
export function chargesPeriode(depenses: Depense[], debut: string, fin: string, o?: OptionsCharges): number {
  return depenses.reduce((s, d) => s + chargeDepense(d, debut, fin, o), 0);
}

/** Charges de la période par catégorie. */
export function chargesParCategorie(depenses: Depense[], debut: string, fin: string, o?: OptionsCharges): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of depenses) {
    const v = chargeDepense(d, debut, fin, o);
    if (v > 0) m[d.categorie || "Autre"] = (m[d.categorie || "Autre"] || 0) + v;
  }
  return m;
}

// ─── Bilan ───────────────────────────────────────────────────────────────────

export interface Bilan {
  ca: number;           // CA réalisé
  commissions: number;  // commissions prestataires sur ce CA
  charges: number;      // dépenses de la période
  benefice: number;     // ca − commissions − charges
  marge: number | null; // bénéfice / CA × 100 (null si CA nul)
  nb: number;           // nb de prestations réalisées
}

/** Bilan complet d'une période [debut, fin] (ISO, inclus). */
export function bilanPeriode({ archive, depenses, debut, fin, prorata }: {
  archive: Prestation[]; depenses: Depense[]; debut: string; fin: string; prorata?: boolean;
}): Bilan {
  const realisees = prestationsRealisees(archive, debut, fin);
  const ca          = realisees.reduce((s, p) => s + prixPresta(p), 0);
  const commissions = realisees.reduce((s, p) => s + commissionPresta(p), 0);
  const charges     = chargesPeriode(depenses, debut, fin, { prorata });
  const benefice    = ca - commissions - charges;
  return { ca, commissions, charges, benefice, marge: ca > 0 ? (benefice / ca) * 100 : null, nb: realisees.length };
}

/**
 * Bilan mois par mois d'une année. Les mois sont coupés à `jusqua` (aujourd'hui
 * par défaut) : la somme des 12 mois = bilanPeriode(1er janvier → jusqua).
 */
export function bilanParMois(archive: Prestation[], depenses: Depense[], annee: number, jusqua: string = isoLocal()): (Bilan & { mois: number })[] {
  return Array.from({ length: 12 }, (_, mois) => {
    const { debut, fin } = periodeMois(annee, mois);
    const finEff = fin < jusqua ? fin : jusqua;
    if (finEff < debut) return { mois, ca: 0, commissions: 0, charges: 0, benefice: 0, marge: null, nb: 0 };
    return { mois, ...bilanPeriode({ archive, depenses, debut, fin: finEff, prorata: false }) };
  });
}

// ─── Affichage ───────────────────────────────────────────────────────────────

/** Montant KPI au format français : 1234.5 → "1 235 €" (signe "+" optionnel). */
export function formatMontant(n: number, opts?: { signe?: boolean; decimales?: number }): string {
  const dec = opts?.decimales ?? 0;
  const v = Number(n.toFixed(dec)) || 0; // évite "-0 €"
  const txt = v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${opts?.signe && v > 0 ? "+" : ""}${txt} €`;
}
