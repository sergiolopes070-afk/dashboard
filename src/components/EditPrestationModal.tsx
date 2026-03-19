"use client";
import { useState, useEffect } from "react";
import { X, Save, Loader2, Archive } from "lucide-react";
import { Prestation, Prestataire, StatutClient, StatutPresta } from "@/lib/constants";

interface EditPrestationModalProps {
  prestation: Prestation;
  prestataires: Prestataire[];
  onClose: () => void;
  onSaved: (row: string, updates: Record<string, string>) => void;
  onArchive?: (p: Prestation) => void;
}

const STATUTS_CLIENT: StatutClient[] = [
  "NOUVEAU",
  "EMAIL ENVOYÉ",
  "CONFIRMÉ",
  "TERMINÉ",
  "ANNULÉ",
  "PRESTATAIRE REFUSÉ – À RÉAFFECTER",
  "",
];

const STATUTS_PRESTA: StatutPresta[] = ["EN ATTENTE", "ACCEPTÉ", "REFUSÉ", ""];

export default function EditPrestationModal({
  prestation,
  prestataires,
  onClose,
  onSaved,
  onArchive,
}: EditPrestationModalProps) {
  // Commission : commission_type 'percent'/'fixed' ↔ mode '%'/'€'
  const parseStoredCommission = (raw: string) => {
    if (!raw) return { mode: "€" as "%" | "€", val: "" };
    if (raw.endsWith("%")) return { mode: "%" as "%" | "€", val: raw.slice(0, -1) };
    return { mode: "€" as "%" | "€", val: raw };
  };

  const { mode: initMode, val: initVal } = parseStoredCommission(prestation.commission);

  const [form, setForm] = useState({
    statut         : prestation.statut as string,
    statutPresta   : prestation.statutPresta as string,
    prestataireId  : prestation.prestataire_id ?? "",
    prix           : prestation.prix,
    date           : prestation.date,
    heure          : prestation.heure,
    envoyer        : prestation.envoyer,
    genDevis       : prestation.genDevis,
    commentaire    : prestation.commentaire,
    commissionMode : initMode,
    commissionVal  : initVal,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Prestataire sélectionné (pour afficher l'email)
  const selectedPresta = prestataires.find((p) => p.id === form.prestataireId);

  // Quand on change de prestataire, garder à jour l'affichage email
  useEffect(() => {
    // rien à faire, on lit selectedPresta directement
  }, [form.prestataireId]);

  // Convert date DD/MM/YYYY ↔ YYYY-MM-DD pour input[type=date]
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

  // Calcul commission (montant €) et bénéfice net
  const prix = parseFloat(form.prix) || 0;
  const commissionVal = parseFloat(form.commissionVal) || 0;
  const commissionAmt =
    form.commissionMode === "%"
      ? parseFloat(((prix * commissionVal) / 100).toFixed(2))
      : commissionVal;
  const benefice = parseFloat((prix - commissionAmt).toFixed(2));
  const rentable = benefice > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const commissionStored =
        form.commissionVal === ""
          ? ""
          : form.commissionMode === "%"
          ? `${form.commissionVal}%`
          : form.commissionVal;

      const updates: Record<string, string> = {
        statut        : form.statut,
        statutPresta  : form.statutPresta,
        prestataire_id: form.prestataireId,
        prix          : form.prix,
        date          : form.date,
        heure         : form.heure,
        envoyer       : form.envoyer,
        genDevis      : form.genDevis,
        commentaire   : form.commentaire,
        commission    : commissionStored,
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
      // Enrichit les updates avec le nom/email du prestataire pour rafraîchir la UI
      const enriched = {
        ...updates,
        prestataire: selectedPresta?.nom  ?? prestation.prestataire,
        emailPresta: selectedPresta?.email ?? prestation.emailPresta,
        commission : commissionStored,
      };
      onSaved(prestation.row, enriched);
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
            <p className="text-xs text-gray-400 mt-0.5">{prestation.typePresta}</p>
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
                value={form.prestataireId}
                onChange={(e) => setForm((f) => ({ ...f, prestataireId: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">(non assigné)</option>
                {prestataires.map((p) => (
                  <option key={p.id} value={p.id}>{p.nom}</option>
                ))}
              </select>
            </div>
            {selectedPresta?.email && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email prestataire</label>
                <input
                  type="text"
                  readOnly
                  value={selectedPresta.email}
                  className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-500"
                />
              </div>
            )}
            {selectedPresta?.tel && (
              <a
                href={`https://wa.me/${selectedPresta.tel}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.109.549 4.09 1.508 5.815L0 24l6.335-1.492A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.01-1.374l-.36-.213-3.736.879.938-3.638-.234-.373A9.818 9.818 0 1112 21.818z"/>
                </svg>
                Envoyer un message WhatsApp à {selectedPresta.nom}
              </a>
            )}
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

            {/* Commission prestataire */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Commission prestataire</label>
              <div className="flex gap-2 items-center">
                <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, commissionMode: "%" }))}
                    className={`px-3 py-2 font-medium transition-colors ${
                      form.commissionMode === "%" ? "bg-gray-800 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >%</button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, commissionMode: "€" }))}
                    className={`px-3 py-2 font-medium transition-colors ${
                      form.commissionMode === "€" ? "bg-gray-800 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >€</button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.commissionVal}
                  onChange={(e) => setForm((f) => ({ ...f, commissionVal: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder={form.commissionMode === "%" ? "ex: 40" : "ex: 50"}
                />
              </div>

              {form.commissionVal && prix > 0 && (
                <div
                  className={`mt-2 flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
                    rentable ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}
                >
                  <div className={rentable ? "text-green-800" : "text-red-800"}>
                    <div>Commission : <strong>{commissionAmt.toFixed(2)} €</strong></div>
                    <div>
                      Bénéfice net :{" "}
                      <strong>{benefice >= 0 ? "+" : ""}{benefice.toFixed(2)} €</strong>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                    rentable ? "bg-green-200 text-green-900" : "bg-red-200 text-red-900"
                  }`}>
                    {rentable ? "Rentable" : "Déficitaire"}
                  </span>
                </div>
              )}
            </div>
          </fieldset>

          {/* Actions */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</legend>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={form.envoyer === "OUI"}
                onChange={(e) => setForm((f) => ({ ...f, envoyer: e.target.checked ? "OUI" : "" }))}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">Email client envoyé</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={form.genDevis === "OUI" || form.genDevis === "FAIT"}
                onChange={(e) => setForm((f) => ({ ...f, genDevis: e.target.checked ? "FAIT" : "" }))}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">Devis généré</span>
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
        <div className="flex items-center justify-between px-5 pb-5">
          {onArchive && (
            <button
              onClick={() => { onArchive(prestation); onClose(); }}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-orange-200 text-orange-600 text-sm font-medium hover:bg-orange-50 transition-colors disabled:opacity-50"
            >
              <Archive size={15} />
              Archiver
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
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
    </div>
  );
}
