"use client";
import { useEffect, useState, useMemo } from "react";
import { MapPin, Phone, Clock, LogOut, CalendarCheck, RefreshCw, Loader2, Lock, X } from "lucide-react";

interface Mission {
  row: string; nom: string; prenom: string; tel: string; telMasque: boolean;
  typePresta: string; adresse: string; date: string; heure: string; statut: string; message: string;
}

const frToDate = (fr: string): Date | null => { const p = (fr || "").split("/"); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null; };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const JOURS_L = ["L", "M", "M", "J", "V", "S", "D"];
const JOURS_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function mondayOf(d: Date): Date { const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0, 0, 0, 0); return m; }
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

export default function EspaceProPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sel, setSel]           = useState<Mission | null>(null);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const weeks = useMemo(() => { const m = mondayOf(today); return [Array.from({ length: 7 }, (_, i) => addDays(m, i)), Array.from({ length: 7 }, (_, i) => addDays(m, i + 7))]; }, [today]);

  // Une couleur par type de prestation (pour un agenda coloré et lisible).
  const PALETTE = ["#4285F4", "#34A853", "#F97316", "#8B5CF6", "#EC4899", "#06B6D4", "#EA4335", "#FBBC04", "#10B981", "#6366F1"];
  const colorByType = useMemo(() => {
    const map: Record<string, string> = {}; let i = 0;
    for (const m of missions) { const t = m.typePresta || "Autre"; if (!map[t]) { map[t] = PALETTE[i % PALETTE.length]; i++; } }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions]);

  async function load() {
    setLoading(true);
    try { const r = await fetch("/api/espace-pro/missions"); if (r.ok) setMissions(await r.json()); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }

  const missionsOf = (day: Date) => missions.filter(m => { const d = frToDate(m.date); return d && sameDay(d, day); }).sort((a, b) => (a.heure || "").localeCompare(b.heure || ""));
  const nbAvenir = missions.filter(m => { const d = frToDate(m.date); return d && d >= today; }).length;

  function WeekGrid({ days, titre }: { days: Date[]; titre: string }) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-800 mb-3">{titre}</p>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const isToday = sameDay(day, today);
            const evs = missionsOf(day);
            return (
              <div key={i} className={`rounded-xl border p-1.5 min-h-[104px] flex flex-col gap-1 ${isToday ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-gray-50"}`}>
                <div className="text-center mb-1">
                  <p className="text-[10px] sm:text-xs text-gray-400 font-medium uppercase">{JOURS_L[i]}</p>
                  <div className={`mx-auto w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-blue-600 text-white" : "text-gray-700"}`}>{day.getDate()}</div>
                </div>
                {evs.map(m => (
                  <button key={m.row} onClick={() => setSel(m)} title={`${m.heure ? m.heure + " – " : ""}${m.prenom} ${m.nom} · ${m.typePresta}`}
                    className="block w-full text-left rounded px-1.5 py-0.5 text-white text-[10px] sm:text-xs leading-tight truncate hover:opacity-80 active:scale-[0.97] transition-all"
                    style={{ backgroundColor: colorByType[m.typePresta] || "#4285F4" }}>
                    {m.heure && <span className="opacity-80 mr-0.5">{m.heure}</span>}{m.prenom}
                  </button>
                ))}
                {evs.length === 0 && <p className="text-xs text-gray-300 text-center mt-auto mb-auto">—</p>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-[#1C3557] text-white px-4 py-3 flex items-center justify-between shadow">
        <div><p className="font-bold leading-tight">KinouClean</p><p className="text-[11px] text-white/60">Espace prestataire</p></div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg hover:bg-white/10" title="Rafraîchir"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={logout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"><LogOut size={14} /> Quitter</button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Mon agenda</h1>
          <p className="text-sm text-gray-400">{nbAvenir} mission{nbAvenir > 1 ? "s" : ""} à venir · touche un rendez-vous pour le détail</p>
        </div>

        {loading && missions.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="animate-spin mr-2" size={18} /> Chargement…</div>
        ) : (
          <>
            <WeekGrid days={weeks[0]} titre="Cette semaine" />
            <WeekGrid days={weeks[1]} titre="Semaine prochaine" />
            {Object.keys(colorByType).length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
                {Object.entries(colorByType).map(([t, c]) => (
                  <span key={t} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />{t}
                  </span>
                ))}
              </div>
            )}
            {missions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-center">
                <CalendarCheck size={36} className="mb-2 opacity-30" />
                <p className="font-medium">Aucune mission planifiée</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Détail d'une mission */}
      {sel && (() => {
        const d = frToDate(sel.date);
        const jour = d ? `${JOURS_FULL[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}` : sel.date;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-400">{jour}{sel.heure ? ` · ${sel.heure}` : ""}</p>
                  <h2 className="text-lg font-bold text-gray-900">{sel.prenom} {sel.nom}</h2>
                  <p className="text-sm text-gray-500">{sel.typePresta}</p>
                </div>
                <button onClick={() => setSel(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
              </div>

              {sel.adresse && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sel.adresse)}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium">
                  <MapPin size={16} className="flex-shrink-0" /> <span className="flex-1">{sel.adresse}</span> <span className="text-xs opacity-70">Itinéraire →</span>
                </a>
              )}

              {/* Téléphone : masqué jusqu'à 24h avant */}
              {sel.telMasque ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 text-gray-500 text-sm">
                  <Lock size={16} className="flex-shrink-0" /> Numéro du client visible <strong className="mx-1">24h avant</strong> le rendez-vous.
                </div>
              ) : sel.tel ? (
                <a href={`tel:${sel.tel.replace(/\s/g, "")}`} className="flex items-center gap-2 p-3 rounded-xl bg-green-50 text-green-700 text-sm font-medium">
                  <Phone size={16} className="flex-shrink-0" /> {sel.tel}
                </a>
              ) : null}

              {sel.message && <div className="p-3 rounded-xl bg-gray-50"><p className="text-xs font-semibold text-gray-400 mb-1">Consignes</p><p className="text-sm text-gray-700 whitespace-pre-line">{sel.message}</p></div>}

              {(() => { const past = d && d < today; return (
                <p className="flex items-center gap-1.5 text-xs text-gray-400"><Clock size={12} /> {past ? "Rendez-vous passé" : "À venir"}</p>
              ); })()}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
