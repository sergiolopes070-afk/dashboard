"use client";
import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Prestation, Prestataire } from "@/lib/constants";

// ─── Palette de couleurs par prestataire ────────────────────────────────────
const PALETTE = [
  { bg: "#4285F4", light: "#DBEAFE", text: "#1E40AF" },
  { bg: "#EA4335", light: "#FEE2E2", text: "#991B1B" },
  { bg: "#34A853", light: "#DCFCE7", text: "#166534" },
  { bg: "#FBBC04", light: "#FEF9C3", text: "#854D0E" },
  { bg: "#8B5CF6", light: "#EDE9FE", text: "#5B21B6" },
  { bg: "#F97316", light: "#FFEDD5", text: "#9A3412" },
  { bg: "#06B6D4", light: "#CFFAFE", text: "#155E75" },
  { bg: "#EC4899", light: "#FCE7F3", text: "#9D174D" },
  { bg: "#10B981", light: "#D1FAE5", text: "#065F46" },
  { bg: "#6366F1", light: "#E0E7FF", text: "#3730A3" },
];

// ─── Helpers date ────────────────────────────────────────────────────────────
function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function frToDate(fr: string): Date | null {
  if (!fr) return null;
  const p = fr.split("/");
  if (p.length !== 3) return null;
  return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// ─── Composant principal ──────────────────────────────────────────────────────
export default function AgendaPage() {
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [showSansPresta, setShowSansPresta] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Prestation | null>(null);

  // Fetch data
  useEffect(() => {
    Promise.all([
      fetch("/api/prestations").then(r => r.json()),
      fetch("/api/prestataires").then(r => r.json()),
    ]).then(([prestas, prestas2]) => {
      setPrestations(Array.isArray(prestas) ? prestas : []);
      setPrestataires(Array.isArray(prestas2) ? prestas2 : []);
      // Init toutes cases cochées
      const init: Record<string, boolean> = {};
      (Array.isArray(prestas2) ? prestas2 : []).forEach((p: Prestataire) => {
        init[p.id] = true;
      });
      setChecked(init);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Couleur par prestataire
  const colorMap = useMemo(() => {
    const map: Record<string, typeof PALETTE[0]> = {};
    prestataires.forEach((p, i) => {
      map[p.id] = PALETTE[i % PALETTE.length];
    });
    return map;
  }, [prestataires]);

  // Id par nom
  const idByNom = useMemo(() => {
    const map: Record<string, string> = {};
    prestataires.forEach(p => { map[p.nom] = p.id; });
    return map;
  }, [prestataires]);

  // Les 7 jours de la semaine
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Filtrage des prestations visibles
  const visiblePrestations = useMemo(() => {
    return prestations.filter(p => {
      if (!p.date) return false;
      const pid = idByNom[p.prestataire];
      if (p.prestataire && pid) {
        return checked[pid] ?? false;
      }
      return showSansPresta;
    });
  }, [prestations, checked, showSansPresta, idByNom]);

  // Events par jour
  function eventsForDay(day: Date): Prestation[] {
    return visiblePrestations.filter(p => {
      const d = frToDate(p.date);
      return d && sameDay(d, day);
    }).sort((a, b) => (a.heure || "").localeCompare(b.heure || ""));
  }

  // Titre de semaine
  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    if (weekStart.getMonth() === end.getMonth()) {
      return `${weekStart.getDate()} – ${end.getDate()} ${MOIS[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return `${weekStart.getDate()} ${MOIS[weekStart.getMonth()]} – ${end.getDate()} ${MOIS[end.getMonth()]} ${weekStart.getFullYear()}`;
  }, [weekStart]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const toggleAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    prestataires.forEach(p => { next[p.id] = val; });
    setChecked(next);
    setShowSansPresta(val);
  };

  const allChecked = prestataires.every(p => checked[p.id]) && showSansPresta;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ── Sidebar filtres ── */}
      <aside className="w-60 shrink-0 bg-white border-r border-gray-200 p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar size={16} className="text-blue-600" />
          <span className="font-semibold text-sm text-gray-700">Prestataires</span>
        </div>

        {/* Tout cocher / décocher */}
        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-500 uppercase tracking-wide">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={e => toggleAll(e.target.checked)}
            className="w-3.5 h-3.5 rounded"
          />
          Tous
        </label>

        <div className="flex flex-col gap-2">
          {prestataires.map(p => {
            const color = colorMap[p.id] ?? PALETTE[0];
            return (
              <label key={p.id} className="flex items-center gap-2.5 cursor-pointer group">
                <span
                  className="w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0"
                  style={{
                    borderColor: color.bg,
                    backgroundColor: checked[p.id] ? color.bg : "transparent",
                  }}
                  onClick={() => setChecked(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                >
                  {checked[p.id] && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2 text-white fill-current">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span
                  className="text-sm text-gray-700 group-hover:text-gray-900 truncate"
                  onClick={() => setChecked(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                >
                  {p.nom}
                </span>
              </label>
            );
          })}

          {/* Sans prestataire */}
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <span
              className="w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0"
              style={{
                borderColor: "#9CA3AF",
                backgroundColor: showSansPresta ? "#9CA3AF" : "transparent",
              }}
              onClick={() => setShowSansPresta(v => !v)}
            >
              {showSansPresta && (
                <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-current text-white">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span
              className="text-sm text-gray-500 group-hover:text-gray-700 truncate"
              onClick={() => setShowSansPresta(v => !v)}
            >
              Sans prestataire
            </span>
          </label>
        </div>
      </aside>

      {/* ── Calendrier ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header navigation */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => setWeekStart(w => addDays(w, -7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <button
            onClick={() => setWeekStart(getMondayOfWeek(new Date()))}
            className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setWeekStart(w => addDays(w, 7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
          <h2 className="text-base font-semibold text-gray-800 ml-1">{weekLabel}</h2>
        </div>

        {/* Grille semaine */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Chargement…</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* En-têtes jours */}
            <div className="grid grid-cols-7 border-b border-gray-200 bg-white sticky top-0 z-10">
              {weekDays.map((day, i) => {
                const isToday = sameDay(day, today);
                return (
                  <div key={i} className="py-3 text-center border-r border-gray-100 last:border-r-0">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{JOURS[i]}</p>
                    <div className={`mx-auto mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold
                      ${isToday ? "bg-blue-600 text-white" : "text-gray-700"}`}>
                      {day.getDate()}
                    </div>
                    {/* Petit indicateur mois si 1er du mois */}
                    {day.getDate() === 1 && (
                      <p className="text-xs text-gray-400 mt-0.5">{MOIS[day.getMonth()].slice(0, 3)}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Corps – events */}
            <div className="grid grid-cols-7 min-h-[600px]">
              {weekDays.map((day, i) => {
                const events = eventsForDay(day);
                const isToday = sameDay(day, today);
                return (
                  <div
                    key={i}
                    className={`border-r border-gray-100 last:border-r-0 p-2 min-h-[600px]
                      ${isToday ? "bg-blue-50/30" : "bg-white"}`}
                  >
                    <div className="flex flex-col gap-1">
                      {events.length === 0 && (
                        <div className="h-full" />
                      )}
                      {events.map(ev => {
                        const pid = idByNom[ev.prestataire];
                        const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg: "#9CA3AF", light: "#F3F4F6", text: "#374151" };
                        return (
                          <button
                            key={ev.row}
                            onClick={() => setSelectedEvent(ev)}
                            className="w-full text-left rounded-md px-2 py-1.5 text-xs leading-snug transition-opacity hover:opacity-80"
                            style={{ backgroundColor: color.light, borderLeft: `3px solid ${color.bg}` }}
                          >
                            {ev.heure && (
                              <span className="font-semibold block" style={{ color: color.text }}>
                                {ev.heure}
                              </span>
                            )}
                            <span className="font-medium text-gray-800 block truncate">
                              {ev.prenom} {ev.nom}
                            </span>
                            <span className="text-gray-500 block truncate">{ev.typePresta}</span>
                            {ev.prestataire && (
                              <span className="block truncate mt-0.5 font-medium" style={{ color: color.text }}>
                                {ev.prestataire}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal détail event ── */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5"
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const ev = selectedEvent;
              const pid = idByNom[ev.prestataire];
              const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg: "#9CA3AF", light: "#F3F4F6", text: "#374151" };
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: color.light, color: color.text }}
                    >
                      {ev.prestataire || "Sans prestataire"}
                    </div>
                    <button
                      onClick={() => setSelectedEvent(null)}
                      className="text-gray-400 hover:text-gray-600 text-lg font-bold leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">
                    {ev.prenom} {ev.nom}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">{ev.typePresta}</p>
                  <div className="space-y-1.5 text-sm text-gray-700">
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-20 shrink-0">Date</span>
                      <span>{ev.date} {ev.heure && `à ${ev.heure}`}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-20 shrink-0">Adresse</span>
                      <span>{ev.adresse || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-20 shrink-0">Statut</span>
                      <span>{ev.statut || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-20 shrink-0">Prix</span>
                      <span>{ev.prix ? `${ev.prix} €` : "—"}</span>
                    </div>
                    {ev.tel && (
                      <div className="flex gap-2">
                        <span className="text-gray-400 w-20 shrink-0">Tél</span>
                        <span>{ev.tel}</span>
                      </div>
                    )}
                    {ev.commentaire && (
                      <div className="flex gap-2">
                        <span className="text-gray-400 w-20 shrink-0">Note</span>
                        <span>{ev.commentaire}</span>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
