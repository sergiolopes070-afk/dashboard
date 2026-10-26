"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Formulaire UNIQUE « Nouveau prospect » (tableau de bord + page Prospects).
// - Collage d'un DM (Instagram, WhatsApp…) → téléphone, email, prestation détectés
// - Prestations souhaitées : une ligne par prestation (type + champs intelligents
//   + prix unitaire × nombre), mémorisées dans `besoins` (devis sans ressaisie)
// Appelle POST /api/prospects et renvoie le prospect créé à `onSaved`.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { X, Loader2, Trash2, Plus, MessageSquare } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import PrestationFields from "@/components/PrestationFields";
import { getSchema } from "@/lib/prestationSchema";
import { TYPES_PRESTATION } from "@/lib/constants";

export const SOURCES_PROSPECT = ["Google", "Réseaux sociaux", "Instagram", "Bouche à oreille", "Recommandation", "Formulaire web", "Autre"];

// ─── Prestations souhaitées : helpers (prix = TOTAL de la ligne, nombre = nb d'unités) ──
export const toNum = (s?: string) => parseFloat(String(s ?? "").replace(",", ".")) || 0;
export const nbOf  = (s?: string) => Math.max(1, parseInt(String(s ?? "")) || 1);
export const fmtEur = (n: number) => String(Number(n.toFixed(2)));

interface Besoin { typePresta: string; quantite: string; prix: string; details?: Record<string, string>; nombre?: string }
interface LigneSaisie { id: number; typePresta: string; details: Record<string, string>; resume: string; unit: string; nb: string }
let ligneSeq = 0;
const nouvelleLigne = (): LigneSaisie => ({ id: ++ligneSeq, typePresta: "", details: {}, resume: "", unit: "", nb: "1" });

// Stepper −/+ (cibles ≥ 40px pour le mobile).
// `fixe` : pas de saisie clavier (fiche : chaque changement est enregistré).
export function NbStepper({ value, onChange, disabled, fixe }: { value: string; onChange: (v: string) => void; disabled?: boolean; fixe?: boolean }) {
  const n = nbOf(value);
  const btn = "w-10 h-10 rounded-lg border border-gray-200 bg-white text-gray-700 text-lg leading-none hover:bg-gray-50 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Diminuer" disabled={disabled || n <= 1} onClick={() => onChange(String(n - 1))} className={btn}>–</button>
      {fixe ? <span className="w-9 text-center text-sm font-semibold text-gray-800">{n}</span> : <input type="number" inputMode="numeric" min={1} value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onChange(String(nbOf(e.target.value)))}
        className="w-12 h-10 text-center border border-gray-200 rounded-lg px-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />}
      <button type="button" aria-label="Augmenter" disabled={disabled} onClick={() => onChange(String(n + 1))} className={btn}>+</button>
    </div>
  );
}

// ─── Formulaire ajout prospect ────────────────────────────────────────────────
export default function AddProspectModal<T = unknown>({ onClose, onSaved }: { onClose: () => void; onSaved: (p: T) => void }) {
  const [form, setForm] = useState({
    genre: "", prenom: "", nom: "", tel: "", email: "",
    source: "Réseaux sociaux", typePresta: "", adresse: "", budget: "", notes: "",
  });
  // Prestations souhaitées détaillées (comme à la création d'un client) : une ligne
  // par prestation (type + détails structurés + prix unitaire × nombre), mémorisées
  // dans `besoins` à la création. La 1re ligne reprend form.typePresta (détection DM).
  const [lignes, setLignes] = useState<LigneSaisie[]>([nouvelleLigne()]);
  const majLigne = (id: number, upd: Partial<LigneSaisie>) =>
    setLignes(ls => ls.map(l => l.id === id ? { ...l, ...upd } : l));
  const setTypeLigne = (id: number, t: string, idx: number) => {
    majLigne(id, { typePresta: t, details: {}, resume: "" });
    if (idx === 0) set("typePresta", t);
  };
  const totalLigne = (l: LigneSaisie) => toNum(l.unit) * nbOf(l.nb);
  const lignesValides = lignes.filter(l => l.typePresta);
  const totalGeneral = lignesValides.reduce((s, l) => s + totalLigne(l), 0);
  const [saving,    setSaving]    = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [error,     setError]     = useState("");
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

  const PRESTA_MAP: Record<string, string> = {
    "canapé": "Lavage Canapé", "canape": "Lavage Canapé", "sofa": "Lavage Canapé",
    "matelas": "Lavage de matelas",
    "voiture": "Nettoyage de voiture", "auto": "Nettoyage de voiture", "véhicule": "Nettoyage de voiture",
    "appartement": "Nettoyage appartement", "appart": "Nettoyage appartement", "maison": "Nettoyage appartement",
  };

  function extractFromText(text: string) {
    const lower = text.toLowerCase();
    const telMatch = text.match(/(?:(?:\+|00)33[\s.-]?|0)[67][\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/);
    const tel = telMatch ? telMatch[0].replace(/[\s.-]/g, "").replace(/^0033/, "33").replace(/^33/, "0") : "";
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    const email = emailMatch ? emailMatch[0] : "";
    let typePresta = "";
    for (const [kw, type] of Object.entries(PRESTA_MAP)) {
      if (lower.includes(kw)) { typePresta = type; break; }
    }
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 4 && !/^\d{1,2}[:/]\d{2}/.test(l));
    const notes = lines.slice(0, 3).join(" — ").substring(0, 300);
    return { tel, email, typePresta, notes };
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.trim()) return;
    // Laisser le texte s'afficher, puis extraire
    setTimeout(() => {
      const d = extractFromText(text);
      setForm(f => ({
        ...f,
        tel      : d.tel       || f.tel,
        email    : d.email     || f.email,
        typePresta: d.typePresta || f.typePresta,
        notes    : d.notes     || f.notes,
      }));
      // Prestation détectée → 1re ligne (si son type n'est pas encore choisi).
      if (d.typePresta) setLignes(ls => ls.map((l, i) => i === 0 && !l.typePresta ? { ...l, typePresta: d.typePresta, details: {}, resume: "" } : l));
      setExtracted(true);
    }, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.prenom) { setError("Le prénom est requis."); return; }
    setSaving(true); setError("");
    try {
      // Chaque ligne renseignée devient un besoin (type + détails + total)
      // afin de pouvoir générer un devis sans ressaisir. prix = TOTAL de la ligne.
      const besoins: Besoin[] = lignesValides.map(l => {
        const t = totalLigne(l);
        return { typePresta: l.typePresta, quantite: l.resume || "1", prix: t > 0 ? fmtEur(t) : "", details: l.details, nombre: String(nbOf(l.nb)) };
      });
      const typePresta = lignesValides[0]?.typePresta || form.typePresta;
      const res = await fetch("/api/prospects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, typePresta, budget: totalGeneral > 0 ? fmtEur(totalGeneral) : form.budget, besoins }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      onSaved(await res.json() as T);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Nouveau prospect</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-10 h-10 -mr-2 flex items-center justify-center hover:bg-gray-100 rounded-full"><X size={18} className="text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 max-h-[80vh] overflow-y-auto">

          {/* Zone collage DM — toujours visible */}
          <div className={`rounded-xl border-2 border-dashed p-3 transition-colors ${extracted ? "border-green-300 bg-green-50" : "border-purple-200 bg-purple-50"}`}>
            <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1.5 ${extracted ? "text-green-700" : "text-purple-700"}`}>
              {extracted ? "✅ DM analysé — complète le nom ci-dessous" : <><MessageSquare size={12} /> Colle le DM ici (Instagram, WhatsApp…)</>}
            </p>
            <textarea
              rows={3}
              placeholder="Colle le message… le numéro et la prestation seront détectés automatiquement."
              onPaste={handlePaste}
              className="w-full text-sm bg-white border border-purple-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none placeholder-gray-400"
            />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Civilité (formules des emails) */}
          <div className="flex gap-2">
            {["Monsieur", "Madame"].map(g => (
              <button key={g} type="button" onClick={() => set("genre", form.genre === g ? "" : g)}
                className={`px-4 min-h-[40px] rounded-lg text-sm font-medium border transition-colors ${form.genre === g ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>{g}</button>
            ))}
          </div>

          {/* Champs essentiels */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Prénom *</label>
              <input autoFocus value={form.prenom} onChange={e => set("prenom", e.target.value)} className={inputCls} placeholder="Prénom" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nom</label>
              <input value={form.nom} onChange={e => set("nom", e.target.value)} className={inputCls} placeholder="Nom" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Téléphone</label>
              <input type="tel" value={form.tel} onChange={e => set("tel", e.target.value)} className={inputCls} placeholder="06 00 00 00 00" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} placeholder="email@exemple.fr" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Source</label>
              <select value={form.source} onChange={e => set("source", e.target.value)} className={`${inputCls} min-h-[40px]`}>
                <option value="">— Source —</option>
                {SOURCES_PROSPECT.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Adresse</label>
              <AddressAutocomplete value={form.adresse} onChange={v => set("adresse", v)} onSelect={(a, cp, v) => set("adresse", `${a}, ${cp} ${v}`.trim())} className={inputCls} placeholder="Ville ou adresse" />
            </div>
          </div>

          {/* Prestation souhaitée — comme à la création d'un client */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-600">Prestations souhaitées</p>
            {lignes.map((l, idx) => {
              const t = totalLigne(l);
              return (
                <div key={l.id} className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-2.5">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="text-xs text-gray-500 mb-1 block">{lignes.length > 1 ? `Prestation ${idx + 1}` : "Type"}</label>
                      <select value={l.typePresta} onChange={e => setTypeLigne(l.id, e.target.value, idx)} className={`${inputCls} min-h-[40px]`}>
                        <option value="">— Type —</option>
                        {TYPES_PRESTATION.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    {lignes.length > 1 && (
                      <button type="button" title="Retirer cette prestation" aria-label="Retirer cette prestation"
                        onClick={() => { setLignes(ls => ls.filter(x => x.id !== l.id)); if (idx === 0) set("typePresta", lignes[1]?.typePresta || ""); }}
                        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  {l.typePresta && getSchema(l.typePresta).length > 0 && (
                    <PrestationFields
                      key={`${l.id}-${l.typePresta}`}
                      typePresta={l.typePresta}
                      initialValues={l.details}
                      onDetailChange={(resume, values) => majLigne(l.id, { resume, details: values })}
                    />
                  )}
                  <div className="flex items-end gap-2 flex-wrap">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Prix unitaire (€)</label>
                      <input type="number" inputMode="decimal" value={l.unit} onChange={e => majLigne(l.id, { unit: e.target.value })} className={`${inputCls} w-28 min-h-[40px]`} placeholder="ex : 190" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Nombre</label>
                      <NbStepper value={l.nb} onChange={nb => majLigne(l.id, { nb })} />
                    </div>
                    {t > 0 && (
                      <div className="text-sm text-gray-600 pb-2.5">= <strong className="text-gray-900">{fmtEur(t)} €</strong>{nbOf(l.nb) > 1 && <span className="text-xs text-gray-400"> ({nbOf(l.nb)} × {fmtEur(toNum(l.unit))} €)</span>}</div>
                    )}
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => setLignes(ls => [...ls, nouvelleLigne()])}
              className="w-full min-h-[40px] rounded-lg border border-dashed border-blue-300 text-blue-700 text-sm font-semibold hover:bg-blue-50 flex items-center justify-center gap-1.5">
              <Plus size={15} /> Ajouter une prestation
            </button>
            {lignesValides.length > 1 && totalGeneral > 0 && (
              <div className="flex items-center justify-between text-sm pt-1 border-t border-gray-200">
                <span className="text-gray-600">Total ({lignesValides.length} prestations)</span>
                <strong className="text-gray-900">{fmtEur(totalGeneral)} €</strong>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
              className={`${inputCls} resize-none`} placeholder="Demande, disponibilités…" />
          </div>

          {/* Bouton */}
          <button type="submit" disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-1">
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            {saving ? "Enregistrement…" : "Ajouter le prospect"}
          </button>
        </form>
      </div>
    </div>
  );
}
