// ─────────────────────────────────────────────────────────────────────────────
// Rapprochement client ↔ inscrit à l'Avance Immédiate (sans dépendance serveur :
// utilisable dans les pages comme dans les routes API).
//   • Téléphone : 9 derniers chiffres → « 06 81… », « 0681… » et « +33 6 81… » matchent.
//   • Email     : minuscules, sans espaces.
//   • Nom       : prénom + nom sans accents ni civilité, ordre indifférent
//                 (« Gharib Chloé » = « Chloé GHARIB »). Réservé à l'AFFICHAGE du
//                 badge : un homonyme ne doit jamais recevoir un mail « avance ».
// ─────────────────────────────────────────────────────────────────────────────

export const telCle = (t?: string | null) => {
  const d = (t || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
};

export const emailCle = (e?: string | null) => (e || "").trim().toLowerCase();

const CIVILITES = new Set(["mme", "madame", "m", "mr", "monsieur", "mlle", "mademoiselle"]);

export function nomCle(...parts: (string | null | undefined)[]): string {
  const mots = parts.join(" ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(m => m.length > 1 && !CIVILITES.has(m));
  // Il faut au moins un prénom ET un nom pour éviter les faux positifs.
  return mots.length >= 2 ? mots.sort().join(" ") : "";
}

export interface InscritsIndex { tels: Set<string>; emails: Set<string>; noms: Set<string> }

export const indexVide = (): InscritsIndex => ({ tels: new Set(), emails: new Set(), noms: new Set() });

// Construit l'index à partir de la réponse de /api/avance/inscrits.
export function indexInscrits(d: { tels?: string[]; emails?: string[]; noms?: string[] } | null): InscritsIndex {
  return {
    tels  : new Set((d?.tels   || []).map(telCle).filter(Boolean)),
    emails: new Set((d?.emails || []).map(emailCle).filter(Boolean)),
    noms  : new Set((d?.noms   || []).filter(Boolean)),
  };
}

// Le client est-il inscrit ? Téléphone ou email d'abord, puis nom + prénom.
export function matchInscrit(
  idx: InscritsIndex,
  c: { tel?: string | null; email?: string | null; prenom?: string | null; nom?: string | null },
): boolean {
  const t = telCle(c.tel), e = emailCle(c.email), n = nomCle(c.prenom, c.nom);
  return (!!t && idx.tels.has(t)) || (!!e && idx.emails.has(e)) || (!!n && idx.noms.has(n));
}
