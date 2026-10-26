"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  AlertTriangle, Clock, CalendarCheck, UserPlus, UserCheck,
  CalendarDays, ChevronRight, ChevronDown, UserSearch, X, Loader2,
  Package, Sparkles, Phone, ArrowRight, CheckCircle2, Mail, Download, FileSpreadsheet,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import StatusBadge from "@/components/StatusBadge";
import NewClientModal from "@/components/NewClientModal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import AvanceBadge from "@/components/AvanceBadge";
import { cacheGet, cacheSet } from "@/lib/dataCache";
import { bilanPeriode, caRealise, formatMontant, isoLocal, periodeMois } from "@/lib/finance";
import { grouperIndispos, libellePlage } from "@/lib/indispos";
import ClotureModal from "@/components/ClotureModal";
import { Prestation, Prestataire, Depense, PAIEMENTS_CLOTURE, MOTIF_TERMINEE, TYPES_PRESTATION } from "@/lib/constants";

// ── Mini agenda helpers ──────────────────────────────────────────────────────
const PALETTE_MINI = ["#4285F4","#EA4335","#34A853","#FBBC04","#8B5CF6","#F97316","#06B6D4","#EC4899","#10B981","#6366F1"];
const JOURS_MINI = ["L","M","M","J","V","S","D"];

// ── Export CSV (ouvre dans Excel/Sheets) ──────────────────────────────────────
// BOM UTF-8 + séparateur « ; » pour un affichage correct des accents dans Excel FR.
function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [headers, ...rows].map(r => r.map(esc).join(";")).join("\r\n");
}
function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

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
  upcomingList: Prestation[]; upcomingCA: number; toReassignList: Prestation[];
}
interface SuiviProspect {
  devisEnvoye?: boolean; devisDate?: string; devisNum?: string; relanceNiveau?: number; relanceDates?: string[];
  infosEnvoye?: boolean; infosDate?: string; infoRelanceNiveau?: number; infoRelanceDates?: string[];
}
interface Prospect { id: string; prenom: string; nom: string; tel: string; statut: string; dateRelance: string; typePresta: string; createdAt: string; suivi?: SuiviProspect; }

// Dernier mail envoyé à un prospect (devis, relance devis, demande d'infos, relance infos).
// Les dates du suivi sont au format JJ/MM/AAAA.
function dernierMail(s?: SuiviProspect): { label: string; date: string; jours: number } | null {
  if (!s) return null;
  const derniere = (arr?: string[]) => (arr && arr.length ? arr[arr.length - 1] : "");
  const envois = [
    { label: s.devisNum ? `Devis ${s.devisNum}` : "Devis", date: s.devisEnvoye ? s.devisDate || "" : "" },
    { label: `Relance devis R${s.relanceNiveau || s.relanceDates?.length || 1}`, date: derniere(s.relanceDates) },
    { label: "Demande d'infos", date: s.infosEnvoye ? s.infosDate || "" : "" },
    { label: `Relance infos R${s.infoRelanceNiveau || s.infoRelanceDates?.length || 1}`, date: derniere(s.infoRelanceDates) },
  ].map(e => ({ ...e, d: frToDateMini(e.date) })).filter(e => e.d) as { label: string; date: string; d: Date }[];
  if (!envois.length) return null;
  const last = envois.sort((a, b) => b.d.getTime() - a.d.getTime())[0];
  const auj = new Date(); auj.setHours(0, 0, 0, 0); // jours de calendrier, pas de 24 h glissantes
  const jours = Math.max(0, Math.round((auj.getTime() - last.d.getTime()) / 86_400_000));
  return { label: last.label, date: last.date.slice(0, 5), jours };
}
interface Demande { id: string; at: string; prestataireNom: string; categorie: string; quantite: string; details: string; statut: string; }
interface StockItem { id: string; nom: string; unite: string; quantite: number; seuil: number; prixUnitaire: number | null; conso: Record<string, number>; historique: { date: string; type: string; quantite: number }[]; }

const SOURCES_PROSPECT   = ["Google","Réseaux sociaux","Bouche à oreille","Recommandation","Formulaire web","Autre"];
const TYPES_PRESTA_QUICK = TYPES_PRESTATION; // liste commune (constants.ts)

// Autonomie d'un produit = stock / consommation hebdo réelle (sorties 30 j).
function autonomieSemaines(it: StockItem): number | null {
  const depuis = Date.now() - 30 * 86_400_000;
  const conso = (it.historique || []).filter(m => m.type === "sortie" && m.date && new Date(m.date).getTime() >= depuis).reduce((s, m) => s + (Number(m.quantite) || 0), 0);
  if (conso <= 0) return null;
  return it.quantite / (conso / (30 / 7));
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

const ACCUEIL_CACHE_KEY = "accueil";
interface AccueilCache { stats: Stats; depenses: Depense[]; prospects: Prospect[]; stock: StockItem[]; demandes: Demande[] }

export default function HomePage() {
  // Dernières données connues (cache mémoire) : affichage instantané au retour sur
  // l'accueil, la mise à jour se fait en arrière-plan.
  const cache = cacheGet<AccueilCache>(ACCUEIL_CACHE_KEY);
  const [stats, setStats]         = useState<Stats | null>(cache?.stats ?? null);
  const [depenses, setDepenses]   = useState<Depense[]>(cache?.depenses ?? []);
  const [prospects, setProspects] = useState<Prospect[]>(cache?.prospects ?? []);
  const [stock, setStock]         = useState<StockItem[]>(cache?.stock ?? []);
  const [demandes, setDemandes]   = useState<Demande[]>(cache?.demandes ?? []);
  const [loading, setLoading]     = useState(!cache);
  const [error, setError]         = useState<string | null>(null);
  const [showNewClient, setShowNewClient]     = useState(false);
  const [showNewProspect, setShowNewProspect] = useState(false);
  const [showDropdown, setShowDropdown]       = useState(false);
  const [showExport, setShowExport]           = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [demandesModalOpen, setDemandesModalOpen] = useState(false);
  const [clotureOpen, setClotureOpen]         = useState(false); // modale « RDV à clôturer »
  const [relanceOpen, setRelanceOpen]         = useState(false); // modale « relances en retard »
  const [busyId, setBusyId]                   = useState("");    // action en cours sur une ligne
  const [relanceRes, setRelanceRes]           = useState<Record<string, { ok: boolean; msg: string }>>({}); // résultat d'envoi par prospect
  const [clotPay, setClotPay]                 = useState<Record<string, string>>({}); // mode de paiement choisi par RDV
  const [clotDetail, setClotDetail]           = useState<Prestation | null>(null); // clôture complète (motif, satisfaction…)
  const [rentaPeriod, setRentaPeriod]         = useState<"semaine" | "mois">("mois");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Exports CSV (historique) ────────────────────────────────────────────────
  const todayTag = () => new Date().toISOString().split("T")[0];
  function exportPrestations() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arch: any[] = stats?.archive ?? [];
    const headers = ["Date", "Heure", "Client", "Téléphone", "Email", "Prestation", "Détail", "Adresse", "Prix (€)", "Mode paiement", "Prestataire", "Satisfaction", "Avis laissé", "Motif"];
    const rows = arch.map(p => [
      p.date || "", p.heure || "", `${p.prenom || ""} ${p.nom || ""}`.trim(), p.tel || "", p.email || "",
      p.typePresta || "", p.quantite || "", p.adresse || "", p.prix || "", p.modePaiement || "", p.prestataire || "",
      p.satisfaction ? `${p.satisfaction}/5` : "", p.avis === "OUI" ? "Oui" : "", p.archiveReason || "",
    ]);
    downloadCsv(`historique-prestations-${todayTag()}.csv`, toCsv(headers, rows));
    setShowExport(false);
  }
  function exportProspects(perdusOnly = false) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list: any[] = prospects as any[];
    if (perdusOnly) list = list.filter(p => p.statut === "PERDU");
    const headers = ["Date création", "Prénom", "Nom", "Téléphone", "Email", "Source", "Type prestation", "Statut", "Date relance", "Budget"];
    const rows = list.map(p => [
      p.createdAt ? new Date(p.createdAt).toLocaleDateString("fr-FR") : "", p.prenom || "", p.nom || "", p.tel || "",
      p.email || "", p.source || "", p.typePresta || "", p.statut || "", p.dateRelance || "", p.budget || "",
    ]);
    downloadCsv(`${perdusOnly ? "prospects-perdus" : "prospects"}-${todayTag()}.csv`, toCsv(headers, rows));
    setShowExport(false);
  }

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
      const prev = cacheGet<AccueilCache>(ACCUEIL_CACHE_KEY);
      const next: AccueilCache = {
        stats    : await dashRes.json(),
        depenses : depRes.ok ? await depRes.json() : prev?.depenses ?? [],
        prospects: proRes.ok ? await proRes.json().then(p => Array.isArray(p) ? p : []) : prev?.prospects ?? [],
        stock    : stkRes.ok ? await stkRes.json().then(x => Array.isArray(x) ? x : []) : prev?.stock ?? [],
        demandes : demRes.ok ? await demRes.json().then(d => Array.isArray(d.demandes) ? d.demandes : []) : prev?.demandes ?? [],
      };
      cacheSet(ACCUEIL_CACHE_KEY, next);
      setStats(next.stats); setDepenses(next.depenses); setProspects(next.prospects); setStock(next.stock); setDemandes(next.demandes);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur inconnue"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Tâches du jour ──────────────────────────────────────────────────────────
  const leadsNouveaux = prospects.filter(p => p.statut === "NOUVEAU");
  const rdvAujourdhui = (stats?.prestations ?? []).filter(p => { const d = frToDateMini(p.date); return d && sameDayMini(d, today); });
  const toReassign = stats?.toReassign ?? 0;

  // ── Listes gérées en pop-up depuis le tableau de bord (sans quitter la page) ──
  const rdvPasses = useMemo(
    () => (stats?.prestations ?? []).filter(p => { const d = frToDateMini(p.date); return d && d < today; })
      .sort((a, b) => (frToDateMini(a.date)?.getTime() ?? 0) - (frToDateMini(b.date)?.getTime() ?? 0)),
    [stats?.prestations, today],
  );
  // À relancer = aujourd'hui + en retard (⩽ aujourd'hui), pour la pop-up unique.
  const relanceEnRetard = useMemo(
    () => prospects.filter(p => p.dateRelance && p.dateRelance <= todayIso && !["CONVERTI", "PERDU"].includes(p.statut))
      .sort((a, b) => a.dateRelance.localeCompare(b.dateRelance)),
    [prospects, todayIso],
  );

  // Clôture (archive) d'un RDV passé, avec le mode de paiement choisi → MAJ CA/stock.
  async function cloturerRdv(id: string, modePaiement: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/archive", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reason: MOTIF_TERMINEE, modePaiement }),
      });
      if (res.ok) retirerRdvClotures([id]);
    } catch { /* non bloquant */ }
    finally { setBusyId(""); }
  }
  // Retire les RDV clôturés de la liste locale (pop-up + compteur).
  function retirerRdvClotures(ids: string[]) {
    setStats(s => s ? { ...s, prestations: s.prestations.filter(p => !ids.includes(p.row)) } : s);
  }
  // Reporte la relance d'un prospect à demain (reste géré depuis le tableau de bord).
  async function reporterRelance(id: string, isoDate: string) {
    setBusyId(id);
    try {
      await fetch(`/api/prospects/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateRelance: isoDate }),
      });
      setProspects(ps => ps.map(p => p.id === id ? { ...p, dateRelance: isoDate } : p));
    } catch { /* non bloquant */ }
    finally { setBusyId(""); }
  }
  // Envoie le mail de relance adapté (devis / infos / demande initiale) et
  // reprogramme à demain — directement depuis le tableau de bord.
  // Le résultat reste affiché sur la ligne (succès ou erreur exacte) : avant, une
  // erreur était avalée et le bouton semblait ne rien faire.
  async function relancerMail(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/prospects/${id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "relance_auto" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setProspects(ps => ps.map(p => p.id === id ? { ...p, dateRelance: d.dateRelance ?? p.dateRelance, statut: "RELANCÉ" } : p));
        setRelanceRes(r => ({ ...r, [id]: { ok: true, msg: `${d.libelle || "Relance"} envoyée${d.email ? ` à ${d.email}` : ""}` } }));
      } else {
        setRelanceRes(r => ({ ...r, [id]: { ok: false, msg: d.error || `Erreur serveur (${res.status})` } }));
      }
    } catch {
      setRelanceRes(r => ({ ...r, [id]: { ok: false, msg: "Pas de connexion au serveur — réessaie." } }));
    }
    finally { setBusyId(""); }
  }

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

  // Congés groupés par prestataire : jours entiers consécutifs → une plage (« du 10 au 14 déc. »).
  const congesGroupes = useMemo(() => {
    const parNom: Record<string, typeof congesAvenir> = {};
    congesAvenir.forEach(x => { (parNom[x.nom] ||= []).push(x); });
    return Object.entries(parNom)
      .flatMap(([nom, liste]) => grouperIndispos(liste).map(g => ({ nom, ...g })))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [congesAvenir]);

  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"; })();
  const dateLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const COLOR: Record<string, string> = { purple: "bg-purple-50 text-purple-700 border-purple-100", amber: "bg-amber-50 text-amber-700 border-amber-100", blue: "bg-blue-50 text-blue-700 border-blue-100", red: "bg-red-50 text-red-700 border-red-100", sky: "bg-sky-50 text-sky-700 border-sky-100", orange: "bg-orange-50 text-orange-700 border-orange-100" };
  const ICONBG: Record<string, string> = { purple: "bg-purple-100 text-purple-600", amber: "bg-amber-100 text-amber-600", blue: "bg-blue-100 text-blue-600", red: "bg-red-100 text-red-600", sky: "bg-sky-100 text-sky-600", orange: "bg-orange-100 text-orange-600" };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Topbar
        title="Tableau de bord" subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        onRefresh={load} loading={loading} alerts={toReassign + produitsAlerte.length + demandesNouvelles.length}
        action={
          <div className="flex items-center gap-2">
          <div className="relative" ref={exportRef}>
            <button onClick={() => setShowExport(v => !v)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50">
              <Download size={15} /> <span className="hidden sm:inline">Exporter</span> <ChevronDown size={14} className={`transition-transform ${showExport ? "rotate-180" : ""}`} />
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-30 w-64">
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Export CSV (Excel)</p>
                <button onClick={exportPrestations} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 text-left">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center"><FileSpreadsheet size={13} className="text-blue-600" /></div>
                  <div><p className="font-medium">Historique prestations</p><p className="text-xs text-gray-400">{stats?.archive?.length ?? 0} archivées (CA réalisé)</p></div>
                </button>
                <div className="border-t border-gray-50" />
                <button onClick={() => exportProspects(false)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 text-left">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center"><FileSpreadsheet size={13} className="text-purple-600" /></div>
                  <div><p className="font-medium">Tous les prospects</p><p className="text-xs text-gray-400">avec statut (dont perdus)</p></div>
                </button>
                <div className="border-t border-gray-50" />
                <button onClick={() => exportProspects(true)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center"><FileSpreadsheet size={13} className="text-gray-500" /></div>
                  <div><p className="font-medium">Prospects perdus</p><p className="text-xs text-gray-400">historique des perdus</p></div>
                </button>
              </div>
            )}
          </div>
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

        {/* ── À faire : toutes les actions du jour au même endroit ──────────
            Chaque ligne ouvre l'action sur place (pop-up) quand c'est possible. */}
        {(() => {
          const now = Date.now();
          const leadsFroids   = leadsNouveaux.filter(p => p.createdAt && (now - new Date(p.createdAt).getTime()) / 86_400_000 > 3);
          const relanceRetard = relanceEnRetard.filter(p => p.dateRelance < todayIso);
          type Tache = { count: number; sing: string; plur: string; hint?: string; icon: typeof Phone; color: string; href?: string; onClick?: () => void };
          const items: Tache[] = [
            { count: toReassign,               sing: "prestation à réaffecter",     plur: "prestations à réaffecter",     hint: "prestataire refusé", icon: AlertTriangle, color: "red", href: "/prestations" },
            { count: rdvPasses.length,         sing: "RDV passé à clôturer",        plur: "RDV passés à clôturer",        hint: "pour un CA et un stock justes", icon: CheckCircle2, color: "blue", onClick: () => setClotureOpen(true) },
            { count: rdvAujourdhui.length,     sing: "rendez-vous aujourd'hui",     plur: "rendez-vous aujourd'hui",      icon: CalendarCheck, color: "blue", href: "/agenda" },
            { count: relanceEnRetard.length,   sing: "prospect à relancer",         plur: "prospects à relancer",         hint: relanceRetard.length ? `dont ${relanceRetard.length} en retard` : undefined, icon: Phone, color: "amber", onClick: () => setRelanceOpen(true) },
            { count: leadsNouveaux.length,     sing: "nouveau lead à contacter",    plur: "nouveaux leads à contacter",   hint: leadsFroids.length ? `dont ${leadsFroids.length} depuis +3 j` : undefined, icon: Sparkles, color: "purple", href: "/prospects" },
            { count: demandesNouvelles.length, sing: "demande de matériel",         plur: "demandes de matériel",         icon: Package, color: "sky", onClick: () => setDemandesModalOpen(true) },
            { count: produitsAlerte.length,    sing: "produit bientôt épuisé",      plur: "produits bientôt épuisés",     hint: produitsAlerte.slice(0, 2).map(p => p.nom).join(", ") + (produitsAlerte.length > 2 ? "…" : ""), icon: Package, color: "orange", href: "/stock" },
          ].filter(t => t.count > 0);
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><span className="text-lg">👋</span>{greeting} — à faire</h2>
              {loading && !stats ? (
                <p className="text-sm text-gray-400">Chargement…</p>
              ) : items.length === 0 ? (
                <div className="flex items-center gap-3 py-4 justify-center text-center">
                  <span className="text-2xl">🎉</span>
                  <p className="text-gray-600 font-medium">Rien d&apos;urgent — tout est à jour. Profites-en !</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {items.map((t, i) => {
                    const inner = (
                      <>
                        <div className={`w-9 h-9 rounded-lg ${ICONBG[t.color]} flex items-center justify-center flex-shrink-0`}><t.icon size={16} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight"><span className="text-lg font-bold mr-1">{t.count}</span>{t.count > 1 ? t.plur : t.sing}</p>
                          {t.hint && <p className="text-[11px] opacity-75 truncate">{t.hint}</p>}
                        </div>
                        <ArrowRight size={16} className="opacity-40 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                      </>
                    );
                    const cls = `flex items-center gap-3 p-3 rounded-xl border text-left ${COLOR[t.color]} hover:brightness-[0.98] transition-all group`;
                    return t.onClick
                      ? <button key={i} type="button" onClick={t.onClick} className={cls}>{inner}</button>
                      : <a key={i} href={t.href} className={cls}>{inner}</a>;
                  })}
                </div>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-4">
        {/* ── Prochains rendez-vous : appel / WhatsApp en un geste ────────── */}
        {stats && stats.upcomingList.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-900">📅 Prochains rendez-vous</h2>
              <a href="/agenda" className="flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium">Agenda <ChevronRight size={14} /></a>
            </div>
            <div className="space-y-2">
              {stats.upcomingList.map((p) => {
                const d = frToDateMini(p.date);
                const isToday = !!d && sameDayMini(d, today);
                const wa = p.tel ? `https://wa.me/${p.tel.replace(/\s/g, "").replace(/^0/, "33")}` : null;
                return (
                  <div key={p.row} className={`flex items-center gap-3 p-3 rounded-xl border ${isToday ? "bg-blue-50 border-blue-200" : "bg-blue-50/40 border-blue-100"}`}>
                    <div className="text-center flex-shrink-0 w-12">
                      <p className="text-sm font-bold text-blue-700 leading-tight">{isToday ? "Auj." : p.date?.slice(0, 5)}</p>
                      {p.heure && <p className="text-[11px] text-gray-400">{p.heure}</p>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 flex items-center gap-1.5 min-w-0"><span className="truncate">{p.prenom} {p.nom}</span><AvanceBadge tel={p.tel} email={p.email} prenom={p.prenom} nom={p.nom} /></p>
                      <p className="text-xs text-gray-500 truncate">{p.typePresta}{p.adresse ? ` — ${p.adresse}` : ""}</p>
                      {p.prestataire
                        ? <p className="flex items-center gap-1 text-[11px] text-green-700 mt-0.5"><UserCheck size={11} />{p.prestataire}</p>
                        : <p className="flex items-center gap-1 text-[11px] text-amber-600 mt-0.5"><Clock size={11} />À affecter</p>}
                    </div>
                    <div className="hidden sm:block"><StatusBadge statut={p.statut} small /></div>
                    {p.tel && <a href={`tel:${p.tel}`} title="Appeler" className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"><Phone size={14} /></a>}
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="px-2.5 py-2 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 flex-shrink-0">WA</a>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── L'argent (CA réalisé = archivé, honnête) ────────────────────── */}
        {stats && (() => {
          // Mêmes règles que Pilotage, Dépenses et Historique (src/lib/finance.ts).
          const now = new Date();
          const dow = now.getDay(); const diffMon = dow === 0 ? -6 : 1 - dow;
          const wStart = new Date(now); wStart.setDate(now.getDate() + diffMon);
          const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6);
          const decale = (d: Date, jours: number) => { const r = new Date(d); r.setDate(r.getDate() + jours); return r; };
          const periode = rentaPeriod === "semaine"
            ? { debut: isoLocal(wStart), fin: isoLocal(wEnd) }
            : periodeMois(now.getFullYear(), now.getMonth());
          const precedente = rentaPeriod === "semaine"
            ? { debut: isoLocal(decale(wStart, -7)), fin: isoLocal(decale(wEnd, -7)) }
            : periodeMois(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), (now.getMonth() + 11) % 12);

          const bilan = bilanPeriode({ archive: stats.archive, depenses, ...periode, prorata: rentaPeriod === "semaine" });
          const { ca, charges: dep, benefice, marge } = bilan;
          const caPrev = caRealise(stats.archive, precedente.debut, precedente.fin);
          const trend = caPrev > 0 ? Math.round((ca - caPrev) / caPrev * 100) : null;
          // Références cumulées.
          const caTotal = caRealise(stats.archive);
          const caAnnee = caRealise(stats.archive, `${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`);
          // CA planifié = prestations à venir (potentiel, pas encore réalisé)
          const caAvenir = stats.upcomingCA;

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
                  <p className="text-xl font-bold text-green-700">{formatMontant(ca)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                    {bilan.nb} presta terminée{bilan.nb > 1 ? "s" : ""}
                    {trend != null && (
                      <span className={`font-semibold ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%</span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-red-50 p-4"><p className="text-xs text-gray-500">Dépenses</p><p className="text-xl font-bold text-red-700">{formatMontant(dep)}</p><p className="text-[11px] text-gray-400 mt-0.5">{bilan.commissions > 0 ? `+ ${formatMontant(bilan.commissions)} de commissions` : "charges incluses"}</p></div>
                <div className={`rounded-xl p-4 ${benefice >= 0 ? "bg-emerald-50" : "bg-orange-50"}`}><p className="text-xs text-gray-500">Bénéfice net</p><p className={`text-xl font-bold ${benefice >= 0 ? "text-emerald-700" : "text-orange-700"}`}>{formatMontant(benefice, { signe: true })}</p><p className="text-[11px] text-gray-400 mt-0.5">{marge != null ? `marge ${Math.round(marge)}%` : "—"}</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
                <span>CA réalisé <strong className="text-gray-700">cette année {formatMontant(caAnnee)}</strong></span>
                <span>· depuis le début <strong className="text-gray-700">{formatMontant(caTotal)}</strong></span>
                {caAvenir > 0 && <span className="flex items-center gap-1"><CalendarCheck size={12} /> <strong className="text-gray-600">{formatMontant(caAvenir)}</strong> de RDV à venir</span>}
              </div>
            </div>
          );
        })()}

        </div>{/* fin colonne principale */}
        <div className="space-y-4">

        {/* ── Congés / indisponibilités à venir ───────────────────────────── */}
        {congesAvenir.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">🌴 Congés &amp; indispos à venir</h2>
            <div className="space-y-1.5">
              {congesGroupes.slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-gray-700 font-medium">{c.nom}</span>
                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-right">
                    {libellePlage(c)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        </div>{/* fin colonne latérale */}
        </div>{/* fin grille 2 colonnes */}

        {/* ── Agenda de la semaine ────────────────────────────────────────── */}
        {stats && (
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
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


      </div>

      {showNewClient && <NewClientModal prestataires={stats?.prestataires ?? []} onClose={() => setShowNewClient(false)} onSaved={() => load()} /* reste ouverte sur l'écran de succès (confirmation client) */ />}
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

      {/* ── Pop-up « RDV à clôturer » — géré sur place, sans quitter le tableau de bord ── */}
      {clotureOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setClotureOpen(false); }}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">🗓️ RDV à clôturer <span className="text-xs font-normal text-gray-400">{rdvPasses.length}</span></h2>
              <button onClick={() => setClotureOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
              {rdvPasses.length === 0 ? (
                <div className="text-center py-10 text-gray-400"><CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Tout est clôturé 🎉</p></div>
              ) : rdvPasses.map(p => {
                const pay = clotPay[p.row] ?? "Avance immédiate";
                return (
                  <div key={p.row} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{p.prenom} {p.nom}</p>
                        <p className="text-[11px] text-gray-500">{p.date}{p.heure ? ` à ${p.heure}` : ""}{p.typePresta ? ` · ${p.typePresta}` : ""}</p>
                      </div>
                      {p.prix ? <span className="text-sm font-bold text-gray-700 flex-shrink-0">{p.prix} €</span> : null}
                    </div>
                    <div className="flex gap-2 mt-2.5">
                      <select value={pay} onChange={e => setClotPay(m => ({ ...m, [p.row]: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        {PAIEMENTS_CLOTURE.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button onClick={() => cloturerRdv(p.row, pay)} disabled={busyId === p.row}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 flex-shrink-0">
                        {busyId === p.row ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Clôturer
                      </button>
                    </div>
                    <button onClick={() => setClotDetail(p)} className="mt-1.5 text-[11px] text-gray-400 hover:text-gray-600 underline-offset-2 hover:underline">
                      Annulation, satisfaction, avis…
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 text-center flex-shrink-0">
              <a href="/agenda" className="text-xs text-gray-400 hover:text-gray-600">Ouvrir l'agenda pour plus d'options</a>
            </div>
          </div>
        </div>
      )}
      {/* Clôture complète d'un RDV de la liste — même modale que partout ailleurs */}
      {clotDetail && (
        <ClotureModal prestation={clotDetail} onClose={() => setClotDetail(null)} onDone={retirerRdvClotures} />
      )}

      {/* ── Pop-up « Relances en retard » — géré sur place ── */}
      {relanceOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setRelanceOpen(false); }}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">⏰ À relancer <span className="text-xs font-normal text-gray-400">{relanceEnRetard.length}</span></h2>
              <button onClick={() => setRelanceOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
              {relanceEnRetard.length === 0 ? (
                <div className="text-center py-10 text-gray-400"><CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Aucune relance en retard 🎉</p></div>
              ) : [...relanceEnRetard, ...prospects.filter(p => relanceRes[p.id] && !relanceEnRetard.includes(p))].map(p => {
                const res = relanceRes[p.id];
                const wa = p.tel ? `https://wa.me/${p.tel.replace(/\s/g, "").replace(/^0/, "33")}` : null;
                const demain = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();
                return (
                  <div key={p.id} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{p.prenom} {p.nom}</p>
                        <p className="text-[11px] text-red-500">À relancer depuis le {p.dateRelance.slice(0, 10).split("-").reverse().join("/")}{p.typePresta ? ` · ${p.typePresta}` : ""}</p>
                        {(() => {
                          const m = dernierMail(p.suivi);
                          return m
                            ? <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1"><Mail size={11} /> Dernier mail : <strong className="text-gray-700">{m.label}</strong> · {m.date}{m.jours > 0 ? ` (il y a ${m.jours} j)` : " (aujourd'hui)"}</p>
                            : <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1"><Mail size={11} /> Aucun mail envoyé depuis le dashboard</p>;
                        })()}
                      </div>
                      <a href={`/prospects?fiche=${p.id}`} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline flex-shrink-0">Fiche <ChevronRight size={12} /></a>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      <button onClick={() => relancerMail(p.id)} disabled={busyId === p.id}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
                        {busyId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Mail de relance
                      </button>
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 flex-shrink-0"><Phone size={14} /> WhatsApp</a>}
                      {p.tel && <a href={`tel:${p.tel}`} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 flex-shrink-0"><Phone size={14} /> Appeler</a>}
                      <button onClick={() => reporterRelance(p.id, demain)} disabled={busyId === p.id}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 disabled:opacity-50 flex-shrink-0">
                        {busyId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />} Reporter
                      </button>
                    </div>
                    {res && (
                      <p className={`mt-2 text-xs font-medium rounded-lg px-2.5 py-1.5 ${res.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {res.ok ? "✓ " : "⚠️ "}{res.msg}{res.ok ? " · reprogrammé à demain" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 text-center flex-shrink-0">
              <a href="/prospects" className="text-xs text-gray-400 hover:text-gray-600">Ouvrir la page prospects pour plus d'options</a>
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
