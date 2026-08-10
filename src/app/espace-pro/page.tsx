"use client";
import { useEffect, useState, useMemo } from "react";
import { MapPin, Phone, Clock, LogOut, CalendarCheck, RefreshCw, Loader2 } from "lucide-react";

interface Mission {
  row: string; nom: string; prenom: string; tel: string;
  typePresta: string; adresse: string; date: string; heure: string; statut: string; message: string;
}

const frToDate = (fr: string): Date | null => { const p = (fr || "").split("/"); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null; };
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function labelJour(d: Date, today: Date): string {
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

export default function EspaceProPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading]   = useState(true);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  async function load() {
    setLoading(true);
    try { const r = await fetch("/api/espace-pro/missions"); if (r.ok) setMissions(await r.json()); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }

  // À venir (aujourd'hui + futur), groupées par jour.
  const groupes = useMemo(() => {
    const av = missions.filter(m => { const d = frToDate(m.date); return d && d >= today; }).sort((a, b) => (a.date.split("/").reverse().join("") + (a.heure || "")).localeCompare(b.date.split("/").reverse().join("") + (b.heure || "")));
    const map: Record<string, Mission[]> = {};
    for (const m of av) { const d = frToDate(m.date)!; const k = d.toISOString().slice(0, 10); (map[k] = map[k] || []).push(m); }
    return Object.entries(map).map(([k, list]) => ({ date: new Date(k + "T00:00:00"), list }));
  }, [missions, today]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#1C3557] text-white px-4 py-3 flex items-center justify-between shadow">
        <div>
          <p className="font-bold leading-tight">KinouClean</p>
          <p className="text-[11px] text-white/60">Espace prestataire</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg hover:bg-white/10" title="Rafraîchir"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={logout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"><LogOut size={14} /> Quitter</button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Mes missions</h1>
          <p className="text-sm text-gray-400">{missions.filter(m => { const d = frToDate(m.date); return d && d >= today; }).length} à venir</p>
        </div>

        {loading && missions.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="animate-spin mr-2" size={18} /> Chargement…</div>
        ) : groupes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-center">
            <CalendarCheck size={40} className="mb-3 opacity-30" />
            <p className="font-medium">Aucune mission à venir</p>
            <p className="text-sm mt-1">Tes prochaines interventions apparaîtront ici.</p>
          </div>
        ) : (
          groupes.map(g => (
            <div key={g.date.toISOString()} className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{labelJour(g.date, today)}</p>
              {g.list.map(m => (
                <div key={m.row} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{m.prenom} {m.nom}</p>
                      <p className="text-sm text-gray-500">{m.typePresta}</p>
                    </div>
                    {m.heure && <span className="flex items-center gap-1 text-sm font-semibold text-[#1C3557] flex-shrink-0"><Clock size={13} /> {m.heure}</span>}
                  </div>
                  {m.adresse && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.adresse)}`} target="_blank" rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      <MapPin size={14} className="flex-shrink-0" /> <span className="truncate">{m.adresse}</span>
                    </a>
                  )}
                  {m.tel && (
                    <a href={`tel:${m.tel.replace(/\s/g, "")}`} className="mt-1.5 flex items-center gap-2 text-sm text-gray-600">
                      <Phone size={14} className="flex-shrink-0" /> {m.tel}
                    </a>
                  )}
                  {m.message && <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2 whitespace-pre-line">{m.message}</p>}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
