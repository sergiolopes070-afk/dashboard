"use client";
import { useState, useEffect } from "react";
import { X, Save, Loader2, UserPlus, UserPen } from "lucide-react";
import { Prestation } from "@/lib/constants";

interface ClientInfo {
  nom: string;
  prenom: string;
  tel: string;
  email: string;
  adresse: string;
  prestations: Prestation[];
}

interface ClientModalProps {
  mode: "add" | "edit";
  client?: ClientInfo;
  onClose: () => void;
  onSaved: () => void;
}

const TYPES_PRESTA = [
  "",
  "Ménage",
  "Repassage",
  "Vitres",
  "Débarras",
  "Après travaux",
  "Bureaux",
  "Lavage Canapé",
  "Autre",
];

function parseAdresse(full: string) {
  const m = full.match(/^(.*?),?\s*(\d{5})\s+(.+)$/);
  if (m) return { rue: m[1].replace(/,\s*$/, "").trim(), cp: m[2], ville: m[3].trim() };
  return { rue: full, cp: "", ville: "" };
}

function useVilleFromCP(cp: string) {
  const [villes,  setVilles]  = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (cp.length !== 5) { setVilles([]); return; }
    setLoading(true);
    fetch(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom&format=json`)
      .then(r => r.json())
      .then((data: { nom: string }[]) => setVilles(data.map(d => d.nom)))
      .catch(() => setVilles([]))
      .finally(() => setLoading(false));
  }, [cp]);
  return { villes, loading };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300";

export default function ClientModal({ mode, client, onClose, onSaved }: ClientModalProps) {
  const parsed = parseAdresse(client?.adresse || "");
  const [form, setForm] = useState({
    nom        : client?.nom     || "",
    prenom     : client?.prenom  || "",
    tel        : client?.tel     || "",
    email      : client?.email   || "",
    adresse    : parsed.rue,
    codePostal : parsed.cp,
    ville      : parsed.ville,
    typePresta : "",
    quantite   : "",
    date       : "",
    heure      : "",
    prix       : "",
    message    : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const { villes: villesCP, loading: cpLoading } = useVilleFromCP(form.codePostal);
  useEffect(() => {
    if (villesCP.length === 1 && !form.ville) set("ville", villesCP[0]);
  }, [villesCP]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

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
    if (!form.nom.trim()) { setError("Le nom est requis."); return; }

    setSaving(true);
    setError(null);
    try {
      const fullAdresse = [
        form.adresse,
        [form.codePostal, form.ville].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      if (mode === "add") {
        const res = await fetch("/api/clients", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ ...form, adresse: fullAdresse }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Erreur serveur");
      } else {
        const rows = client!.prestations.map((p) => p.row);
        const updates = {
          nom    : form.nom,
          prenom : form.prenom,
          tel    : form.tel,
          email  : form.email,
          adresse: fullAdresse,
        };
        const res = await fetch("/api/clients", {
          method : "PATCH",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ rows, updates }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Erreur serveur");
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const isAdd = mode === "add";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              {isAdd
                ? <UserPlus size={18} className="text-blue-600" />
                : <UserPen  size={18} className="text-blue-600" />}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-base">
                {isAdd ? "Nouveau client" : `Modifier — ${client?.prenom} ${client?.nom}`}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isAdd
                  ? "Ajouter une nouvelle fiche client"
                  : `${client?.prestations.length} prestation${(client?.prestations.length || 0) > 1 ? "s" : ""} concernée${(client?.prestations.length || 0) > 1 ? "s" : ""}`}
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

        <div className="p-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Infos client */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Informations client
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom *">
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => set("nom", e.target.value)}
                  className={inputCls}
                  placeholder="Dupont"
                />
              </Field>
              <Field label="Prénom">
                <input
                  type="text"
                  value={form.prenom}
                  onChange={(e) => set("prenom", e.target.value)}
                  className={inputCls}
                  placeholder="Marie"
                />
              </Field>
            </div>
            <Field label="Téléphone">
              <input
                type="tel"
                value={form.tel}
                onChange={(e) => set("tel", e.target.value)}
                className={inputCls}
                placeholder="06 00 00 00 00"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={inputCls}
                placeholder="marie@exemple.com"
              />
            </Field>
            <Field label="Rue / Numéro">
              <input
                type="text"
                value={form.adresse}
                onChange={(e) => set("adresse", e.target.value)}
                className={inputCls}
                placeholder="12 rue de la Paix"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code postal">
                <input
                  type="text"
                  value={form.codePostal}
                  onChange={(e) => set("codePostal", e.target.value)}
                  maxLength={5}
                  placeholder="75001"
                  className={inputCls}
                />
              </Field>
              <Field label={cpLoading ? "Ville (recherche…)" : "Ville"}>
                {villesCP.length > 1 ? (
                  <select value={form.ville} onChange={(e) => set("ville", e.target.value)} className={inputCls}>
                    <option value="">— Choisir —</option>
                    {villesCP.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.ville}
                    onChange={(e) => set("ville", e.target.value)}
                    placeholder="Paris"
                    className={inputCls}
                  />
                )}
              </Field>
            </div>
          </fieldset>

          {/* Prestation (add only) */}
          {isAdd && (
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Prestation (optionnel)
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select
                    value={form.typePresta}
                    onChange={(e) => set("typePresta", e.target.value)}
                    className={inputCls}
                  >
                    {TYPES_PRESTA.map((t) => (
                      <option key={t} value={t}>{t || "(aucun)"}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantité">
                  <input
                    type="text"
                    value={form.quantite}
                    onChange={(e) => set("quantite", e.target.value)}
                    className={inputCls}
                    placeholder="ex: 3h"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    value={toInputDate(form.date)}
                    onChange={(e) => set("date", fromInputDate(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Heure">
                  <input
                    type="time"
                    value={form.heure}
                    onChange={(e) => set("heure", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Prix (€)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.prix}
                    onChange={(e) => set("prix", e.target.value)}
                    className={inputCls}
                    placeholder="0.00"
                  />
                </Field>
              </div>
              <Field label="Message / Notes">
                <textarea
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Informations complémentaires..."
                />
              </Field>
            </fieldset>
          )}
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
            {saving ? "Enregistrement..." : isAdd ? "Ajouter" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
