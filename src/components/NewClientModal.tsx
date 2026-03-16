"use client";
import { useState } from "react";
import { X, Save, Loader2, UserPlus, User, Briefcase, MapPin, Settings2 } from "lucide-react";
import { Prestataire } from "@/lib/constants";

// ─── Options ─────────────────────────────────────────────────────────────────

const SOURCES = [
  "Formulaire web",
  "Recommandation",
  "Google",
  "Bouche à oreille",
  "Réseaux sociaux",
  "Autre",
];

const STATUTS_CLIENT = ["NOUVEAU", "ACTIF", "VIP", "À RELANCER"];

const TYPES_PRESTA = [
  "Ménage",
  "Repassage",
  "Vitres",
  "Débarras",
  "Après travaux",
  "Bureaux",
  "Autre",
];

const STATUTS_PRESTA = [
  { value: "",             label: "NOUVEAU (défaut)" },
  { value: "EMAIL ENVOYÉ", label: "EMAIL ENVOYÉ" },
  { value: "CONFIRMÉ",     label: "CONFIRMÉ" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";

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

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
        <Icon size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Composant ───────────────────────────────────────────────────────────────

interface Props {
  prestataires: Prestataire[];
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY = {
  // Client
  prenom       : "",
  nom          : "",
  tel          : "",
  email        : "",
  adresse      : "",
  source       : "",
  statutClient : "NOUVEAU",
  // Prestation
  typePresta   : "",
  quantite     : "1",
  date         : "",
  heure        : "",
  prix         : "",
  prestataire  : "",
  statut       : "",
  message      : "",
};

export default function NewClientModal({ prestataires, onClose, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toInputDate = (d: string) => {
    if (!d) return "";
    const p = d.split("/");
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
  };
  const fromInputDate = (d: string) => {
    if (!d) return "";
    const p = d.split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  const handleSave = async () => {
    if (!form.nom.trim())   { setError("Le nom est requis."); return; }
    if (!form.prenom.trim()){ setError("Le prénom est requis."); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <UserPlus size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Nouveau client</h2>
              <p className="text-xs text-gray-400 mt-0.5">Crée le client et sa première prestation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Identité */}
          <Section icon={User} title="Identité">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" required>
                <input type="text" value={form.prenom} onChange={(e) => set("prenom", e.target.value)}
                  className={inputCls} placeholder="Marie" />
              </Field>
              <Field label="Nom" required>
                <input type="text" value={form.nom} onChange={(e) => set("nom", e.target.value)}
                  className={inputCls} placeholder="Dupont" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Téléphone">
                <input type="tel" value={form.tel} onChange={(e) => set("tel", e.target.value)}
                  className={inputCls} placeholder="06 00 00 00 00" />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  className={inputCls} placeholder="marie@exemple.com" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source">
                <select value={form.source} onChange={(e) => set("source", e.target.value)} className={inputCls}>
                  <option value="">— Sélectionner —</option>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Statut client">
                <select value={form.statutClient} onChange={(e) => set("statutClient", e.target.value)} className={inputCls}>
                  {STATUTS_CLIENT.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* Adresse */}
          <Section icon={MapPin} title="Localisation">
            <Field label="Adresse d'intervention">
              <input type="text" value={form.adresse} onChange={(e) => set("adresse", e.target.value)}
                className={inputCls} placeholder="12 rue de la Paix, 75001 Paris" />
            </Field>
          </Section>

          {/* Prestation */}
          <Section icon={Briefcase} title="Première prestation">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type de prestation">
                <select value={form.typePresta} onChange={(e) => set("typePresta", e.target.value)} className={inputCls}>
                  <option value="">— Sélectionner —</option>
                  {TYPES_PRESTA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Quantité / Durée">
                <input type="text" value={form.quantite} onChange={(e) => set("quantite", e.target.value)}
                  className={inputCls} placeholder="ex: 3h / 1 passage" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Date">
                <input type="date" value={toInputDate(form.date)}
                  onChange={(e) => set("date", fromInputDate(e.target.value))} className={inputCls} />
              </Field>
              <Field label="Heure">
                <input type="time" value={form.heure}
                  onChange={(e) => set("heure", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Prix (€)">
                <input type="number" step="0.01" value={form.prix}
                  onChange={(e) => set("prix", e.target.value)} className={inputCls} placeholder="0.00" />
              </Field>
            </div>
            <Field label="Message / Notes client">
              <textarea value={form.message} onChange={(e) => set("message", e.target.value)}
                rows={3} className={`${inputCls} resize-none`}
                placeholder="Informations complémentaires sur la prestation..." />
            </Field>
          </Section>

          {/* Logistique */}
          <Section icon={Settings2} title="Logistique">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prestataire affecté">
                <select value={form.prestataire} onChange={(e) => set("prestataire", e.target.value)} className={inputCls}>
                  <option value="">— Non affecté —</option>
                  {prestataires.map((p) => (
                    <option key={p.nom} value={p.nom}>{p.nom}</option>
                  ))}
                </select>
              </Field>
              <Field label="Statut de la prestation">
                <select value={form.statut} onChange={(e) => set("statut", e.target.value)} className={inputCls}>
                  {STATUTS_PRESTA.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">Les champs marqués <span className="text-red-400">*</span> sont obligatoires</p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-white transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? "Enregistrement..." : "Créer le client"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
