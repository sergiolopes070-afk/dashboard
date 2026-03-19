"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus, Trash2, Pencil, Receipt, TrendingDown, Calendar,
  RefreshCw, Paperclip, ExternalLink, X, Upload, Euro, Download,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { Depense, CATEGORIES_DEPENSES } from "@/lib/constants";

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

export default function DepensesPage() {
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [modal,    setModal]    = useState<"new" | Depense | null>(null);
  const [filterType, setFilterType] = useState<"tous" | "ponctuel" | "mensuel">("tous");
  const [filterCat,  setFilterCat]  = useState("tous");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/depenses");
      if (!res.ok) throw new Error((await res.json()).error);
      setDepenses(await res.json());
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

  const filtered = useMemo(() => depenses.filter(d => {
    if (filterType !== "tous" && d.type !== filterType) return false;
    if (filterCat  !== "tous" && d.categorie !== filterCat) return false;
    return true;
  }), [depenses, filterType, filterCat]);

  // ── Totaux ──
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const totalAll     = depenses.reduce((s, d) => s + d.montant, 0);
  const totalMensuel = depenses.filter(d => d.type === "mensuel").reduce((s, d) => s + d.montant, 0);
  const totalMois    = depenses
    .filter(d => d.date?.startsWith(currentMonth))
    .reduce((s, d) => s + d.montant, 0);

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

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total dépenses",       value: totalAll,     icon: TrendingDown, color: "red"    },
            { label: `Charges du mois (${monthLabel(currentMonth + "-01")})`, value: totalMois, icon: Calendar, color: "orange" },
            { label: "Charges mensuelles fixes", value: totalMensuel, icon: RefreshCw, color: "purple" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`rounded-2xl p-5 flex items-center gap-4 border border-white shadow-sm
              ${color === "red" ? "bg-red-50" : color === "orange" ? "bg-orange-50" : "bg-purple-50"}`}>
              <div className={`rounded-xl p-3 flex-shrink-0
                ${color === "red" ? "bg-red-100 text-red-600" : color === "orange" ? "bg-orange-100 text-orange-600" : "bg-purple-100 text-purple-600"}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className={`text-2xl font-bold ${color === "red" ? "text-red-700" : color === "orange" ? "text-orange-700" : "text-purple-700"}`}>
                  {value.toFixed(2)} €
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Filtres */}
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
