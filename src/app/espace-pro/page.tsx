"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { MapPin, Phone, Clock, LogOut, RefreshCw, Loader2, Lock, X, ChevronLeft, ChevronRight, Camera } from "lucide-react";

interface Photo { url: string; path: string; article: string; phase: string; at: string }
interface Mission {
  row: string; nom: string; prenom: string; tel: string; telMasque: boolean;
  typePresta: string; adresse: string; date: string; heure: string; statut: string; message: string;
  photos: Photo[];
}

// Articles d'une prestation, dérivés du type (« Lavage Canapé + Lavage de matelas… »).
function articlesDe(typePresta: string): string[] {
  const parts = (typePresta || "").split("+").map(s => s.trim().replace(/^(lavage|nettoyage)\s+(de\s+|d'|du\s+|des\s+|la\s+|le\s+)?/i, "").trim()).filter(Boolean);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const total: Record<string, number> = {}; parts.forEach(p => { total[p] = (total[p] || 0) + 1; });
  const seen: Record<string, number> = {}; const out: string[] = [];
  for (const p of parts) { if (total[p] > 1) { seen[p] = (seen[p] || 0) + 1; out.push(`${cap(p)} ${seen[p]}`); } else out.push(cap(p)); }
  return out.length ? out : ["Prestation"];
}

// ── Config grille (calquée sur l'agenda du dashboard) ──
const HOUR_START = 7, HOUR_END = 21, HOUR_PX = 52;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const JOURS_L = ["L", "M", "M", "J", "V", "S", "D"];
const JOURS_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_C = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

const frToDate = (fr: string): Date | null => { const p = (fr || "").split("/"); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null; };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function mondayOf(d: Date): Date { const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0, 0, 0, 0); return m; }
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
function timeToMin(h: string): number { if (!h) return -1; const [hh, mm] = h.split(":").map(Number); return hh * 60 + (mm || 0); }
function topPx(h: string): number { const m = timeToMin(h); return m < 0 ? 0 : ((m - HOUR_START * 60) / 60) * HOUR_PX; }

export default function EspaceProPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sel, setSel]           = useState<Mission | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [uploading, setUploading] = useState<string | null>(null);
  const pending = useRef<{ article: string; phase: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const PALETTE = ["#4285F4", "#34A853", "#F97316", "#8B5CF6", "#EC4899", "#06B6D4", "#EA4335", "#FBBC04", "#10B981", "#6366F1"];
  const colorByType = useMemo(() => {
    const map: Record<string, string> = {}; let i = 0;
    for (const m of missions) { const t = m.typePresta || "Autre"; if (!map[t]) { map[t] = PALETTE[i % PALETTE.length]; i++; } }
    return map; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions]);

  async function load() {
    setLoading(true);
    try { const r = await fetch("/api/espace-pro/missions"); if (r.ok) setMissions(await r.json()); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }

  function pickPhoto(article: string, phase: string) { pending.current = { article, phase }; fileRef.current?.click(); }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !pending.current || !sel) return;
    const { article, phase } = pending.current; const key = `${article}-${phase}`; setUploading(key);
    try {
      const fd = new FormData(); fd.append("prestationId", sel.row); fd.append("article", article); fd.append("phase", phase); fd.append("file", f);
      const r = await fetch("/api/espace-pro/photo", { method: "POST", body: fd }); const d = await r.json();
      if (r.ok && d.photo) {
        const add = (m: Mission) => ({ ...m, photos: [...(m.photos || []), d.photo] });
        setSel(s => s ? add(s) : s); setMissions(ms => ms.map(m => m.row === sel.row ? add(m) : m));
      } else alert(d.error || "Échec de l'envoi");
    } catch { alert("Erreur réseau"); }
    finally { setUploading(null); pending.current = null; }
  }
  async function delPhoto(p: Photo) {
    if (!sel || !confirm("Supprimer cette photo ?")) return;
    await fetch("/api/espace-pro/photo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prestationId: sel.row, path: p.path }) });
    const rm = (m: Mission) => ({ ...m, photos: (m.photos || []).filter(x => x.path !== p.path) });
    setSel(s => s ? rm(s) : s); setMissions(ms => ms.map(m => m.row === sel.row ? rm(m) : m));
  }

  const missionsOf = (day: Date) => missions.filter(m => { const d = frToDate(m.date); return d && sameDay(d, day); }).sort((a, b) => (a.heure || "").localeCompare(b.heure || ""));
  const nbAvenir = missions.filter(m => { const d = frToDate(m.date); return d && d >= today; }).length;
  const end = addDays(weekStart, 6);
  const weekLabel = `${weekStart.getDate()} ${MOIS_C[weekStart.getMonth()]} – ${end.getDate()} ${MOIS_C[end.getMonth()]}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-20 bg-[#1C3557] text-white px-4 py-3 flex items-center justify-between shadow">
        <div><p className="font-bold leading-tight">KinouClean</p><p className="text-[11px] text-white/60">Espace prestataire · {nbAvenir} mission{nbAvenir > 1 ? "s" : ""} à venir</p></div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg hover:bg-white/10" title="Rafraîchir"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={logout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"><LogOut size={14} /> Quitter</button>
        </div>
      </header>

      {/* Navigation semaine */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2 sticky top-[56px] z-10">
        <button onClick={() => setWeekStart(w => addDays(w, -7))} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} className="text-gray-600" /></button>
        <button onClick={() => setWeekStart(mondayOf(new Date()))} className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">Auj.</button>
        <button onClick={() => setWeekStart(w => addDays(w, 7))} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={18} className="text-gray-600" /></button>
        <span className="text-sm font-semibold text-gray-800 ml-1">{weekLabel}</span>
      </div>

      {loading && missions.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="animate-spin mr-2" size={18} /> Chargement…</div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[600px]">
            {/* En-têtes jours */}
            <div className="grid bg-white border-b border-gray-200 sticky top-[100px] z-10" style={{ gridTemplateColumns: "38px repeat(7, 1fr)" }}>
              <div />
              {weekDays.map((day, i) => {
                const isToday = sameDay(day, today);
                return (
                  <div key={i} className="py-1.5 text-center border-l border-gray-100">
                    <p className="text-[10px] text-gray-400 font-medium uppercase">{JOURS_L[i]}</p>
                    <div className={`mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-blue-600 text-white" : "text-gray-700"}`}>{day.getDate()}</div>
                  </div>
                );
              })}
            </div>
            {/* Grille horaire */}
            <div className="flex" style={{ minHeight: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}>
              {/* Colonne heures */}
              <div className="w-[38px] shrink-0 relative bg-white">
                {HOURS.map((h, i) => (
                  <div key={h} className="absolute right-1.5 text-[10px] text-gray-400 font-medium" style={{ top: `${i * HOUR_PX - 6}px` }}>{String(h).padStart(2, "0")}h</div>
                ))}
              </div>
              {/* Colonnes jours */}
              {weekDays.map((day, di) => {
                const isToday = sameDay(day, today);
                const evs = missionsOf(day);
                return (
                  <div key={di} className={`flex-1 border-l border-gray-100 relative ${isToday ? "bg-blue-50/30" : "bg-white"}`} style={{ height: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}>
                    {HOURS.map((h, i) => <div key={h} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${i * HOUR_PX}px` }} />)}
                    {evs.map((m, ei) => {
                      const top = m.heure ? topPx(m.heure) : ei * 22;
                      return (
                        <button key={m.row} onClick={() => setSel(m)}
                          className="absolute left-0.5 right-0.5 rounded-md text-left overflow-hidden shadow-sm text-white active:scale-[0.98] hover:brightness-95 transition-all"
                          style={{ top: `${top + 1}px`, height: `${HOUR_PX - 3}px`, backgroundColor: colorByType[m.typePresta] || "#4285F4", zIndex: 5 + ei }}>
                          <div className="px-1.5 py-1 leading-tight">
                            {m.heure && <p className="text-[10px] font-bold opacity-90">{m.heure}</p>}
                            <p className="text-[11px] font-semibold truncate">{m.prenom} {m.nom}</p>
                            <p className="text-[9px] opacity-80 truncate">{m.typePresta}</p>
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

      {/* Légende */}
      {Object.keys(colorByType).length > 0 && (
        <div className="bg-white border-t border-gray-100 px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(colorByType).map(([t, c]) => (
            <span key={t} className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />{t}</span>
          ))}
        </div>
      )}

      {/* Détail d'une mission */}
      {sel && (() => {
        const d = frToDate(sel.date);
        const jour = d ? `${JOURS_FULL[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}` : sel.date;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
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
              {sel.telMasque ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 text-gray-500 text-sm">
                  <Lock size={16} className="flex-shrink-0" /> Numéro du client visible <strong className="mx-1">24h avant</strong> le rendez-vous.
                </div>
              ) : sel.tel ? (
                <a href={`tel:${sel.tel.replace(/\s/g, "")}`} className="flex items-center gap-2 p-3 rounded-xl bg-green-50 text-green-700 text-sm font-medium"><Phone size={16} /> {sel.tel}</a>
              ) : null}
              {sel.message && <div className="p-3 rounded-xl bg-gray-50"><p className="text-xs font-semibold text-gray-400 mb-1">Consignes</p><p className="text-sm text-gray-700 whitespace-pre-line">{sel.message}</p></div>}

              {/* Photos avant / après, par article */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5"><Camera size={15} /> Photos avant / après</p>
                <div className="space-y-3">
                  {articlesDe(sel.typePresta).map(art => (
                    <div key={art}>
                      <p className="text-xs font-medium text-gray-600 mb-1.5">{art}</p>
                      {(["avant", "apres"] as const).map(phase => {
                        const ph = (sel.photos || []).filter(p => p.article === art && p.phase === phase);
                        const key = `${art}-${phase}`;
                        return (
                          <div key={phase} className="flex items-start gap-2 mb-1.5">
                            <span className={`text-[11px] font-medium w-11 pt-4 ${phase === "avant" ? "text-orange-600" : "text-green-600"}`}>{phase === "avant" ? "Avant" : "Après"}</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {ph.map(p => (
                                <div key={p.path} className="relative">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={art} className="w-14 h-14 rounded-lg object-cover border border-gray-200" /></a>
                                  <button onClick={() => delPhoto(p)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[11px] leading-none">×</button>
                                </div>
                              ))}
                              <button onClick={() => pickPhoto(art, phase)} disabled={uploading === key}
                                className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors disabled:opacity-50">
                                {uploading === key ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <p className="flex items-center gap-1.5 text-xs text-gray-400"><Clock size={12} /> {d && d < today ? "Rendez-vous passé" : "À venir"}</p>
            </div>
          </div>
        );
      })()}

      {/* Input caméra (déclenché par les boutons photo) */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
    </div>
  );
}
