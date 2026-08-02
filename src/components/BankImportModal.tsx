"use client";
import { useState, useMemo } from "react";
import { X, Upload, Loader2, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { Depense, CATEGORIES_DEPENSES } from "@/lib/constants";
import { parseStatement, rowKey, type BankRow } from "@/lib/bankParse";

interface PreviewRow extends BankRow {
  id: number;
  selected: boolean;
  dup: boolean;
}

const frDate = (iso: string) => {
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
};

export default function BankImportModal({
  existing, onClose, onImported,
}: {
  existing: Depense[];
  onClose: () => void;
  onImported: (n: number) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows]         = useState<PreviewRow[]>([]);
  const [summary, setSummary]   = useState<{ credits: number; ignores: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError]       = useState("");

  // Clés déjà en base → anti-doublon.
  const existingKeys = useMemo(
    () => new Set(existing.map(d => rowKey(d.date, d.montant, d.nom))),
    [existing]
  );

  function handleFile(file: File) {
    setError(""); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const res = parseStatement(text);
        if (!res.rows.length) {
          setError("Aucune dépense détectée dans ce fichier. Vérifie que c'est bien un export CSV de relevé.");
          setRows([]); setSummary(null); return;
        }
        const seen = new Set<string>();
        const preview: PreviewRow[] = res.rows.map((r, i) => {
          const k = rowKey(r.date, r.amount, r.label);
          const dup = existingKeys.has(k) || seen.has(k);
          seen.add(k);
          return { ...r, id: i, dup, selected: !dup };
        });
        setRows(preview);
        setSummary({ credits: res.ignoredCredits, ignores: res.ignoredRows });
      } catch {
        setError("Impossible de lire ce fichier.");
      }
    };
    reader.readAsText(file);
  }

  const update = (id: number, patch: Partial<PreviewRow>) =>
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const selected = rows.filter(r => r.selected);
  const totalSel = selected.reduce((s, r) => s + r.amount, 0);

  async function doImport() {
    if (!selected.length) return;
    setImporting(true); setError("");
    try {
      const depenses = selected.map(r => ({
        nom: r.label, categorie: r.categorie, montant: r.amount,
        type: r.type, date: r.date, notes: "Import relevé bancaire",
      }));
      const res = await fetch("/api/depenses/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depenses }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur d'import");
      onImported(d.imported ?? selected.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'import");
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Upload size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Importer un relevé bancaire</h2>
              <p className="text-xs text-gray-400 mt-0.5">Fichier CSV exporté depuis ta banque — catégorisation automatique</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />{error}
            </div>
          )}

          {rows.length === 0 ? (
            <>
              <label className="block border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
                <input type="file" accept=".csv,.txt,text/csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                <FileText size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="font-medium text-gray-700">Choisir le fichier CSV du relevé</p>
                <p className="text-xs text-gray-400 mt-1">Glisse ou clique — rien n'est envoyé tant que tu n'as pas validé l'aperçu</p>
              </label>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">Comment exporter ?</p>
                <p className="text-blue-700 text-[13px] leading-relaxed">
                  Dans ton espace bancaire : <strong>Mes opérations → Exporter / Télécharger → format CSV (Excel)</strong>.
                  On ne garde que les <strong>débits</strong> (sorties d'argent) ; les entrées sont ignorées.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Résumé */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600">
                  <FileText size={13} /> {fileName}
                </span>
                <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-medium">{rows.length} dépense{rows.length > 1 ? "s" : ""} détectée{rows.length > 1 ? "s" : ""}</span>
                {summary && summary.credits > 0 && <span className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500">{summary.credits} entrée{summary.credits > 1 ? "s" : ""} ignorée{summary.credits > 1 ? "s" : ""}</span>}
                {rows.some(r => r.dup) && <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700">{rows.filter(r => r.dup).length} doublon{rows.filter(r => r.dup).length > 1 ? "s" : ""} déjà en base (décoché)</span>}
              </div>

              {/* Tableau aperçu */}
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="w-9 px-2 py-2"></th>
                      <th className="text-left px-2 py-2 font-medium">Date</th>
                      <th className="text-left px-2 py-2 font-medium">Libellé</th>
                      <th className="text-left px-2 py-2 font-medium">Catégorie</th>
                      <th className="text-center px-2 py-2 font-medium">Récurrent</th>
                      <th className="text-right px-2 py-2 font-medium">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(r => (
                      <tr key={r.id} className={r.selected ? "" : "opacity-40"}>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={r.selected} onChange={e => update(r.id, { selected: e.target.checked })} className="w-4 h-4 rounded" />
                        </td>
                        <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{frDate(r.date)}</td>
                        <td className="px-2 py-1.5 text-gray-800 max-w-[220px] truncate" title={r.label}>{r.label}</td>
                        <td className="px-2 py-1.5">
                          <select value={r.categorie} onChange={e => update(r.id, { categorie: e.target.value })}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300">
                            {CATEGORIES_DEPENSES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button type="button" onClick={() => update(r.id, { type: r.type === "mensuel" ? "ponctuel" : "mensuel" })}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${r.type === "mensuel" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400"}`}>
                            {r.type === "mensuel" ? "Mensuel" : "Ponctuel"}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-gray-900 whitespace-nowrap">{r.amount.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400">Ajuste les catégories si besoin, décoche ce que tu ne veux pas, puis valide. Les récurrents (loyer, assurance…) sont pré-repérés.</p>
            </>
          )}
        </div>

        {/* Footer */}
        {rows.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50 rounded-b-2xl">
            <button onClick={() => { setRows([]); setSummary(null); setError(""); }} disabled={importing}
              className="text-sm text-gray-500 hover:text-gray-700">← Autre fichier</button>
            <button onClick={doImport} disabled={importing || !selected.length}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {importing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Importer {selected.length} dépense{selected.length > 1 ? "s" : ""} ({totalSel.toFixed(2)} €)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
