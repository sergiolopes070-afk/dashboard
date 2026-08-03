"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, TrendingDown, BadgeEuro, Users, Package, Target, Crown, Boxes } from "lucide-react";
import Topbar from "@/components/Topbar";
import { Prestation, Depense } from "@/lib/constants";

const RevenueChart = dynamic(() => import("@/components/RevenueChart"), { ssr: false });
const TypeChart    = dynamic(() => import("@/components/TypeChart"),    { ssr: false });

interface Stats { prestations: Prestation[]; archive: Prestation[]; }
interface Prospect { statut: string; source: string; }
interface StockItem { id: string; nom: string; unite: string; quantite: number; seuil: number; prixUnitaire: number | null; conso: Record<string, number>; historique: { date: string; type: string; quantite: number }[]; }

const CANCEL = ["Annulation client", "Client injoignable", "Doublon"];
const notCancelled = (p: Prestation) => !CANCEL.some(r => (p.archiveReason || "").startsWith(r));
const prixNet = (p: Prestation) => { const prix = parseFloat(p.prix) || 0; const v = parseFloat(p.commission) || 0; return prix - ((p.commissionType || "%") === "%" ? prix * v / 100 : v); };
const year = (p: Prestation) => p.date?.split("/")[2];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 ${className}`}>{children}</div>;
}

export default function PilotagePage() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [depenses, setDep]    = useState<Depense[]>([]);
  const [prospects, setPros]  = useState<Prospect[]>([]);
  const [stock, setStock]     = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, dep, pr, st] = await Promise.all([fetch("/api/dashboard"), fetch("/api/depenses"), fetch("/api/prospects"), fetch("/api/stock")]);
      if (d.ok) setStats(await d.json());
      if (dep.ok) setDep(await dep.json());
      if (pr.ok) { const x = await pr.json(); setPros(Array.isArray(x) ? x : []); }
      if (st.ok) { const x = await st.json(); setStock(Array.isArray(x) ? x : []); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const Y = String(new Date().getFullYear());
  const archive = useMemo(() => (stats?.archive ?? []).filter(notCancelled), [stats]);

  // ── Argent année ──
  const caAnnee   = archive.filter(p => year(p) === Y).reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
  const caTotal   = archive.reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
  const depAnnee  = useMemo(() => {
    const mois = new Date().getMonth() + 1;
    const ponc = depenses.filter(d => d.type === "ponctuel" && d.date?.startsWith(Y)).reduce((s, d) => s + d.montant, 0);
    const fixe = depenses.filter(d => d.type === "mensuel").reduce((s, d) => s + d.montant, 0) * mois;
    return ponc + fixe;
  }, [depenses, Y]);
  const beneficeAnnee = caAnnee - depAnnee;

  // ── Top clients (CA réalisé) ──
  const topClients = useMemo(() => {
    const m: Record<string, { ca: number; n: number }> = {};
    for (const p of archive) { const k = `${p.prenom || ""} ${p.nom || ""}`.trim() || "—"; m[k] = m[k] || { ca: 0, n: 0 }; m[k].ca += parseFloat(p.prix) || 0; m[k].n++; }
    return Object.entries(m).sort((a, b) => b[1].ca - a[1].ca).slice(0, 6);
  }, [archive]);

  // ── Conversion prospects ──
  const conv = useMemo(() => {
    const total = prospects.length;
    const convertis = prospects.filter(p => p.statut === "CONVERTI").length;
    const bySource: Record<string, { total: number; conv: number }> = {};
    for (const p of prospects) { const s = p.source || "Autre"; bySource[s] = bySource[s] || { total: 0, conv: 0 }; bySource[s].total++; if (p.statut === "CONVERTI") bySource[s].conv++; }
    return { total, convertis, taux: total ? Math.round(convertis / total * 100) : 0, bySource: Object.entries(bySource).sort((a, b) => b[1].total - a[1].total) };
  }, [prospects]);

  // ── Stock analytics ──
  const stockVal = stock.reduce((s, it) => s + it.quantite * (it.prixUnitaire ?? 0), 0);
  const coutParType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of stock) { if (it.prixUnitaire == null) continue; for (const [t, dose] of Object.entries(it.conso || {})) m[t] = (m[t] || 0) + Number(dose) * it.prixUnitaire!; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [stock]);
  const topConso = useMemo(() => {
    const depuis = Date.now() - 30 * 86_400_000;
    return stock.map(it => ({ nom: it.nom, unite: it.unite, q: (it.historique || []).filter(m => m.type === "sortie" && m.date && new Date(m.date).getTime() >= depuis).reduce((s, m) => s + (Number(m.quantite) || 0), 0) }))
      .filter(x => x.q > 0).sort((a, b) => b.q - a.q).slice(0, 5);
  }, [stock]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Topbar title="Pilotage" subtitle="Statistiques & performance" onRefresh={load} loading={loading} />
      <div className="flex-1 p-3 sm:p-6 space-y-4">

        {/* KPIs année */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: `CA réalisé ${Y}`, val: `${caAnnee.toFixed(0)} €`, icon: TrendingUp, c: "text-green-600", bg: "bg-green-50" },
            { label: "Dépenses année", val: `${depAnnee.toFixed(0)} €`, icon: TrendingDown, c: "text-red-600", bg: "bg-red-50" },
            { label: "Bénéfice année", val: `${beneficeAnnee >= 0 ? "+" : ""}${beneficeAnnee.toFixed(0)} €`, icon: BadgeEuro, c: beneficeAnnee >= 0 ? "text-emerald-600" : "text-orange-600", bg: beneficeAnnee >= 0 ? "bg-emerald-50" : "bg-orange-50" },
            { label: "CA depuis le début", val: `${caTotal.toFixed(0)} €`, icon: Crown, c: "text-blue-600", bg: "bg-blue-50" },
          ].map(({ label, val, icon: Icon, c, bg }) => (
            <Card key={label} className="!p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}><Icon size={18} className={c} /></div>
              <div><p className="text-lg font-bold text-gray-900 leading-none">{val}</p><p className="text-[11px] text-gray-400 mt-1">{label}</p></div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <h2 className="font-bold text-gray-900 mb-4">Bénéfice net par mois — {Y}</h2>
            {stats ? <RevenueChart prestations={archive} /> : <div className="h-[220px]" />}
          </Card>
          <Card>
            <h2 className="font-bold text-gray-900 mb-4">Types de prestations</h2>
            {stats ? <TypeChart prestations={[...(stats?.prestations ?? []), ...archive]} /> : <div className="h-[220px]" />}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top clients */}
          <Card>
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Crown size={16} className="text-amber-500" /> Meilleurs clients (CA réalisé)</h2>
            {topClients.length === 0 ? <p className="text-sm text-gray-400">Clôture des prestations pour voir tes meilleurs clients.</p> : (
              <div className="space-y-2">
                {topClients.map(([nom, d], i) => (
                  <div key={nom} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>{i + 1}</span>
                    <span className="flex-1 text-sm text-gray-800 truncate">{nom}</span>
                    <span className="text-xs text-gray-400">{d.n} presta</span>
                    <span className="text-sm font-semibold text-green-700 w-20 text-right">{d.ca.toFixed(0)} €</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Conversion prospects */}
          <Card>
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Target size={16} className="text-purple-500" /> Conversion des leads</h2>
            <div className="flex items-center gap-4 mb-3">
              <div className="text-center"><p className="text-2xl font-bold text-purple-700">{conv.taux}%</p><p className="text-[11px] text-gray-400">taux de conversion</p></div>
              <p className="text-sm text-gray-500"><strong className="text-gray-800">{conv.convertis}</strong> convertis sur <strong className="text-gray-800">{conv.total}</strong> prospects</p>
            </div>
            <div className="space-y-1.5">
              {conv.bySource.slice(0, 5).map(([s, d]) => (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-gray-500 truncate">{s}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-purple-400" style={{ width: `${d.total ? (d.conv / d.total) * 100 : 0}%` }} /></div>
                  <span className="text-gray-400 w-16 text-right">{d.conv}/{d.total}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── STOCK analytics ── */}
        <Card>
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Package size={17} className="text-orange-500" /> Analyse du stock</h2>
          {stock.length === 0 ? (
            <p className="text-sm text-gray-400">Crée tes produits (page Stock) pour débloquer l&apos;analyse : coût matériel par prestation, produits les plus consommés…</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1"><Boxes size={13} /> Vue d&apos;ensemble</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Articles</span><strong className="text-gray-800">{stock.length}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">Valeur du stock</span><strong className="text-emerald-700">{stockVal.toFixed(0)} €</strong></div>
                  <div className="flex justify-between"><span className="text-gray-500">À réapprovisionner</span><strong className={stock.filter(it => it.seuil > 0 && it.quantite <= it.seuil).length ? "text-red-600" : "text-gray-800"}>{stock.filter(it => it.seuil > 0 && it.quantite <= it.seuil).length}</strong></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Coût matériel / prestation</p>
                {coutParType.length === 0 ? <p className="text-xs text-gray-400">Renseigne une dose de conso sur tes produits.</p> : (
                  <div className="space-y-1.5 text-sm">
                    {coutParType.map(([t, c]) => (
                      <div key={t} className="flex justify-between"><span className="text-gray-500 truncate">{t}</span><strong className="text-gray-800">{c.toFixed(2)} €</strong></div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Top produits consommés (30 j)</p>
                {topConso.length === 0 ? <p className="text-xs text-gray-400">Aucune sortie récente.</p> : (
                  <div className="space-y-1.5 text-sm">
                    {topConso.map(x => (
                      <div key={x.nom} className="flex justify-between"><span className="text-gray-500 truncate">{x.nom}</span><strong className="text-orange-700">{x.q} {x.unite}</strong></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
