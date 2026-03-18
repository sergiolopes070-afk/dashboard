"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Users, Briefcase, TrendingUp, Wrench,
  AlertTriangle, Clock, FileText, CalendarCheck, UserPlus, UserCheck, CalendarDays, ChevronRight, TrendingDown,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import PrestationTable from "@/components/PrestationTable";
import Topbar from "@/components/Topbar";
import StatusBadge from "@/components/StatusBadge";
import NewClientModal from "@/components/NewClientModal";
import dynamic from "next/dynamic";
import { Prestation, Prestataire, Depense } from "@/lib/constants";

// ── Mini agenda helpers ──────────────────────────────────────────────────────
const PALETTE_MINI = ["#4285F4","#EA4335","#34A853","#FBBC04","#8B5CF6","#F97316","#06B6D4","#EC4899","#10B981","#6366F1"];
const JOURS_MINI = ["L","M","M","J","V","S","D"];

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}
function addDaysMini(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function frToDateMini(fr: string): Date | null {
  if (!fr) return null;
  const p = fr.split("/");
  return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])) : null;
}
function sameDayMini(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const RevenueChart = dynamic(() => import("@/components/RevenueChart"), { ssr: false });
const TypeChart    = dynamic(() => import("@/components/TypeChart"),    { ssr: false });

interface Stats {
  totalPrestations : number;
  totalClients     : number;
  totalPrestataires: number;
  totalCA          : number;
  upcoming         : number;
  toReassign       : number;
  waitingPresta    : number;
  devisGeneres     : number;
  prestations      : Prestation[];
  prestataires     : Prestataire[];
  archive          : Prestation[];
  upcomingList     : Prestation[];
  toReassignList   : Prestation[];
}

export default function HomePage() {
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [depenses, setDepenses]   = useState<Depense[]>([]);

  // Mini agenda : semaine courante
  const weekStart = useMemo(() => getMondayOfWeek(new Date()), []);
  const weekDays  = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysMini(weekStart, i)), [weekStart]);
  const today     = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const colorByPresta = useMemo(() => {
    const map: Record<string, string> = {};
    (stats?.prestataires ?? []).forEach((p, i) => { map[p.nom] = PALETTE_MINI[i % PALETTE_MINI.length]; });
    return map;
  }, [stats?.prestataires]);

  const weekPrestations = useMemo(() => {
    if (!stats) return [];
    return stats.prestations.filter(p => {
      if (!p.date) return false;
      const d = frToDateMini(p.date);
      return d && weekDays.some(wd => sameDayMini(d, wd));
    });
  }, [stats, weekDays]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, depRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/depenses"),
      ]);
      if (!dashRes.ok) throw new Error((await dashRes.json()).error || "Erreur serveur");
      setStats(await dashRes.json());
      if (depRes.ok) setDepenses(await depRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Tableau de bord"
        subtitle="Vue d'ensemble KinouClean"
        onRefresh={load}
        loading={loading}
        alerts={(stats?.toReassign || 0)}
        action={
          <button
            onClick={() => setShowNewClient(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <UserPlus size={15} />
            Nouveau client
          </button>
        }
      />

      <div className="flex-1 p-6 space-y-6">

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-amber-800">Erreur de connexion Supabase</p>
              <p className="text-sm text-amber-700 mt-1">{error}</p>
              <p className="text-sm text-amber-600 mt-2">
                Vérifiez <code className="bg-amber-100 px-1 rounded">.env.local</code> (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY) —{" "}
                <a href="/configuration" className="underline font-medium">voir Configuration</a>.
              </p>
            </div>
          </div>
        )}

        {stats && stats.toReassign > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0" size={18} />
            <p className="text-sm text-red-700 font-medium">
              {stats.toReassign} prestation{stats.toReassign > 1 ? "s" : ""} refusée{stats.toReassign > 1 ? "s" : ""} à réaffecter
            </p>
            <a href="/prestations" className="ml-auto text-sm text-red-600 underline font-medium">Voir</a>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Chiffre d'affaires" value={stats ? `${stats.totalCA.toFixed(0)} €` : "—"} subtitle="Total toutes prestations" icon={TrendingUp} color="green" href="/prestations" />
          <StatCard title="Prestations actives" value={stats?.totalPrestations ?? "—"} subtitle="En cours" icon={Briefcase} color="blue" href="/prestations" />
          <StatCard title="Clients" value={stats?.totalClients ?? "—"} subtitle="Clients uniques" icon={Users} color="purple" href="/clients" />
          <StatCard title="Prestataires" value={stats?.totalPrestataires ?? "—"} subtitle="Équipe active" icon={Wrench} color="orange" href="/prestataires" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Interventions à venir" value={stats?.upcoming ?? "—"} subtitle="Confirmées" icon={CalendarCheck} color="blue" href="/agenda" />
          <StatCard title="En attente prestataire" value={stats?.waitingPresta ?? "—"} subtitle="Proposition envoyée" icon={Clock} color="orange" href="/prestations" />
          <StatCard title="À réaffecter" value={stats?.toReassign ?? "—"} subtitle="Prestataire refusé" icon={AlertTriangle} color="red" alert={(stats?.toReassign || 0) > 0} href="/prestations" />
          <StatCard title="Devis générés" value={stats?.devisGeneres ?? "—"} subtitle="PDF créés" icon={FileText} color="gray" href="/devis" />
        </div>

        {/* Rentabilité du mois */}
        {stats && (() => {
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          const caMois = [...stats.prestations, ...stats.archive]
            .filter(p => {
              if (!p.date) return false;
              const parts = p.date.split("/");
              if (parts.length !== 3) return false;
              return `${parts[2]}-${parts[1]}` === currentMonth;
            })
            .reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
          const depMois = depenses
            .filter(d => d.date?.startsWith(currentMonth))
            .reduce((s, d) => s + d.montant, 0);
          const benefice = caMois - depMois;
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Rentabilité du mois</h2>
                <a href="/depenses" className="text-sm text-blue-600 hover:underline font-medium">Gérer les dépenses</a>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl bg-green-50 p-4 flex items-center gap-3">
                  <TrendingUp size={20} className="text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">CA du mois</p>
                    <p className="text-xl font-bold text-green-700">{caMois.toFixed(0)} €</p>
                  </div>
                </div>
                <div className="rounded-xl bg-red-50 p-4 flex items-center gap-3">
                  <TrendingDown size={20} className="text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Dépenses du mois</p>
                    <p className="text-xl font-bold text-red-700">{depMois.toFixed(0)} €</p>
                  </div>
                </div>
                <div className={`rounded-xl p-4 flex items-center gap-3 ${benefice >= 0 ? "bg-emerald-50" : "bg-orange-50"}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${benefice >= 0 ? "bg-emerald-500" : "bg-orange-500"}`} />
                  <div>
                    <p className="text-xs text-gray-500">Bénéfice net</p>
                    <p className={`text-xl font-bold ${benefice >= 0 ? "text-emerald-700" : "text-orange-700"}`}>
                      {benefice >= 0 ? "+" : ""}{benefice.toFixed(0)} €
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-800 mb-4">CA mensuel {new Date().getFullYear()}</h2>
              <RevenueChart prestations={[...stats.prestations, ...stats.archive]} />
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Types de prestations</h2>
              <TypeChart prestations={[...stats.prestations, ...stats.archive]} />
            </div>
          </div>
        )}

        {stats && stats.upcomingList.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Prochaines interventions</h2>
              <a href="/prestations" className="text-sm text-blue-600 hover:underline font-medium">Voir tout</a>
            </div>
            <div className="space-y-3">
              {stats.upcomingList.map((p) => (
                <div key={p.row} className="flex items-center gap-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <CalendarCheck size={18} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{p.prenom} {p.nom}</p>
                    <p className="text-sm text-gray-500 truncate">{p.typePresta} — {p.adresse}</p>
                    {/* Prestataire assigné */}
                    {p.prestataire ? (
                      <p className="flex items-center gap-1 text-xs text-green-700 mt-0.5">
                        <UserCheck size={11} />
                        {p.prestataire}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                        <Clock size={11} />
                        En attente de prestataire
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-blue-700">{p.date}</p>
                    {p.heure && <p className="text-xs text-gray-400">{p.heure}</p>}
                  </div>
                  <StatusBadge statut={p.statut} small />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Mini agenda semaine ── */}
        {stats && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarDays size={17} className="text-blue-600" />
                <h2 className="font-semibold text-gray-800">Agenda de la semaine</h2>
              </div>
              <a href="/agenda" className="flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium">
                Ouvrir l'agenda <ChevronRight size={14} />
              </a>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => {
                const isToday = sameDayMini(day, today);
                const events  = weekPrestations.filter(p => {
                  const d = frToDateMini(p.date);
                  return d && sameDayMini(d, day);
                }).sort((a,b) => (a.heure||"").localeCompare(b.heure||""));
                return (
                  <div key={i} className={`rounded-xl border p-2 min-h-[110px] flex flex-col gap-1 ${isToday ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-gray-50"}`}>
                    <div className="text-center mb-1">
                      <p className="text-xs text-gray-400 font-medium uppercase">{JOURS_MINI[i]}</p>
                      <div className={`mx-auto w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-blue-600 text-white" : "text-gray-700"}`}>
                        {day.getDate()}
                      </div>
                    </div>
                    {events.map(ev => {
                      const color = colorByPresta[ev.prestataire] ?? "#9CA3AF";
                      return (
                        <a
                          key={ev.row}
                          href="/agenda"
                          title={`${ev.heure ? ev.heure + " – " : ""}${ev.prenom} ${ev.nom} · ${ev.typePresta}${ev.prestataire ? " · " + ev.prestataire : ""}`}
                          className="block rounded px-1.5 py-0.5 text-white text-xs truncate leading-tight hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: color }}
                        >
                          {ev.heure && <span className="opacity-80 mr-1">{ev.heure}</span>}
                          {ev.prenom} {ev.nom}
                        </a>
                      );
                    })}
                    {events.length === 0 && (
                      <p className="text-xs text-gray-300 text-center mt-auto mb-auto">—</p>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Légende prestataires */}
            {stats.prestataires.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
                {stats.prestataires.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PALETTE_MINI[i % PALETTE_MINI.length] }} />
                    <span className="text-xs text-gray-600">{p.nom}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {stats && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Prestations récentes</h2>
              <a href="/prestations" className="text-sm text-blue-600 hover:underline font-medium">Voir tout</a>
            </div>
            <PrestationTable prestations={stats.prestations.slice(0, 8)} />
          </div>
        )}

      </div>

      {showNewClient && (
        <NewClientModal
          prestataires={stats?.prestataires ?? []}
          onClose={() => setShowNewClient(false)}
          onSaved={() => { setShowNewClient(false); load(); }}
        />
      )}

      {loading && !stats && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Chargement des données...</p>
          </div>
        </div>
      )}
    </div>
  );
}
