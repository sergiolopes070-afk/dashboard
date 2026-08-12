"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  AlertTriangle, Clock, CalendarCheck, UserPlus, UserCheck,
  CalendarDays, ChevronRight, BellRing, ChevronDown, UserSearch, X, Loader2,
  Package, Sparkles, Phone, ArrowRight, CheckCircle2,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import StatusBadge from "@/components/StatusBadge";
import NewClientModal from "@/components/NewClientModal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { Prestation, Prestataire, Depense } from "@/lib/constants";

// ── Mini agenda helpers ──────────────────────────────────────────────────────
const PALETTE_MINI = ["#4285F4","#EA4335","#34A853","#FBBC04","#8B5CF6","#F97316","#06B6D4","#EC4899","#10B981","#6366F1"];
const JOURS_MINI = ["L","M","M","J","V","S","D"];

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0, 0, 0, 0);
  return mon;
}
const addDaysMini = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
function frToDateMini(fr: string): Date | null {
  if (!fr) return null;
  const p = fr.split("/");
  return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])) : null;
}
const sameDayMini = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

interface Stats {
  totalPrestations: number; totalClients: number; totalPrestataires: number;
  totalCA: number; caParEntite: Record<string, number>; upcoming: number;
  toReassign: number; waitingPresta: number; devisGeneres: number; nouveauxClients: number;
  prestations: Prestation[]; prestataires: Prestataire[]; archive: Prestation[];
  upcomingList: Prestation[]; toReassignList: Prestation[];
}
interface Prospect { id: string; prenom: string; nom: string; tel: string; statut: string; dateRelance: string; typePresta: string; createdAt: string; }
interface Demande { id: string; at: string; prestataireNom: string; categorie: string; quantite: string; details: string; statut: string; }
interface StockItem { id: string; nom: string; unite: string; quantite: number; seuil: number; prixUnitaire: number | null; conso: Record<string, number>; historique: { date: string; type: string; quantite: number }[]; }

const SOURCES_PROSPECT   = ["Google","Réseaux sociaux","Bouche à oreille","Recommandation","Formulaire web","Autre"];
const TYPES_PRESTA_QUICK = ["Ménage","Repassage","Vitres","Débarras","Après travaux","Bureaux","Lavage Canapé","Lavage véhicule","Lavage de matelas","Autre"];

// Autonomie d'un produit = stock / consommation hebdo réelle (sorties 30 j).
function autonomieSemaines(it: StockItem): number | null {
  const depuis = Date.now() - 30 * 86_400_000;
  const conso = (it.historique || []).filter(m => m.type === "sortie" && m.date && new Date(m.date).getTime() >= depuis).reduce((s, m) => s + (Number(m.quantite) || 0), 0);
  if (conso <= 0) return null;
  return it.quantite / (conso / (30 / 7));
}
function autonomieLabel(s: number | null): string {
  if (s == null) return "—";
  if (s >= 8) return `≈ ${Math.round(s / 4.345)} mois`;
  if (s >= 2) return `≈ ${Math.round(s)} sem.`;
  return `≈ ${Math.max(1, Math.round(s * 7))} j`;
}
// Dernier achat (dernière entrée) d'un produit, au format JJ/MM.
function dernierAchat(it: StockItem): string | null {
  const dates = (it.historique || []).filter(m => m.type === "entree" && m.date).map(m => m.date).sort();
  const last = dates[dates.length - 1];
  if (!last) return null;
  const d = new Date(last);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function QuickProspectModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ genre: "", prenom: "", nom: "", tel: "", email: "", typePresta: "", source: "", adresse: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.prenom || !form.nom) { setError("Prénom et nom sont requis."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      onSaved();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center"><UserSearch size={15} className="text-purple-600" /></div>
            <div><h2 className="font-semibold text-gray-900">Nouveau prospect</h2><p className="text-xs text-gray-400">Ajout rapide</p></div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={18} className="text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {error && <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>}
          <div className="flex gap-2">
            {["Monsieur","Madame"].map(g => (
              <button key={g} type="button" onClick={() => set("genre", form.genre === g ? "" : g)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${form.genre === g ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>{g}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Prénom *</label><input value={form.prenom} onChange={e => set("prenom", e.target.value)} className={inputCls} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Nom *</label><input value={form.nom} onChange={e => set("nom", e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Téléphone</label><input value={form.tel} onChange={e => set("tel", e.target.value)} className={inputCls} placeholder="06 00 00 00 00" /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Email</label><input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Type de prestation</label>
              <select value={form.typePresta} onChange={e => set("typePresta", e.target.value)} className={inputCls}>
                <option value="">— Sélectionner —</option>{TYPES_PRESTA_QUICK.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Source</label>
              <select value={form.source} onChange={e => set("source", e.target.value)} className={inputCls}>
                <option value="">— Source —</option>{SOURCES_PROSPECT.map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div><label className="text-xs text-gray-500 mb-1 block">Adresse / Zone</label>
            <AddressAutocomplete value={form.adresse} onChange={v => set("adresse", v)} onSelect={(a, cp, v) => set("adresse", `${a}, ${cp} ${v}`.trim())} className={inputCls} placeholder="Ville ou adresse" /></div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}{saving ? "Enregistrement…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [stats, setStats]         = useState<Stats | null>(null);
  const [depenses, setDepenses]   = useState<Depense[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [stock, setStock]         = useState<StockItem[]>([]);
  const [demandes, setDemandes]   = useState<Demande[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showNewClient, setShowNewClient]     = useState(false);
  const [showNewProspect, setShowNewProspect] = useState(false);
  const [showDropdown, setShowDropdown]       = useState(false);
  const [demandesModalOpen, setDemandesModalOpen] = useState(false);
  const [rentaPeriod, setRentaPeriod]         = useState<"semaine" | "mois">("mois");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const weekStart = useMemo(() => getMondayOfWeek(new Date()), []);
  const weekDays  = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysMini(weekStart, i)), [weekStart]);
  const today     = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayIso  = useMemo(() => new Date().toISOString().split("T")[0], []);

  const colorByPresta = useMemo(() => {
    const map: Record<string, string> = {};
    (stats?.prestataires ?? []).forEach((p, i) => { map[p.nom] = PALETTE_MINI[i % PALETTE_MINI.length]; });
    return map;
  }, [stats?.prestataires]);

  const weekPrestations = useMemo(() => {
    if (!stats) return [];
    return stats.prestations.filter(p => { if (!p.date) return false; const d = frToDateMini(p.date); return d && weekDays.some(wd => sameDayMini(d, wd)); });
  }, [stats, weekDays]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dashRes, depRes, proRes, stkRes, demRes] = await Promise.all([
        fetch("/api/dashboard"), fetch("/api/depenses"), fetch("/api/prospects"), fetch("/api/stock"), fetch("/api/stock/demandes"),
      ]);
      if (!dashRes.ok) throw new Error((await dashRes.json()).error || "Erreur serveur");
      setStats(await dashRes.json());
      if (depRes.ok) setDepenses(await depRes.json());
      if (proRes.ok) { const p = await proRes.json(); setProspects(Array.isArray(p) ? p : []); }
      if (stkRes.ok) { const s = await stkRes.json(); setStock(Array.isArray(s) ? s : []); }
      if (demRes.ok) { const d = await demRes.json(); setDemandes(Array.isArray(d.demandes) ? d.demandes : []); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur inconnue"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Tâches du jour ──────────────────────────────────────────────────────────
  const leadsNouveaux = prospects.filter(p => p.statut === "NOUVEAU");
  const aRelancer = prospects.filter(p => p.dateRelance && p.dateRelance <= todayIso && !["CONVERTI", "PERDU"].includes(p.statut));
  const rdvAujourdhui = (stats?.prestations ?? []).filter(p => { const d = frToDateMini(p.date); return d && sameDayMini(d, today); });
  const toReassign = stats?.toReassign ?? 0;

  // ── Alerte produits intelligente ────────────────────────────────────────────
  const produitsAlerte = useMemo(() => stock.filter(it => {
    const sousSeuil = it.seuil > 0 && it.quantite <= it.seuil;
    const a = autonomieSemaines(it);
    return sousSeuil || (a != null && a < 2);
  }), [stock]);

  // ── Demandes de matériel (prestataires) + congés à venir ─────────────────────
  const demandesNouvelles = demandes.filter(d => d.statut !== "TRAITEE");
  async function traiterDemande(id: string) {
    setDemandes(ds => ds.filter(d => d.id !== id));
    try { await fetch("/api/stock/demandes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, statut: "TRAITEE" }) }); } catch { /* ignore */ }
  }
  async function supprimerDemande(id: string) {
    setDemandes(ds => ds.filter(d => d.id !== id));
    try { await fetch("/api/stock/demandes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); } catch { /* ignore */ }
  }
  const congesAvenir = (stats?.prestataires ?? [])
    .flatMap(p => (p.indispos ?? []).filter(x => x.date >= todayIso).map(x => ({ nom: p.nom, ...x })))
    .sort((a, b) => (a.date + a.debut).localeCompare(b.date + b.debut));

  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"; })();
  const dateLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const taches = [
    { show: leadsNouveaux.length > 0, count: leadsNouveaux.length, sing: "nouveau lead à contacter", plur: "nouveaux leads à contacter", icon: Sparkles, color: "purple", href: "/prospects" },
    { show: aRelancer.length > 0,     count: aRelancer.length,     sing: "client à relancer aujourd'hui", plur: "clients à relancer aujourd'hui", icon: Phone, color: "amber", href: "/prospects" },
    { show: rdvAujourdhui.length > 0, count: rdvAujourdhui.length, sing: "rendez-vous aujourd'hui", plur: "rendez-vous aujourd'hui", icon: CalendarCheck, color: "blue", href: "/agenda" },
    { show: demandesNouvelles.length > 0, count: demandesNouvelles.length, sing: "demande de matériel", plur: "demandes de matériel", icon: Package, color: "sky", href: "#demandes-materiel" },
    { show: toReassign > 0,           count: toReassign,           sing: "prestation à réaffecter", plur: "prestations à réaffecter", icon: AlertTriangle, color: "red", href: "/prestations" },
  ].filter(t => t.show);
  const COLOR: Record<string, string> = { purple: "bg-purple-50 text-purple-700 border-purple-100", amber: "bg-amber-50 text-amber-700 border-amber-100", blue: "bg-blue-50 text-blue-700 border-blue-100", red: "bg-red-50 text-red-700 border-red-100", sky: "bg-sky-50 text-sky-700 border-sky-100" };
  const ICONBG: Record<string, string> = { purple: "bg-purple-100 text-purple-600", amber: "bg-amber-100 text-amber-600", blue: "bg-blue-100 text-blue-600", red: "bg-red-100 text-red-600", sky: "bg-sky-100 text-sky-600" };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Topbar
        title="Tableau de bord" subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        onRefresh={load} loading={loading} alerts={toReassign + produitsAlerte.length + demandesNouvelles.length}
        action={
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowDropdown(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700">
              <UserPlus size={15} /> Nouveau <ChevronDown size={14} className={`transition-transform ${showDropdown ? "rotate-180" : ""}`} />
            </button>
            {showDropdown && (
              <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-30 w-52">
                <button onClick={() => { setShowNewClient(true); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-green-50 text-left">
                  <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center"><UserPlus size={13} className="text-green-600" /></div>
                  <div><p className="font-medium">Nouveau client</p><p className="text-xs text-gray-400">Créer + 1er RDV</p></div>
                </button>
                <div className="border-t border-gray-50" />
                <button onClick={() => { setShowNewProspect(true); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 text-left">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center"><UserSearch size={13} className="text-purple-600" /></div>
                  <div><p className="font-medium">Nouveau prospect</p><p className="text-xs text-gray-400">À relancer plus tard</p></div>
                </button>
              </div>
            )}
          </div>
        }
      />

      <div className="flex-1 p-3 sm:p-6 space-y-4 w-full">

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
            <div><p className="font-semibold text-amber-800">Erreur de connexion</p><p className="text-sm text-amber-700 mt-1">{error}</p></div>
          </div>
        )}

        {/* ── Alerte produits intelligente ───────────────────────────────── */}
        {produitsAlerte.length > 0 && (
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0"><Package size={18} className="text-orange-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-orange-800 text-sm">⚠️ Attention aux produits</p>
              <p className="text-sm text-orange-700 mt-0.5">
                {produitsAlerte.length} produit{produitsAlerte.length > 1 ? "s" : ""} bientôt épuisé{produitsAlerte.length > 1 ? "s" : ""} au rythme de tes prestations : <strong>{produitsAlerte.slice(0, 3).map(p => p.nom).join(", ")}</strong>{produitsAlerte.length > 3 ? "…" : ""}. Pense à racheter.
              </p>
            </div>
            <a href="/stock" className="text-sm text-orange-700 font-medium underline flex-shrink-0 mt-1">Voir</a>
          </div>
        )}

        {/* ── À optimiser : insights intelligents pour piloter le business ── */}
        {stats && (() => {
          const now = Date.now();
          const cm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
          const inMonth = (fr: string) => { const p = fr.split("/"); return p.length === 3 && `${p[2]}-${p[1]}` === cm; };
          const caM  = stats.archive.filter(p => p.date && inMonth(p.date)).reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
          const depM = depenses.filter(d => d.type === "mensuel" || (d.type === "ponctuel" && d.date?.startsWith(cm))).reduce((s, d) => s + d.montant, 0);
          const benefM = caM - depM;
          const rdvPasses    = stats.prestations.filter(p => { const d = frToDateMini(p.date); return d && d < today; });
          const leadsFroids  = prospects.filter(p => p.statut === "NOUVEAU" && p.createdAt && (now - new Date(p.createdAt).getTime()) / 86_400_000 > 3);
          const relanceRetard = prospects.filter(p => p.dateRelance && p.dateRelance < todayIso && !["CONVERTI", "PERDU"].includes(p.statut));

          type Ins = { icon: string; color: string; title: string; text: string; href: string; cta: string };
          const ins: Ins[] = [];
          if (rdvPasses.length > 0)
            ins.push({ icon: "🗓️", color: "blue", title: `${rdvPasses.length} RDV passé${rdvPasses.length > 1 ? "s" : ""} à clôturer`, text: `Clôture-les (archive) pour que ton CA réalisé${caM === 0 ? " (actuellement 0 €)" : ""} et ton stock soient justes.`, href: "/agenda", cta: "Clôturer" });
          if (benefM < 0)
            ins.push({ icon: "📉", color: "orange", title: "Bénéfice du mois négatif", text: `${caM.toFixed(0)} € réalisé pour ${depM.toFixed(0)} € de charges. Encaisse tes prestations faites ou allège les charges fixes.`, href: "/depenses", cta: "Voir charges" });
          if (leadsFroids.length > 0)
            ins.push({ icon: "🔥", color: "purple", title: `${leadsFroids.length} lead${leadsFroids.length > 1 ? "s" : ""} en attente depuis +3 j`, text: "Un lead contacté vite convertit bien mieux. Rappelle-les tant qu'ils sont chauds.", href: "/prospects", cta: "Contacter" });
          if (relanceRetard.length > 0)
            ins.push({ icon: "⏰", color: "amber", title: `${relanceRetard.length} relance${relanceRetard.length > 1 ? "s" : ""} en retard`, text: "Des prospects devaient être relancés avant aujourd'hui.", href: "/prospects", cta: "Relancer" });
          if (ins.length === 0)
            ins.push({ icon: "💪", color: "emerald", title: "Tout roule !", text: benefM > 0 ? `Bénéfice positif ce mois (+${benefM.toFixed(0)} €). Continue comme ça.` : "Aucune action urgente. Pense à démarcher pour remplir l'agenda.", href: "/agenda", cta: "Agenda" });

          const C: Record<string, string> = { blue: "border-blue-100 bg-blue-50", orange: "border-orange-100 bg-orange-50", purple: "border-purple-100 bg-purple-50", amber: "border-amber-100 bg-amber-50", emerald: "border-emerald-100 bg-emerald-50" };
          const CT: Record<string, string> = { blue: "text-blue-700", orange: "text-orange-700", purple: "text-purple-700", amber: "text-amber-700", emerald: "text-emerald-700" };
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">🧭 À optimiser <span className="text-xs font-normal text-gray-400">tes priorités business</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {ins.slice(0, 3).map((x, i) => (
                  <a key={i} href={x.href} className={`flex flex-col gap-1 p-3 rounded-xl border ${C[x.color]} hover:brightness-[0.98] transition-all`}>
                    <p className={`text-sm font-semibold ${CT[x.color]} flex items-center gap-1.5`}><span>{x.icon}</span>{x.title}</p>
                    <p className="text-xs text-gray-600 leading-snug">{x.text}</p>
                    <span className={`text-xs font-medium ${CT[x.color]} inline-flex items-center gap-1 mt-1`}>{x.cta} <ArrowRight size={12} /></span>
                  </a>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-4">
        {/* ── À faire aujourd'hui ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">👋</span>
            <h2 className="font-bold text-gray-900">{greeting} — à faire aujourd&apos;hui</h2>
          </div>
          {loading && !stats ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : taches.length === 0 ? (
            <div className="flex items-center gap-3 py-4 justify-center text-center">
              <span className="text-2xl">🎉</span>
              <p className="text-gray-600 font-medium">Rien d&apos;urgent — tout est à jour. Profites-en !</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {taches.map((t, i) => (
                <a key={i} href={t.href}
                  onClick={t.href === "#demandes-materiel" ? (e) => { e.preventDefault(); setDemandesModalOpen(true); } : undefined}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${COLOR[t.color]} hover:brightness-[0.98] transition-all group cursor-pointer`}>
                  <div className={`w-9 h-9 rounded-lg ${ICONBG[t.color]} flex items-center justify-center flex-shrink-0`}><t.icon size={16} /></div>
                  <p className="flex-1 text-sm font-medium leading-tight"><span className="text-lg font-bold mr-1">{t.count}</span>{t.count > 1 ? t.plur : t.sing}</p>
                  <ArrowRight size={16} className="opacity-40 group-hover:translate-x-0.5 transition-transform" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── L'argent (CA réalisé = archivé, honnête) ────────────────────── */}
        {stats && (() => {
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const inMonth = (fr: string) => { const p = fr.split("/"); return p.length === 3 && `${p[2]}-${p[1]}` === currentMonth; };

          const dow = now.getDay(); const diffMon = dow === 0 ? -6 : 1 - dow;
          const wStart = new Date(now); wStart.setDate(now.getDate() + diffMon); wStart.setHours(0,0,0,0);
          const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6); wEnd.setHours(23,59,59,999);
          const inWeek = (fr: string) => { const p = fr.split("/"); if (p.length !== 3) return false; const d = new Date(+p[2], +p[1]-1, +p[0]); return d >= wStart && d <= wEnd; };

          const CANCEL = ["Annulation client", "Client injoignable", "Doublon"];
          const notCancelled = (p: Prestation) => !CANCEL.some(r => (p.archiveReason || "").startsWith(r));
          const filt = rentaPeriod === "semaine" ? inWeek : inMonth;
          const arch = stats.archive.filter(p => p.date && filt(p.date) && notCancelled(p));
          const ca = arch.reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
          // Références cumulées (le « depuis le début » que montrait l'ancien dashboard).
          const caTotal = stats.archive.filter(notCancelled).reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
          const caAnnee = stats.archive.filter(p => notCancelled(p) && p.date && p.date.split("/")[2] === String(now.getFullYear())).reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
          // Période précédente (semaine/mois d'avant) → tendance.
          const prevFilt = (fr: string) => {
            const p = fr.split("/"); if (p.length !== 3) return false;
            const d = new Date(+p[2], +p[1]-1, +p[0]);
            if (rentaPeriod === "semaine") { const ps = new Date(wStart); ps.setDate(ps.getDate()-7); const pe = new Date(wEnd); pe.setDate(pe.getDate()-7); return d >= ps && d <= pe; }
            const pm = new Date(now.getFullYear(), now.getMonth()-1, 1); const pmE = new Date(now.getFullYear(), now.getMonth(), 0); pmE.setHours(23,59,59,999); return d >= pm && d <= pmE;
          };
          const caPrev = stats.archive.filter(p => p.date && prevFilt(p.date)).reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
          const trend = caPrev > 0 ? Math.round((ca - caPrev) / caPrev * 100) : null;
          const comm = arch.reduce((s, p) => { const prix = parseFloat(p.prix) || 0; const v = parseFloat(p.commission) || 0; return s + ((p.commissionType || "%") === "%" ? prix * v / 100 : v); }, 0);
          const depPonc = depenses.filter(d => d.type === "ponctuel" && (rentaPeriod === "semaine" ? (() => { const d2 = new Date(d.date + "T00:00:00"); return d2 >= wStart && d2 <= wEnd; })() : d.date?.startsWith(currentMonth))).reduce((s, d) => s + d.montant, 0);
          const depFixe = depenses.filter(d => d.type === "mensuel").reduce((s, d) => s + d.montant, 0);
          const dep = depPonc + (rentaPeriod === "semaine" ? (depFixe / daysInMonth) * 7 : depFixe);
          const benefice = ca - dep - comm;
          // CA planifié = prestations à venir (potentiel, pas encore réalisé)
          const caAvenir = stats.upcomingList.reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);

          return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900">💶 L&apos;argent</h2>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                    {(["semaine", "mois"] as const).map(p => (
                      <button key={p} onClick={() => setRentaPeriod(p)} className={`px-3 py-1 rounded-lg text-xs font-medium ${rentaPeriod === p ? "bg-white shadow text-gray-800" : "text-gray-500"}`}>{p === "semaine" ? "Cette semaine" : "Ce mois"}</button>
                    ))}
                  </div>
                  <a href="/depenses" className="text-sm text-blue-600 hover:underline font-medium">Gérer</a>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-green-50 p-4">
                  <p className="text-xs text-gray-500">CA réalisé</p>
                  <p className="text-xl font-bold text-green-700">{ca.toFixed(0)} €</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                    {arch.length} presta terminée{arch.length > 1 ? "s" : ""}
                    {trend != null && (
                      <span className={`font-semibold ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%</span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-red-50 p-4"><p className="text-xs text-gray-500">Dépenses</p><p className="text-xl font-bold text-red-700">{dep.toFixed(0)} €</p><p className="text-[11px] text-gray-400 mt-0.5">charges incluses</p></div>
                <div className={`rounded-xl p-4 ${benefice >= 0 ? "bg-emerald-50" : "bg-orange-50"}`}><p className="text-xs text-gray-500">Bénéfice net</p><p className={`text-xl font-bold ${benefice >= 0 ? "text-emerald-700" : "text-orange-700"}`}>{benefice >= 0 ? "+" : ""}{benefice.toFixed(0)} €</p><p className="text-[11px] text-gray-400 mt-0.5">{ca > 0 ? `marge ${((benefice / ca) * 100).toFixed(0)}%` : "—"}</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
                <span>CA réalisé <strong className="text-gray-700">cette année {caAnnee.toFixed(0)} €</strong></span>
                <span>· depuis le début <strong className="text-gray-700">{caTotal.toFixed(0)} €</strong></span>
                {caAvenir > 0 && <span className="flex items-center gap-1"><CalendarCheck size={12} /> <strong className="text-gray-600">{caAvenir.toFixed(0)} €</strong> de RDV à venir</span>}
              </div>
            </div>
          );
        })()}

        </div>{/* fin colonne principale */}
        <div className="space-y-4">
        {/* ── Prochains rendez-vous ───────────────────────────────────────── */}
        {stats && stats.upcomingList.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">📅 Prochains rendez-vous</h2>
              <a href="/agenda" className="text-sm text-blue-600 hover:underline font-medium">Agenda</a>
            </div>
            <div className="space-y-2">
              {stats.upcomingList.map((p) => (
                <div key={p.row} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                  <div className="text-center flex-shrink-0 w-12">
                    <p className="text-sm font-bold text-blue-700 leading-tight">{p.date?.slice(0, 5)}</p>
                    {p.heure && <p className="text-[11px] text-gray-400">{p.heure}</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{p.prenom} {p.nom}</p>
                    <p className="text-xs text-gray-500 truncate">{p.typePresta}{p.adresse ? ` — ${p.adresse}` : ""}</p>
                  </div>
                  {p.prestataire ? (
                    <span className="flex items-center gap-1 text-xs text-green-700 flex-shrink-0"><UserCheck size={11} />{p.prestataire}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-600 flex-shrink-0"><Clock size={11} />À affecter</span>
                  )}
                  <StatusBadge statut={p.statut} small />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Clients à relancer aujourd'hui ──────────────────────────────── */}
        {aRelancer.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><BellRing size={16} className="text-amber-500" /> À relancer aujourd&apos;hui</h2>
              <a href="/prospects" className="text-sm text-blue-600 hover:underline font-medium">Tout voir</a>
            </div>
            <div className="space-y-2">
              {aRelancer.slice(0, 4).map(p => {
                const wa = p.tel ? `https://wa.me/${p.tel.replace(/\s/g,"").replace(/^0/,"33")}?text=${encodeURIComponent(`Bonjour ${p.prenom} 👋`)}` : null;
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs flex-shrink-0">{(p.prenom?.[0] ?? "?").toUpperCase()}</div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 truncate">{p.prenom} {p.nom}</p><p className="text-xs text-gray-500 truncate">{p.typePresta || "Prospect"}</p></div>
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 flex-shrink-0">WhatsApp</a>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Demandes de matériel (prestataires) ─────────────────────────── */}
        {demandesNouvelles.length > 0 && (
          <div id="demandes-materiel" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 scroll-mt-20">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-4"><Package size={16} className="text-sky-500" /> Demandes de matériel</h2>
            <div className="space-y-2">
              {demandesNouvelles.slice(0, 6).map(d => (
                <div key={d.id} className="flex items-start gap-3 p-3 rounded-xl bg-sky-50/60 border border-sky-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{d.categorie}{d.quantite ? ` · ${d.quantite}` : ""}</p>
                    {d.details && <p className="text-xs text-gray-500">{d.details}</p>}
                    <p className="text-[11px] text-gray-400 mt-0.5">{d.prestataireNom || "Prestataire"} · {new Date(d.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
                  </div>
                  <button onClick={() => traiterDemande(d.id)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 flex-shrink-0"><CheckCircle2 size={13} /> Fait</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Congés / indisponibilités à venir ───────────────────────────── */}
        {congesAvenir.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">🌴 Congés &amp; indispos à venir</h2>
            <div className="space-y-1.5">
              {congesAvenir.slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 font-medium">{c.nom}</span>
                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">{c.date.split("-").reverse().join("/")}{(c.debut || c.fin) ? ` · ${c.debut || "…"}–${c.fin || "…"}` : " · journée"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        </div>{/* fin colonne latérale */}
        </div>{/* fin grille 2 colonnes */}

        {/* ── Agenda de la semaine ────────────────────────────────────────── */}
        {stats && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><CalendarDays size={17} className="text-blue-600" /> Ta semaine</h2>
              <a href="/agenda" className="flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium">Ouvrir <ChevronRight size={14} /></a>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => {
                const isToday = sameDayMini(day, today);
                const events = weekPrestations.filter(p => { const d = frToDateMini(p.date); return d && sameDayMini(d, day); }).sort((a,b) => (a.heure||"").localeCompare(b.heure||""));
                return (
                  <div key={i} className={`rounded-xl border p-2 min-h-[104px] flex flex-col gap-1 ${isToday ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-gray-50"}`}>
                    <div className="text-center mb-1">
                      <p className="text-xs text-gray-400 font-medium uppercase">{JOURS_MINI[i]}</p>
                      <div className={`mx-auto w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-blue-600 text-white" : "text-gray-700"}`}>{day.getDate()}</div>
                    </div>
                    {events.map(ev => (
                      <a key={ev.row} href="/agenda" title={`${ev.heure ? ev.heure + " – " : ""}${ev.prenom} ${ev.nom} · ${ev.typePresta}`} className="block rounded px-1.5 py-0.5 text-white text-xs truncate leading-tight hover:opacity-80" style={{ backgroundColor: colorByPresta[ev.prestataire] ?? "#9CA3AF" }}>
                        {ev.heure && <span className="opacity-80 mr-1">{ev.heure}</span>}{ev.prenom} {ev.nom}
                      </a>
                    ))}
                    {events.length === 0 && <p className="text-xs text-gray-300 text-center mt-auto mb-auto">—</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Stock & matériel ────────────────────────────────────────────── */}
        {stock.length > 0 && (() => {
          const valeur = stock.reduce((s, it) => s + it.quantite * (it.prixUnitaire ?? 0), 0);
          const bas = stock.filter(it => it.seuil > 0 && it.quantite <= it.seuil);
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><Package size={17} className="text-orange-500" /> Stock &amp; matériel</h2>
                <a href="/stock" className="text-sm text-blue-600 hover:underline font-medium">Gérer le stock</a>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl bg-gray-50 p-3 text-center"><p className="text-lg font-bold text-gray-900">{stock.length}</p><p className="text-[11px] text-gray-400">Articles</p></div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center"><p className="text-lg font-bold text-emerald-700">{valeur.toFixed(0)} €</p><p className="text-[11px] text-gray-400">Valeur du stock</p></div>
                <div className={`rounded-xl p-3 text-center ${bas.length ? "bg-red-50" : "bg-gray-50"}`}><p className={`text-lg font-bold ${bas.length ? "text-red-600" : "text-gray-400"}`}>{bas.length}</p><p className="text-[11px] text-gray-400">À réapprovisionner</p></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[...stock].sort((a, b) => (autonomieSemaines(a) ?? 999) - (autonomieSemaines(b) ?? 999)).slice(0, 6).map(it => {
                  const a = autonomieSemaines(it); const low = it.seuil > 0 && it.quantite <= it.seuil; const buy = dernierAchat(it);
                  return (
                    <div key={it.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${low ? "bg-red-100 text-red-600" : "bg-orange-50 text-orange-500"}`}><Package size={15} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{it.nom}</p>
                        <p className="text-[11px] text-gray-400">{it.quantite} {it.unite}{buy ? ` · acheté le ${buy}` : " · jamais réapprovisionné"}</p>
                      </div>
                      <span className={`text-xs font-medium flex-shrink-0 ${a != null && a < 2 ? "text-red-600" : "text-gray-500"}`}>{autonomieLabel(a)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      </div>

      {showNewClient && <NewClientModal prestataires={stats?.prestataires ?? []} onClose={() => setShowNewClient(false)} onSaved={() => { setShowNewClient(false); load(); }} />}
      {showNewProspect && <QuickProspectModal onClose={() => setShowNewProspect(false)} onSaved={() => { setShowNewProspect(false); load(); }} />}

      {/* ── Pop-up des demandes de matériel ── */}
      {demandesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setDemandesModalOpen(false); }}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Package size={18} className="text-sky-500" /> Demandes de matériel</h2>
              <button onClick={() => setDemandesModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
              {demandesNouvelles.length === 0 ? (
                <div className="text-center py-10 text-gray-400"><Package size={36} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Aucune demande en attente 🎉</p></div>
              ) : demandesNouvelles.map(d => (
                <div key={d.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{d.categorie}{d.quantite ? ` · ${d.quantite}` : ""}</p>
                      <p className="text-[11px] text-gray-400">{d.prestataireNom || "Prestataire"} · {new Date(d.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                  {d.details && <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg p-2 whitespace-pre-line">{d.details}</p>}
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={() => traiterDemande(d.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600"><CheckCircle2 size={14} /> Marquer comme fait</button>
                    <button onClick={() => supprimerDemande(d.id)} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-sm hover:bg-gray-50">Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && !stats && (
        <div className="flex items-center justify-center py-20"><div className="text-center"><div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" /><p className="text-gray-500 text-sm">Chargement…</p></div></div>
      )}
    </div>
  );
}
