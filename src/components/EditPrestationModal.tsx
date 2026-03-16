"use client";
import { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { Prestation, Prestataire, StatutClient, StatutPresta } from "@/lib/constants";

interface EditPrestationModalProps {
  prestation: Prestation;
  prestataires: Prestataire[];
  onClose: () => void;
  onSaved: (row: string, updates: Record<string, string>) => void;
}

const STATUTS_CLIENT: StatutClient[] = [
  "EMAIL ENVOYÉ",
  "CONFIRMÉ",
  "TERMINÉ",
  "ANNULÉ",
  "PRESTATAIRE REFUSÉ – À RÉAFFECTER",
  "",
];

const STATUTS_PRESTA: StatutPresta[] = ["EN ATTENTE PRESTA", "ACCEPTÉ", "REFUSÉ", ""];

export default function EditPrestationModal({
  prestation,
  prestataires,
  onClose,
  onSaved,
}: EditPrestationModalProps) {
  const [form, setForm] = useState({
    statut      : prestation.statut       as string,
    statutPresta: prestation.statutPresta as string,
    prestataire : prestation.prestataire,
    emailPresta : prestation.emailPresta,
    prix        : prestation.prix,
    date        : prestation.date,
    heure       : prestation.heure,
    envoyer     : prestation.envoyer,
    genDevis    : prestation.genDevis,
    commentaire : prestation.commentaire,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Auto-fill emailPresta when prestataire changes from dropdown
  useEffect(() => {
    const found = prestataires.find((p) => p.nom === form.prestataire);
    if (found) setForm((f) => ({ ...f, emailPresta: found.email }));
  }, [form.prestataire, prestataires]);

  // Convert date DD/MM/YYYY ↔ YYYY-MM-DD for the input[type=date]
  const toInputDate = (d: string) => {
    if (!d) return "";
    const parts = d.split("/");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return d;
  };
  const fromInputDate = (d: string) => {
    if (!d) return "";
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updates: Record<string, string> = {
        statut      : form.statut,
        statutPresta: form.statutPresta,
        prestataire : form.prestataire,
        emailPresta : form.emailPresta,
        prix        : form.prix,
        date        : form.date,
        heure       : form.heure,
        envoyer     : form.envoyer,
        genDevis    : form.genDevis,
        commentaire : form.commentaire,
      };
      const res = await fetch("/api/prestations", {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ row: prestation.row, updates }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Erreur serveur");
      }
      onSaved(prestation.row, updates);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 text-base">
              Modifier — {prestation.prenom} {prestation.nom}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {prestation.typePresta}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Statuts */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Statuts</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Statut client</label>
                <select
                  value={form.statut}
                  onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {STATUTS_CLIENT.map((s) => (
                    <option key={s} value={s}>{s || "(vide)"}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Statut prestataire</label>
                <select
                  value={form.statutPresta}
                  onChange={(e) => setForm((f) => ({ ...f, statutPresta: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {STATUTS_PRESTA.map((s) => (
                    <option key={s} value={s}>{s || "(vide)"}</option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          {/* Assignation prestataire */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Prestataire</legend>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom</label>
              <select
                value={form.prestataire}
                onChange={(e) => setForm((f) => ({ ...f, prestataire: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">(non assigné)</option>
                {prestataires.map((p) => (
                  <option key={p.email} value={p.nom}>{p.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email prestataire</label>
              <input
                type="email"
                value={form.emailPresta}
                onChange={(e) => setForm((f) => ({ ...f, emailPresta: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="email@exemple.com"
              />
            </div>
          </fieldset>

          {/* Détails */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Détails</legend>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Prix (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.prix}
                  onChange={(e) => setForm((f) => ({ ...f, prix: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input
                  type="date"
                  value={toInputDate(form.date)}
                  onChange={(e) => setForm((f) => ({ ...f, date: fromInputDate(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Heure</label>
                <input
                  type="time"
                  value={form.heure}
                  onChange={(e) => setForm((f) => ({ ...f, heure: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>
          </fieldset>

          {/* Actions */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Actions
            </legend>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={form.envoyer === "OUI"}
                onChange={(e) => setForm((f) => ({ ...f, envoyer: e.target.checked ? "OUI" : "" }))}
                className="w-4 h-4 rounded text-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-700">Email client envoyé</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={form.genDevis === "OUI" || form.genDevis === "FAIT"}
                onChange={(e) => setForm((f) => ({ ...f, genDevis: e.target.checked ? "FAIT" : "" }))}
                className="w-4 h-4 rounded text-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-700">Devis généré</div>
              </div>
            </label>
          </fieldset>

          {/* Commentaire */}
          <fieldset>
            <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Commentaire interne
            </legend>
            <textarea
              value={form.commentaire}
              onChange={(e) => setForm((f) => ({ ...f, commentaire: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              placeholder="Notes internes..."
            />
          </fieldset>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
