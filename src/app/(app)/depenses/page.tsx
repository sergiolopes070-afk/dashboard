"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus, Trash2, Pencil, Receipt, TrendingDown, Calendar,
  RefreshCw, Paperclip, ExternalLink, X, Upload, Euro, Download,
  TrendingUp, BadgeEuro,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { Depense, Prestation, CATEGORIES_DEPENSES } from "@/lib/constants";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function frDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Convertit "dd/mm/yyyy" → "yyyy-mm-dd" pour comparaison */
function frToIso(fr: string): string {
  if (!fr) return "";
  const parts = fr.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
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
  return n.toISOString().slice(0, 10);
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

/**
 * Pour une dépense mensuelle, calcule combien de fois elle tombe dans [debut, fin].
 * Ex: dépense créée le 15 jan, période fév→mars → 2 occurrences (15 fév + 15 mar).
 */
function countMonthlyOccurrences(expenseIso: string, debut: string, fin: string): number {
  if (!expenseIso) return 0;
  const expDay = parseInt(expenseIso.slice(8, 10), 10);
  const start  = new Date(debut + "T00:00:00");
  const end    = new Date(fin   + "T00:00:00");
  let count = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endM = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endM) {
    const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const day     = Math.min(expDay, lastDay);
    const occIso  = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (occIso >= debut && occIso <= fin) count++;
    cur.setMonth(cur.getMonth() + 1);
  }
  return count;
}

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
      if (!res.ok) throw new Error((await res.json()).error);
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
  const [depenses,    setDepenses]    = useState<Depense[]>([]);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [modal,       setModal]       = useState<"new" | Depense | null>(null);
  const [filterType,  setFilterType]  = useState<"tous" | "ponctuel" | "mensuel">("tous");
  const [filterCat,   setFilterCat]   = useState("tous");
  const [deleting,    setDeleting]    = useState<string | null>(null);

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
        fetch("/api/prestations"),
      ]);
      if (!resD.ok) throw new Error((await resD.json()).error);
      if (!resP.ok) throw new Error((await resP.json()).error);
      setDepenses(await resD.json());
      setPrestations(await resP.json());
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

  // ── Calculs période ──
  // Les dépenses mensuelles se répètent chaque mois → on multiplie par le nb d'occurrences
  const depensesPeriode = useMemo(() =>
    depenses.filter(d => {
      if (d.type === "mensuel") return countMonthlyOccurrences(d.date, periodeDebut, periodeFin) > 0;
      return d.date >= periodeDebut && d.date <= periodeFin;
    }),
    [depenses, periodeDebut, periodeFin]
  );

  const totalDepensesPeriode = useMemo(() =>
    depenses.reduce((s, d) => {
      if (d.type === "mensuel") {
        return s + d.montant * countMonthlyOccurrences(d.date, periodeDebut, periodeFin);
      }
      return d.date >= periodeDebut && d.date <= periodeFin ? s + d.montant : s;
    }, 0),
    [depenses, periodeDebut, periodeFin]
  );

  // Détail pour l'affichage : nb d'occurrences mensuel dans la période
  const mensuelOccurrences = useMemo(() =>
    depenses
      .filter(d => d.type === "mensuel")
      .reduce((s, d) => s + countMonthlyOccurrences(d.date, periodeDebut, periodeFin), 0),
    [depenses, periodeDebut, periodeFin]
  );

  const revenusPeriode = useMemo(() =>
    prestations
      .filter(p => {
        const iso = frToIso(p.date);
        return iso >= periodeDebut && iso <= periodeFin;
      })
      .reduce((s, p) => s + (parseFloat(p.prix) || 0), 0),
    [prestations, periodeDebut, periodeFin]
  );

  const beneficeNet = revenusPeriode - totalDepensesPeriode;

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
      const debut = lundi.toISOString().slice(0, 10);
      const fin   = dimanche.toISOString().slice(0, 10);
      const total = depenses
        .filter(d => d.date >= debut && d.date <= fin)
        .reduce((s, d) => s + d.montant, 0);
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
    return `${frDate(periodeDebut.split("-").reverse().join("/"))} → ${frDate(periodeFin.split("-").reverse().join("/"))}`;
  }, [preset, periodeDebut, periodeFin]);

  // ── Totaux globaux (hors période) ──
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const totalMensuel = depenses.filter(d => d.type === "mensuel").reduce((s, d) => s + d.montant, 0);
  const totalMois    = depenses.filter(d => d.date?.startsWith(currentMonth)).reduce((s, d) => s + d.montant, 0);

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette dépense ?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/depenses/${id}`, { method: "DELETE" });
      setDepenses(prev => prev.filter(d => d.id !== id));
    } finally {
      setDeleting(null);
    }
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
              Export CSV
            </button>
            <button
              onClick={() => setModal("new")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={15} />
              Nouvelle dépense
            </button>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6">

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
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
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
              <p className="text-2xl font-bold text-red-700">{totalDepensesPeriode.toFixed(2)} €</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {depensesPeriode.length} charge{depensesPeriode.length > 1 ? "s" : ""}
                {mensuelOccurrences > 0 && (
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
              <p className="text-xs text-gray-500 font-medium">Revenus (période)</p>
              <p className="text-2xl font-bold text-emerald-700">{revenusPeriode.toFixed(2)} €</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {prestations.filter(p => { const iso = frToIso(p.date); return iso >= periodeDebut && iso <= periodeFin; }).length} prestation{prestations.filter(p => { const iso = frToIso(p.date); return iso >= periodeDebut && iso <= periodeFin; }).length > 1 ? "s" : ""}
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
                {beneficeNet >= 0 ? "+" : ""}{beneficeNet.toFixed(2)} €
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {revenusPeriode > 0 ? `Marge : ${((beneficeNet / revenusPeriode) * 100).toFixed(0)}%` : "Pas de revenus"}
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
              <p className="text-xs text-gray-400">Charges ce mois ({monthLabel(currentMonth + "-01")})</p>
              <p className="text-lg font-bold text-orange-700">{totalMois.toFixed(2)} €</p>
            </div>
          </div>
          <div className="rounded-xl p-4 flex items-center gap-3 border border-gray-100 bg-white shadow-sm">
            <div className="rounded-lg p-2 bg-purple-100 text-purple-600 flex-shrink-0">
              <RefreshCw size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-400">Charges mensuelles fixes</p>
              <p className="text-lg font-bold text-purple-700">{totalMensuel.toFixed(2)} €</p>
            </div>
          </div>
        </div>

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
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Receipt size={40} className="mb-3 opacity-30" />
            <p className="font-medium">Aucune dépense</p>
            <p className="text-sm mt-1">Cliquez sur &quot;Nouvelle dépense&quot; pour commencer</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                      {d.montant.toFixed(2)} €
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
                    {filtered.reduce((s, d) => s + d.montant, 0).toFixed(2)} €
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
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
                      Sem. du {s.label}<br />{s.total.toFixed(2)} €
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
              <span className="ml-auto">Total 12 sem. : <strong className="text-gray-700">{parSemaine.reduce((s, w) => s + w.total, 0).toFixed(2)} €</strong></span>
            </div>
          </div>
        )}

        {/* Répartition par catégorie */}
        {depenses.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Euro size={16} className="text-gray-400" />
              Répartition par catégorie
            </h2>
            <div className="space-y-2">
              {CATEGORIES_DEPENSES.map(cat => {
                const total = depenses.filter(d => d.categorie === cat).reduce((s, d) => s + d.montant, 0);
                if (total === 0) return null;
                const totalAll = depenses.reduce((s, d) => s + d.montant, 0);
                const pct = totalAll > 0 ? (total / totalAll) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{cat}</span>
                      <span className="font-medium text-gray-800">{total.toFixed(2)} € <span className="text-gray-400 font-normal">({pct.toFixed(0)}%)</span></span>
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
          onSave={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
