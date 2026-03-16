"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Prestation, Prestataire } from "@/lib/constants";

// ─── Palette ────────────────────────────────────────────────────────────────
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

// ─── Config grille horaire ───────────────────────────────────────────────────
const HOUR_START  = 7;   // 07:00
const HOUR_END    = 22;  // 22:00
const HOURS       = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const HOUR_PX     = 64;  // hauteur d'une heure en px
const EVENT_DUR   = 60;  // durée par défaut d'un event en minutes

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getMondayOfWeek(d: Date): Date {
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function frToDate(fr: string): Date | null {
  if (!fr) return null;
  const p = fr.split("/");
  return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])) : null;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
function timeToMinutes(heure: string): number {
  if (!heure) return -1;
  const [h, m] = heure.split(":").map(Number);
  return h * 60 + (m || 0);
}
function topPx(heure: string): number {
  const mins = timeToMinutes(heure);
  if (mins < 0) return 0;
  return ((mins - HOUR_START * 60) / 60) * HOUR_PX;
}
function heightPx(heure: string): number {
  const mins = timeToMinutes(heure);
  if (mins < 0) return HOUR_PX;
  // Clamp to grid
  const maxTop = (HOUR_END - HOUR_START) * HOUR_PX;
  const top    = ((mins - HOUR_START * 60) / 60) * HOUR_PX;
  return Math.min(EVENT_DUR / 60 * HOUR_PX, maxTop - top);
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS  = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AgendaPage() {
  const [prestations,  setPrestations]  = useState<Prestation[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [weekStart,    setWeekStart]    = useState<Date>(() => getMondayOfWeek(new Date()));
  const [checked,      setChecked]      = useState<Record<string, boolean>>({});
  const [showSansPresta, setShowSansPresta] = useState(true);
  const [selectedEvent, setSelectedEvent]  = useState<Prestation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch
  useEffect(() => {
    Promise.all([
      fetch("/api/prestations").then(r => r.json()),
      fetch("/api/prestataires").then(r => r.json()),
    ]).then(([prestas, prestas2]) => {
      setPrestations(Array.isArray(prestas) ? prestas : []);
      setPrestataires(Array.isArray(prestas2) ? prestas2 : []);
      const init: Record<string, boolean> = {};
      (Array.isArray(prestas2) ? prestas2 : []).forEach((p: Prestataire) => { init[p.id] = true; });
      setChecked(init);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Scroll vers 08:00 au montage
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = (8 - HOUR_START) * HOUR_PX - 8;
    }
  }, [loading]);

  const colorMap = useMemo(() => {
    const map: Record<string, typeof PALETTE[0]> = {};
    prestataires.forEach((p, i) => { map[p.id] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [prestataires]);

  const idByNom = useMemo(() => {
    const map: Record<string, string> = {};
    prestataires.forEach(p => { map[p.nom] = p.id; });
    return map;
  }, [prestataires]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const visiblePrestations = useMemo(() =>
    prestations.filter(p => {
      if (!p.date) return false;
      const pid = idByNom[p.prestataire];
      if (p.prestataire && pid) return checked[pid] ?? false;
      return showSansPresta;
    }),
    [prestations, checked, showSansPresta, idByNom]
  );

  function eventsForDay(day: Date): Prestation[] {
    return visiblePrestations.filter(p => {
      const d = frToDate(p.date);
      return d && sameDay(d, day);
    }).sort((a, b) => (a.heure || "").localeCompare(b.heure || ""));
  }

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    if (weekStart.getMonth() === end.getMonth())
      return `${weekStart.getDate()} – ${end.getDate()} ${MOIS[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    return `${weekStart.getDate()} ${MOIS[weekStart.getMonth()].slice(0,3)} – ${end.getDate()} ${MOIS[end.getMonth()].slice(0,3)} ${weekStart.getFullYear()}`;
  }, [weekStart]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const toggleAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    prestataires.forEach(p => { next[p.id] = val; });
    setChecked(next);
    setShowSansPresta(val);
  };
  const allChecked = prestataires.every(p => checked[p.id]) && showSansPresta;

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Sidebar filtres ─────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <Calendar size={15} className="text-blue-600" />
          <span className="font-semibold text-sm text-gray-700">Prestataires</span>
        </div>

        {/* Tout */}
        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-400 uppercase tracking-wide">
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
              <label
                key={p.id}
                className="flex items-center gap-2.5 cursor-pointer group"
                onClick={() => setChecked(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
              >
                <span
                  className="w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors"
                  style={{ borderColor: color.bg, backgroundColor: checked[p.id] ? color.bg : "transparent" }}
                >
                  {checked[p.id] && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className="text-sm text-gray-700 group-hover:text-gray-900 truncate">{p.nom}</span>
              </label>
            );
          })}

          {/* Sans prestataire */}
          <label
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => setShowSansPresta(v => !v)}
          >
            <span
              className="w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: "#9CA3AF", backgroundColor: showSansPresta ? "#9CA3AF" : "transparent" }}
            >
              {showSansPresta && (
                <svg viewBox="0 0 10 8" className="w-2.5 h-2">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span className="text-sm text-gray-400 group-hover:text-gray-600 truncate">Sans prestataire</span>
          </label>
        </div>
      </aside>

      {/* ── Calendrier ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Barre navigation */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setWeekStart(w => addDays(w, -7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Semaine précédente"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <button
            onClick={() => setWeekStart(getMondayOfWeek(new Date()))}
            className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setWeekStart(w => addDays(w, 7))}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Semaine suivante"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
          <h2 className="text-sm font-semibold text-gray-800 ml-2">{weekLabel}</h2>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Chargement…</div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* En-têtes jours — sticky */}
            <div className="grid bg-white border-b border-gray-200 shrink-0"
              style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
              <div /> {/* coin vide */}
              {weekDays.map((day, i) => {
                const isToday = sameDay(day, today);
                return (
                  <div key={i} className="py-2 text-center border-l border-gray-100">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{JOURS[i]}</p>
                    <div className={`mx-auto mt-0.5 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold
                      ${isToday ? "bg-blue-600 text-white" : "text-gray-700"}`}>
                      {day.getDate()}
                    </div>
                    {day.getDate() === 1 && (
                      <p className="text-xs text-gray-400">{MOIS[day.getMonth()].slice(0,3)}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grille scrollable avec heures */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="flex" style={{ minHeight: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}>

                {/* Colonne heures */}
                <div className="w-12 shrink-0 relative" style={{ height: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}>
                  {HOURS.map((h, i) => (
                    <div
                      key={h}
                      className="absolute right-2 text-xs text-gray-400 font-medium"
                      style={{ top: `${i * HOUR_PX - 7}px` }}
                    >
                      {String(h).padStart(2,"0")}:00
                    </div>
                  ))}
                </div>

                {/* Colonnes jours */}
                {weekDays.map((day, di) => {
                  const events  = eventsForDay(day);
                  const isToday = sameDay(day, today);
                  return (
                    <div
                      key={di}
                      className={`flex-1 border-l border-gray-100 relative ${isToday ? "bg-blue-50/20" : "bg-white"}`}
                      style={{ height: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}
                    >
                      {/* Lignes horaires */}
                      {HOURS.map((h, i) => (
                        <div
                          key={h}
                          className="absolute left-0 right-0 border-t border-gray-100"
                          style={{ top: `${i * HOUR_PX}px` }}
                        />
                      ))}
                      {/* Ligne demi-heure */}
                      {HOURS.map((h, i) => (
                        <div
                          key={`${h}-half`}
                          className="absolute left-0 right-0 border-t border-gray-50"
                          style={{ top: `${i * HOUR_PX + HOUR_PX / 2}px` }}
                        />
                      ))}

                      {/* Events */}
                      {events.map((ev, ei) => {
                        const pid   = idByNom[ev.prestataire];
                        const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg: "#9CA3AF", light: "#F3F4F6", text: "#374151" };
                        const top   = ev.heure ? topPx(ev.heure) : 0;
                        const h     = ev.heure ? heightPx(ev.heure) : HOUR_PX;
                        // Éviter le chevauchement simple (décalage horizontal)
                        const overlap = events.slice(0, ei).filter(e => {
                          if (!e.heure || !ev.heure) return false;
                          const tA = timeToMinutes(e.heure);
                          const tB = timeToMinutes(ev.heure);
                          return Math.abs(tA - tB) < EVENT_DUR;
                        }).length;
                        const W = overlap > 0 ? "calc(50% - 4px)" : "calc(100% - 6px)";
                        const L = overlap > 0 ? "calc(50% + 2px)" : "3px";

                        return (
                          <button
                            key={ev.row}
                            onClick={() => setSelectedEvent(ev)}
                            className="absolute rounded-md text-left text-xs overflow-hidden shadow-sm hover:brightness-95 transition-all"
                            style={{
                              top       : `${top + 1}px`,
                              height    : `${Math.max(h - 2, 22)}px`,
                              left      : L,
                              width     : W,
                              backgroundColor: color.light,
                              borderLeft: `3px solid ${color.bg}`,
                              zIndex    : 10 + ei,
                            }}
                          >
                            <div className="px-1.5 py-1 h-full flex flex-col justify-start overflow-hidden">
                              {ev.heure && (
                                <span className="font-bold leading-tight truncate" style={{ color: color.bg }}>
                                  {ev.heure}
                                </span>
                              )}
                              <span className="font-semibold leading-tight truncate text-gray-800">
                                {ev.prenom} {ev.nom}
                              </span>
                              {h > 36 && (
                                <span className="text-gray-500 leading-tight truncate">{ev.typePresta}</span>
                              )}
                              {h > 52 && ev.prestataire && (
                                <span className="leading-tight truncate font-medium" style={{ color: color.text }}>
                                  {ev.prestataire}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal détail ─────────────────────────────────────────────────── */}
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
              const ev    = selectedEvent;
              const pid   = idByNom[ev.prestataire];
              const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg: "#9CA3AF", light: "#F3F4F6", text: "#374151" };
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: color.light, color: color.text }}>
                      {ev.prestataire || "Sans prestataire"}
                    </div>
                    <button onClick={() => setSelectedEvent(null)}
                      className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
                  </div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">{ev.prenom} {ev.nom}</h3>
                  <p className="text-sm text-gray-500 mb-3">{ev.typePresta}</p>
                  <div className="space-y-1.5 text-sm text-gray-700">
                    {[
                      ["Date",    `${ev.date}${ev.heure ? ` à ${ev.heure}` : ""}`],
                      ["Adresse", ev.adresse || "—"],
                      ["Statut",  ev.statut  || "—"],
                      ["Prix",    ev.prix    ? `${ev.prix} €` : "—"],
                      ["Tél",     ev.tel     || null],
                      ["Note",    ev.commentaire || null],
                    ].filter(([,v]) => v).map(([label, val]) => (
                      <div key={label as string} className="flex gap-2">
                        <span className="text-gray-400 w-20 shrink-0">{label}</span>
                        <span>{val}</span>
                      </div>
                    ))}
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
