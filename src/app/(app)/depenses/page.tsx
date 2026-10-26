"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus, Trash2, Pencil, Receipt, TrendingDown, Calendar,
  RefreshCw, Paperclip, ExternalLink, X, Upload, Euro, Download,
  TrendingUp, BadgeEuro,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import { Depense, Prestation, CATEGORIES_DEPENSES } from "@/lib/constants";
import BankImportModal from "@/components/BankImportModal";
import {
  bilanPeriode, depensesDansPeriode, chargesPeriode, chargesParCategorie,
  countMonthlyOccurrences, isoLocal, periodeMois, nbJours, formatMontant,
} from "@/lib/finance";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function frDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function todayIso() {
  return isoLocal(); // date locale (toISOString décalait d'un jour avant 2h du matin)
}

function monthLabel(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Premier jour du mois courant en ISO */
function firstDayOfMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Lundi de la semaine courante */
function firstDayOfWeek(): string {
  const n = new Date();
  const day = n.getDay() === 0 ? 6 : n.getDay() - 1; // lundi = 0
  n.setDate(n.getDate() - day);
  return isoLocal(n);
}

/** Premier jour du trimestre courant */
function firstDayOfQuarter(): string {
  const n = new Date();
  const q = Math.floor(n.getMonth() / 3);
  const month = q * 3 + 1;
  return `${n.getFullYear()}-${String(month).padStart(2, "0")}-01`;
}

/** Premier jour de l'année courante */
function firstDayOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

// countMonthlyOccurrences / calculs de charges : voir lib/finance.ts (règles communes à tout le dashboard)

const TYPE_COLORS = {
  ponctuel: "bg-blue-100 text-blue-700",
  mensuel : "bg-purple-100 text-purple-700",
};

// ─── Modal ajout / édition ───────────────────────────────────────────────────

interface ModalProps {
  initial?: Depense | null;
  onClose: () => void;
  onSave: () => void;
}

function DepenseModal({ initial, onClose, onSave }: ModalProps) {
  const [nom,        setNom]        = useState(initial?.nom        ?? "");
  const [categorie,  setCategorie]  = useState(initial?.categorie  ?? "Autre");
  const [montant,    setMontant]    = useState(initial?.montant != null ? String(initial.montant) : "");
  const [type,       setType]       = useState<"ponctuel" | "mensuel">(initial?.type ?? "ponctuel");
  const [date,       setDate]       = useState(initial?.date       ?? todayIso());
  const [notes,      setNotes]      = useState(initial?.notes      ?? "");
  const [docUrl,     setDocUrl]     = useState(initial?.document_url  ?? "");
  const [docNom,     setDocNom]     = useState(initial?.document_nom  ?? "");
  const [uploading,  setUploading]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/depenses/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDocUrl(json.url);
      setDocNom(json.nom);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !montant) { setError("Nom et montant requis"); return; }
    setSaving(true);
    setError("");
    try {
      const payload = {
        nom: nom.trim(),
        categorie,
        montant: parseFloat(montant),
        type,
        date,
        notes: notes.trim() || null,
        document_url: docUrl || null,
        document_nom: docNom || null,
      };
      const url    = initial ? `/api/depenses/${initial.id}` : "/api/depenses";
      const method = initial ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Échec de l'enregistrement");
      }
      onSave();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-lg">
            {initial ? "Modifier la dépense" : "Nouvelle dépense"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Libellé *</label>
              <input
                autoFocus
                value={nom} onChange={e => setNom(e.target.value)} required
                placeholder="Ex: Abonnement Notion, Achat aspirateur…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Montant (€) *</label>
              <input
                type="number" min="0" step="0.01" value={montant}
                onChange={e => setMontant(e.target.value)} required
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
              <select
                value={categorie} onChange={e => setCategorie(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES_DEPENSES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <div className="flex gap-2 mt-1">
                {(["ponctuel", "mensuel"] as const).map(t => (
                  <button
                    key={t} type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all
                      ${type === t
                        ? t === "ponctuel" ? "bg-blue-600 text-white border-blue-600" : "bg-purple-600 text-white border-purple-600"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                  >
                    {t === "ponctuel" ? "Ponctuel" : "Mensuel"}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Détails, fournisseur, référence…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Document (facture, reçu…)</label>
              {docUrl ? (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  <Paperclip size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 truncate flex-1">{docNom}</span>
                  <a href={docUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700">
                    <ExternalLink size={14} />
                  </a>
                  <button type="button" onClick={() => { setDocUrl(""); setDocNom(""); }} className="text-gray-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-3 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                  <Upload size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-500">
                    {uploading ? "Envoi en cours…" : "Cliquer pour ajouter un fichier"}
                  </span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleUpload} />
                </label>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Annuler
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : initial ? "Modifier" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

type Preset = "semaine" | "mois" | "trimestre" | "annee" | "tout" | "custom";

export default function DepensesPage() {
  const toast = useToast();
  const [depenses,    setDepenses]    = useState<Depense[]>(() => cacheGet<Depense[]>(CACHE_KEYS.depenses) ?? []);
  // CA réalisé = prestations ARCHIVÉES hors annulations (et non les prestations en cours)
  const [archive,     setArchive]     = useState<Prestation[]>(() => cacheGet<Prestation[]>(CACHE_KEYS.archive) ?? []);
  const [loading,     setLoading]     = useState(() => !cacheHas(CACHE_KEYS.depenses));
  const [error,       setError]       = useState<string | null>(null);
  const [modal,       setModal]       = useState<"new" | Depense | null>(null);
  const [showImport,  setShowImport]  = useState(false);
  const [filterType,  setFilterType]  = useState<"tous" | "ponctuel" | "mensuel">("tous");
  const [filterCat,   setFilterCat]   = useState("tous");
  const [deleting]                    = useState<string | null>(null);

  // ── Période ──
  const [preset,       setPreset]       = useState<Preset>("mois");
  const [periodeDebut, setPeriodeDebut] = useState(firstDayOfMonth());
  const [periodeFin,   setPeriodeFin]   = useState(todayIso());

  function applyPreset(p: Preset) {
    setPreset(p);
    const today = todayIso();
    if (p === "semaine")   { setPeriodeDebut(firstDayOfWeek());    setPeriodeFin(today); }
    if (p === "mois")      { setPeriodeDebut(firstDayOfMonth());   setPeriodeFin(today); }
    if (p === "trimestre") { setPeriodeDebut(firstDayOfQuarter()); setPeriodeFin(today); }
    if (p === "annee")     { setPeriodeDebut(firstDayOfYear());    setPeriodeFin(today); }
    if (p === "tout")      { setPeriodeDebut("2000-01-01");        setPeriodeFin("2099-12-31"); }
    // "custom" : l'utilisateur modifie manuellement les dates
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [resD, resP] = await Promise.all([
        fetch("/api/depenses"),
        fetch("/api/archive"),
      ]);
      if (!resD.ok) throw new Error((await resD.json()).error);
      if (!resP.ok) throw new Error((await resP.json()).error);
      { const d = await resD.json(); setDepenses(d); cacheSet(CACHE_KEYS.depenses, d); }
      { const d = await resP.json(); setArchive(d); if (!cacheHas(CACHE_KEYS.archive)) cacheSet(CACHE_KEYS.archive, [...d].reverse()); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const headers = ["Nom", "Catégorie", "Montant", "Type", "Date", "Notes"];
    const rows = depenses.map(d => [
      d.nom, d.categorie, d.montant, d.type, d.date, d.notes ?? "",
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `depenses_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Filtres liste ──
  const filtered = useMemo(() => depenses.filter(d => {
    if (filterType !== "tous" && d.type !== filterType) return false;
    if (filterCat  !== "tous" && d.categorie !== filterCat) return false;
    return true;
  }), [depenses, filterType, filterCat]);

  // ── Calculs période (lib/finance.ts) ──
  // Vue semaine : charges mensuelles au prorata des jours ; mois/trimestre/année/tout :
  // une fois par occurrence mensuelle depuis leur date de début ; personnalisé : auto (< 28 j → prorata).
  const prorata = preset === "semaine" ? true : preset === "custom" ? undefined : false;

  const bilan = useMemo(
    () => bilanPeriode({ archive, depenses, debut: periodeDebut, fin: periodeFin, prorata }),
    [archive, depenses, periodeDebut, periodeFin, prorata]
  );

  const depensesPeriode = useMemo(
    () => depensesDansPeriode(depenses, periodeDebut, periodeFin, { prorata }),
    [depenses, periodeDebut, periodeFin, prorata]
  );

  const totalDepensesPeriode = bilan.charges;

  // Détail pour l'affichage : nb d'occurrences mensuelles dans la période
  const mensuelOccurrences = useMemo(() =>
    depenses
      .filter(d => d.type === "mensuel")
      .reduce((s, d) => s + countMonthlyOccurrences(d.date, periodeDebut, periodeFin), 0),
    [depenses, periodeDebut, periodeFin]
  );
  const prorataEffectif    = prorata ?? nbJours(periodeDebut, periodeFin) < 28;
  const mensuellesProrata  = depensesPeriode.filter(d => d.type === "mensuel").length;

  const revenusPeriode = bilan.ca;
  const beneficeNet    = bilan.benefice;

  // ── Répartition par catégorie (période sélectionnée, mêmes règles) ──
  const parCategorie = useMemo(
    () => chargesParCategorie(depenses, periodeDebut, periodeFin, { prorata }),
    [depenses, periodeDebut, periodeFin, prorata]
  );
  const totalCategories = Object.values(parCategorie).reduce((a, b) => a + b, 0);

  // ── Répartition par semaine (12 dernières semaines) ──
  const parSemaine = useMemo(() => {
    const semaines: { label: string; debut: string; fin: string; total: number }[] = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const lundi = new Date(today);
      const day = lundi.getDay() === 0 ? 6 : lundi.getDay() - 1;
      lundi.setDate(today.getDate() - day - i * 7);
      lundi.setHours(0, 0, 0, 0);
      const dimanche = new Date(lundi);
      dimanche.setDate(lundi.getDate() + 6);
      const debut = isoLocal(lundi);
      const fin   = isoLocal(dimanche);
      // Mensuelles au prorata (7/jours du mois) dès qu'elles ont commencé
      const total = chargesPeriode(depenses, debut, fin, { prorata: true });
      const label = lundi.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      semaines.push({ label, debut, fin, total });
    }
    return semaines;
  }, [depenses]);

  const maxSemaine = useMemo(() => Math.max(...parSemaine.map(s => s.total), 1), [parSemaine]);

  // ── Labels période ──
  const periodeLabel = useMemo(() => {
    if (preset === "tout") return "Toutes périodes";
    if (preset === "semaine") return "Semaine en cours";
    if (preset === "mois") return `Mois en cours (${monthLabel(periodeDebut)})`;
    if (preset === "trimestre") return "Trimestre en cours";
    if (preset === "annee") return `Année ${new Date().getFullYear()}`;
    return `${frDate(periodeDebut)} → ${frDate(periodeFin)}`;
  }, [preset, periodeDebut, periodeFin]);

  // ── Totaux globaux (hors période) ──
  const now = new Date();
  const totalMensuel = depenses.filter(d => d.type === "mensuel").reduce((s, d) => s + d.montant, 0);
  // Mois calendaire complet : ponctuelles du mois + chaque mensuelle déjà commencée (une fois)
  const moisCourant  = periodeMois(now.getFullYear(), now.getMonth());
  const totalMois    = chargesPeriode(depenses, moisCourant.debut, moisCourant.fin, { prorata: false });

  function handleDelete(id: string) {
    const item = depenses.find(d => d.id === id);
    if (!item) return;

    // Suppression optimiste : retrait immédiat de l'UI + possibilité d'annuler.
    setDepenses(prev => prev.filter(d => d.id !== id));
    let undone = false;

    toast.info("Dépense supprimée", {
      action: {
        label: "Annuler",
        onClick: () => { undone = true; setDepenses(prev => [item, ...prev]); },
      },
      duration: 5000,
    });

    // Suppression réelle différée : si l'utilisateur annule, on ne supprime rien.
    setTimeout(async () => {
      if (undone) return;
      try {
        const res = await fetch(`/api/depenses/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
      } catch {
        // Échec réseau ou serveur → on restaure et on prévient.
        setDepenses(prev => [item, ...prev]);
        toast.error("Échec de la suppression, dépense restaurée");
      }
    }, 5200);
  }

  const cats = ["tous", ...Array.from(new Set(depenses.map(d => d.categorie)))];

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "semaine",   label: "Cette semaine" },
    { key: "mois",      label: "Ce mois"       },
    { key: "trimestre", label: "Ce trimestre"  },
    { key: "annee",     label: "Cette année"   },
    { key: "tout",      label: "Tout"          },
    { key: "custom",    label: "Personnalisé"  },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Dépenses"
        subtitle="Suivi des charges et rentabilité"
        onRefresh={load}
        loading={loading}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Importer un relevé</span>
            </button>
            <button
              onClick={() => setModal("new")}
              aria-label="Nouvelle dépense"
              title="Nouvelle dépense"
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Nouvelle dépense</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>
        )}

        {/* ── Sélecteur de période ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
              <Calendar size={15} className="text-blue-500" />
              Période :
            </div>

            {/* Presets */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 max-w-full overflow-x-auto">
              {PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0
                    ${preset === key ? "bg-white shadow text-blue-600 font-semibold" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Dates custom */}
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date" value={periodeDebut}
                  onChange={e => setPeriodeDebut(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-sm">→</span>
                <input
                  type="date" value={periodeFin}
                  onChange={e => setPeriodeFin(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <span className="ml-auto text-xs text-gray-400 italic">{periodeLabel}</span>
          </div>
        </div>

        {/* ── KPIs période ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl p-5 flex items-center gap-4 border border-white shadow-sm bg-red-50">
            <div className="rounded-xl p-3 flex-shrink-0 bg-red-100 text-red-600">
              <TrendingDown size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Dépenses (période)</p>
              <p className="text-2xl font-bold text-red-700">{formatMontant(totalDepensesPeriode)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {depensesPeriode.length} charge{depensesPeriode.length > 1 ? "s" : ""}
                {prorataEffectif ? mensuellesProrata > 0 && (
                  <span className="text-purple-500 ml-1">· dont {mensuellesProrata} récurrente{mensuellesProrata > 1 ? "s" : ""} au prorata</span>
                ) : mensuelOccurrences > 0 && (
                  <span className="text-purple-500 ml-1">· dont {mensuelOccurrences} récurrente{mensuelOccurrences > 1 ? "s" : ""}</span>
                )}
              </p>
            </div>
          </div>

          <div className="rounded-2xl p-5 flex items-center gap-4 border border-white shadow-sm bg-emerald-50">
            <div className="rounded-xl p-3 flex-shrink-0 bg-emerald-100 text-emerald-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">CA réalisé (période)</p>
              <p className="text-2xl font-bold text-emerald-700">{formatMontant(revenusPeriode)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {bilan.nb} prestation{bilan.nb > 1 ? "s" : ""} terminée{bilan.nb > 1 ? "s" : ""}
                {bilan.commissions > 0 && <span className="ml-1">· commissions {formatMontant(bilan.commissions)}</span>}
              </p>
            </div>
          </div>

          <div className={`rounded-2xl p-5 flex items-center gap-4 border border-white shadow-sm ${beneficeNet >= 0 ? "bg-blue-50" : "bg-orange-50"}`}>
            <div className={`rounded-xl p-3 flex-shrink-0 ${beneficeNet >= 0 ? "bg-blue-100 text-blue-600" : "bg-orange-100 text-orange-600"}`}>
              <BadgeEuro size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Bénéfice net (période)</p>
              <p className={`text-2xl font-bold ${beneficeNet >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                {formatMontant(beneficeNet, { signe: true })}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {bilan.marge != null ? `Marge : ${bilan.marge.toFixed(0)} % · CA − commissions − charges` : "Pas de CA réalisé"}
              </p>
            </div>
          </div>
        </div>

        {/* ── KPIs globaux secondaires ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4 flex items-center gap-3 border border-gray-100 bg-white shadow-sm">
            <div className="rounded-lg p-2 bg-orange-100 text-orange-600 flex-shrink-0">
              <Calendar size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-400">Charges ce mois ({monthLabel(moisCourant.debut)})</p>
              <p className="text-lg font-bold text-orange-700">{formatMontant(totalMois)}</p>
            </div>
          </div>
          <div className="rounded-xl p-4 flex items-center gap-3 border border-gray-100 bg-white shadow-sm">
            <div className="rounded-lg p-2 bg-purple-100 text-purple-600 flex-shrink-0">
              <RefreshCw size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-400">Charges mensuelles fixes</p>
              <p className="text-lg font-bold text-purple-700">{formatMontant(totalMensuel)}</p>
            </div>
          </div>
        </div>

        {/* ── Panneau dédié : gestion des charges récurrentes ─────────────── */}
        {depenses.some(d => d.type === "mensuel") && (
          <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <RefreshCw size={16} className="text-purple-500" />
                Charges récurrentes
                <span className="text-xs font-normal text-gray-400">prélevées chaque mois</span>
              </h2>
              <span className="text-sm font-bold text-purple-700">{formatMontant(totalMensuel, { decimales: 2 })} / mois</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {depenses.filter(d => d.type === "mensuel").map(d => (
                <div key={d.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-purple-100 bg-purple-50/40">
                  <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                    <RefreshCw size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{d.nom}</p>
                    <p className="text-xs text-gray-400 truncate">{d.categorie} · {formatMontant(d.montant, { decimales: 2 })}/mois</p>
                  </div>
                  <button onClick={() => setModal(d)} title="Modifier"
                    className="p-2 rounded-lg text-gray-400 hover:bg-white hover:text-blue-600 transition-colors flex-shrink-0">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(d.id)} disabled={deleting === d.id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-40 flex-shrink-0">
                    <Trash2 size={14} /> Supprimer
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              💡 « Supprimer » retire une charge que tu ne paies plus (ex. un ancien loyer). Un bouton <strong>Annuler</strong> apparaît juste après si c&apos;est une erreur.
            </p>
          </div>
        )}

        {/* Filtres liste */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(["tous", "ponctuel", "mensuel"] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${filterType === t ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
              >
                {t === "tous" ? "Tous" : t === "ponctuel" ? "Ponctuel" : "Mensuel"}
              </button>
            ))}
          </div>

          <select
            value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {cats.map(c => <option key={c} value={c}>{c === "tous" ? "Toutes catégories" : c}</option>)}
          </select>

          {filtered.length !== depenses.length && (
            <span className="text-xs text-gray-500">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Liste */}
        {loading ? (
          <SkeletonList count={6} />
        ) : filtered.length === 0 && depenses.length > 0 ? (
          // Des dépenses existent mais les filtres les masquent toutes
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Receipt size={40} className="mb-3 opacity-30" />
            <p className="font-medium">Aucun résultat pour ces filtres</p>
            <button
              onClick={() => { setFilterType("tous"); setFilterCat("tous"); }}
              className="mt-3 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Receipt size={40} className="mb-3 opacity-30" />
            <p className="font-medium">Aucune dépense</p>
            <p className="text-sm mt-1">Cliquez sur &quot;Nouvelle dépense&quot; pour commencer</p>
          </div>
        ) : (
          <>
          {/* Mobile : cartes */}
          <div className="sm:hidden bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {filtered.map(d => (
              <div key={d.id} className="p-3 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-gray-900 truncate">{d.nom}</p>
                    <span className="font-semibold text-gray-900 whitespace-nowrap">{formatMontant(d.montant, { decimales: 2 })}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-gray-500">
                    <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[d.type]}`}>
                      {d.type === "ponctuel" ? "Ponctuel" : "Mensuel"}
                    </span>
                    <span>{d.categorie}</span>
                    <span className="text-gray-300">·</span>
                    <span>{frDate(d.date)}</span>
                  </div>
                  {d.notes && <p className="text-xs text-gray-400 truncate mt-0.5">{d.notes}</p>}
                </div>
                <div className="flex items-center flex-shrink-0">
                  {d.document_url && (
                    <a href={d.document_url} target="_blank" rel="noreferrer" aria-label="Voir le justificatif"
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50">
                      <Paperclip size={15} />
                    </a>
                  )}
                  <button onClick={() => setModal(d)} aria-label="Modifier"
                    className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(d.id)} disabled={deleting === d.id} aria-label="Supprimer"
                    className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            <div className="p-3 flex justify-between text-sm bg-gray-50 rounded-b-2xl">
              <span className="text-gray-600">Total ({filtered.length} dépense{filtered.length > 1 ? "s" : ""})</span>
              <span className="font-bold text-gray-900">{formatMontant(filtered.reduce((s, d) => s + d.montant, 0), { decimales: 2 })}</span>
            </div>
          </div>
          {/* Desktop : tableau */}
          <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Libellé</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Catégorie</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Montant</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Doc</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{d.nom}</p>
                      {d.notes && <p className="text-xs text-gray-400 truncate max-w-xs">{d.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{d.categorie}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[d.type]}`}>
                        {d.type === "ponctuel" ? "Ponctuel" : "Mensuel"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{frDate(d.date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatMontant(d.montant, { decimales: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {d.document_url ? (
                        <a href={d.document_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
                          <Paperclip size={13} />
                        </a>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setModal(d)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(d.id)}
                          disabled={deleting === d.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-100">
                  <td colSpan={4} className="px-4 py-3 text-sm font-medium text-gray-600">
                    Total affiché ({filtered.length} dépense{filtered.length > 1 ? "s" : ""})
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {formatMontant(filtered.reduce((s, d) => s + d.montant, 0), { decimales: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}

        {/* Répartition par semaine */}
        {depenses.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-gray-400" />
              Dépenses par semaine <span className="text-xs font-normal text-gray-400 ml-1">(12 dernières semaines)</span>
            </h2>
            <div className="flex items-end gap-1.5 h-28">
              {parSemaine.map((s, i) => {
                const isCurrentWeek = i === parSemaine.length - 1;
                const pct = maxSemaine > 0 ? (s.total / maxSemaine) * 100 : 0;
                return (
                  <div key={s.debut} className="flex-1 flex flex-col items-center gap-1 group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      Sem. du {s.label}<br />{formatMontant(s.total, { decimales: 2 })}
                    </div>
                    {/* Barre */}
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={`w-full rounded-t-lg transition-all ${isCurrentWeek ? "bg-blue-500" : "bg-blue-200 group-hover:bg-blue-300"}`}
                        style={{ height: pct > 0 ? `${Math.max(pct, 4)}%` : "2px" }}
                      />
                    </div>
                    {/* Label */}
                    <span className={`text-xs truncate w-full text-center ${isCurrentWeek ? "text-blue-600 font-semibold" : "text-gray-400"}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Légende */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block" />Semaine en cours</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-200 inline-block" />Semaines précédentes</span>
              <span className="ml-auto">Total 12 sem. : <strong className="text-gray-700">{formatMontant(parSemaine.reduce((s, w) => s + w.total, 0), { decimales: 2 })}</strong></span>
            </div>
          </div>
        )}

        {/* Répartition par catégorie */}
        {depenses.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Euro size={16} className="text-gray-400" />
              Répartition par catégorie <span className="text-xs font-normal text-gray-400 ml-1">({periodeLabel})</span>
            </h2>
            <div className="space-y-2">
              {totalCategories === 0 && <p className="text-sm text-gray-400">Aucune charge sur la période.</p>}
              {[...CATEGORIES_DEPENSES, ...Object.keys(parCategorie).filter(c => !(CATEGORIES_DEPENSES as readonly string[]).includes(c))].map(cat => {
                const total = parCategorie[cat] || 0;
                if (total === 0) return null;
                const pct = totalCategories > 0 ? (total / totalCategories) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{cat}</span>
                      <span className="font-medium text-gray-800">{formatMontant(total, { decimales: 2 })} <span className="text-gray-400 font-normal">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {modal !== null && (
        <DepenseModal
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => {
            toast.success(modal === "new" ? "Dépense enregistrée" : "Dépense modifiée");
            setModal(null);
            load();
          }}
        />
      )}

      {showImport && (
        <BankImportModal
          existing={depenses}
          onClose={() => setShowImport(false)}
          onImported={(n) => {
            setShowImport(false);
            toast.success(`${n} dépense${n > 1 ? "s" : ""} importée${n > 1 ? "s" : ""} depuis le relevé ✅`);
            load();
          }}
        />
      )}
    </div>
  );
}
