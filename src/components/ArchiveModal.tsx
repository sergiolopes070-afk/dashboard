"use client";
import { useState } from "react";
import { X, Archive, Loader2 } from "lucide-react";
import { Prestation } from "@/lib/constants";

interface ArchiveModalProps {
  prestation: Prestation;
  onClose: () => void;
  onArchived: (id: number) => void;
}

const RAISONS = [
  "Annulé par le client",
  "Mission terminée",
  "Client injoignable",
  "Prestation refusée",
  "Doublon",
  "Autre",
];

export default function ArchiveModal({ prestation, onClose, onArchived }: ArchiveModalProps) {
  const [raison, setRaison]   = useState(RAISONS[0]);
  const [custom, setCustom]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleArchive = async () => {
    setSaving(true);
    setError(null);
    try {
      const raisonFinale = raison === "Autre" ? custom.trim() || "Autre" : raison;
      const res = await fetch("/api/archive", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ id: prestation.row, raison: raisonFinale }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Erreur serveur");
      }
      onArchived(prestation.row);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
              <Archive size={18} className="text-orange-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-base">Archiver la prestation</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {prestation.prenom} {prestation.nom} · {prestation.typePresta}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Raison de l&apos;archivage
            </label>
            <div className="space-y-2">
              {RAISONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    raison === r
                      ? "border-orange-300 bg-orange-50"
                      : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="raison"
                    value={r}
                    checked={raison === r}
                    onChange={() => setRaison(r)}
                    className="accent-orange-500"
                  />
                  <span className="text-sm text-gray-700">{r}</span>
                </label>
              ))}
            </div>

            {raison === "Autre" && (
              <textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Précisez la raison..."
                rows={2}
                className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
            )}
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-orange-800 text-sm">
            Cette prestation sera déplacée dans l&apos;<strong>Historique</strong> et ne sera plus visible dans la liste active.
          </div>
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
            onClick={handleArchive}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
            {saving ? "Archivage..." : "Archiver"}
          </button>
        </div>
      </div>
    </div>
  );
}
