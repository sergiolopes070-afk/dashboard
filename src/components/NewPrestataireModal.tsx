"use client";
import { useState } from "react";
import { X, Save, Loader2, Wrench } from "lucide-react";

const inputCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function NewPrestataireModal({ onClose, onSaved }: Props) {
  const [form, setForm] = useState({ nom: "", email: "", tel: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.nom.trim()) { setError("Le nom est requis."); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/prestataires", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur serveur");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <Wrench size={20} className="text-orange-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Nouveau prestataire</h2>
              <p className="text-xs text-gray-400 mt-0.5">Ajouter un membre à l&apos;équipe</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
          )}
          <Field label="Nom complet" required>
            <input type="text" value={form.nom} onChange={(e) => set("nom", e.target.value)}
              className={inputCls} placeholder="Jean Dupont" autoFocus />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              className={inputCls} placeholder="jean@exemple.com" />
          </Field>
          <Field label="Téléphone / WhatsApp">
            <input type="tel" value={form.tel} onChange={(e) => set("tel", e.target.value)}
              className={inputCls} placeholder="06 00 00 00 00" />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-white transition-colors disabled:opacity-50">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Enregistrement..." : "Créer le prestataire"}
          </button>
        </div>

      </div>
    </div>
  );
}
