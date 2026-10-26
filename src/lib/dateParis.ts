// ─────────────────────────────────────────────────────────────────────────────
// Dates « calendrier » à l'heure de Paris, identiques côté serveur (Vercel tourne
// en UTC) et côté navigateur. Avant, `toISOString()` donnait la date UTC : entre
// minuit et 1-2 h du matin, « demain » tombait sur aujourd'hui et un prospect
// relancé restait dans l'onglet « Aujourd'hui ».
// ─────────────────────────────────────────────────────────────────────────────

const TZ = "Europe/Paris";

// "YYYY-MM-DD" du jour à Paris, décalé de `jours` (0 = aujourd'hui, 1 = demain…).
export function isoParis(jours = 0): string {
  const auj = new Date().toLocaleDateString("sv-SE", { timeZone: TZ }); // sv-SE → AAAA-MM-JJ
  if (!jours) return auj;
  const d = new Date(auj + "T12:00:00Z"); // midi UTC : aucun risque de changer de jour
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

// "JJ/MM/AAAA" du jour à Paris (dates affichées dans le suivi des prospects).
export const frParis = (): string => new Date().toLocaleDateString("fr-FR", { timeZone: TZ });
