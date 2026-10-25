// ─────────────────────────────────────────────────────────────────────────────
// Congés / indisponibilités des prestataires : stockés JOUR PAR JOUR
// ({ date: "YYYY-MM-DD", debut, fin } — debut/fin vides = journée entière),
// mais affichés par PLAGES : « du 9 au 14 déc. » au lieu de 6 lignes.
// Module sans dépendance serveur (pages admin, espace pro, routes API).
// ─────────────────────────────────────────────────────────────────────────────

export interface IndispoJour { date: string; debut: string; fin: string }
export interface PlageIndispo { start: string; end: string; debut?: string; fin?: string; partiel: boolean; jours: string[] }

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const lendemain = (iso: string) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + 1); return isoLocal(d); };

// Tous les jours de `du` à `au` inclus (max 92 jours, garde-fou contre une erreur de saisie).
export function joursEntre(du: string, au: string): string[] {
  const jours: string[] = [];
  for (let j = du; j <= au && jours.length < 92; j = lendemain(j)) jours.push(j);
  return jours;
}

// Fusionne les journées entières consécutives en plages ; les créneaux partiels restent à part.
export function grouperIndispos(liste: IndispoJour[]): PlageIndispo[] {
  const entiers = Array.from(new Set(liste.filter(x => !x.debut && !x.fin).map(x => x.date))).sort();
  const plages: PlageIndispo[] = [];
  for (const date of entiers) {
    const der = plages[plages.length - 1];
    if (der && lendemain(der.end) === date) { der.end = date; der.jours.push(date); }
    else plages.push({ start: date, end: date, partiel: false, jours: [date] });
  }
  const partiels = liste.filter(x => x.debut || x.fin)
    .map(x => ({ start: x.date, end: x.date, debut: x.debut, fin: x.fin, partiel: true, jours: [x.date] }));
  return [...plages, ...partiels].sort((a, b) => (a.start + (a.debut || "")).localeCompare(b.start + (b.debut || "")));
}

// « le 10 déc. » / « du 10 au 14 déc. » / « du 30 nov. au 2 déc. » (+ créneau si partiel).
export function libellePlage(p: { start: string; end: string; debut?: string; fin?: string; partiel?: boolean }): string {
  const j = (iso: string, avecMois: boolean) =>
    new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", avecMois ? { day: "numeric", month: "short" } : { day: "numeric" });
  const dates = p.start === p.end ? `le ${j(p.start, true)}` : `du ${j(p.start, p.start.slice(0, 7) !== p.end.slice(0, 7))} au ${j(p.end, true)}`;
  return p.partiel ? `${dates} · ${p.debut || "…"}–${p.fin || "…"}` : dates;
}
