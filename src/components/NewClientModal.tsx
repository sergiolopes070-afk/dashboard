"use client";
import { useState, useEffect, useRef } from "react";
import {
  X, Save, Loader2, UserPlus, User, Briefcase, MapPin, Settings2,
  CheckCircle, MessageCircle, Clock, UserCheck,
} from "lucide-react";
import { Prestataire } from "@/lib/constants";
import { getSchema } from "@/lib/prestationSchema";
import PrestationFields from "@/components/PrestationFields";

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
  "Lavage Canapé",
  "Lavage de matelas",
  "Lavage tapis",
  "Lavage véhicule",
  "Autre",
];


// ─── Hook auto-ville ─────────────────────────────────────────────────────────

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

// ─── Autocomplete adresse (Base Adresse Nationale) ───────────────────────────

interface BanFeature {
  properties: { label: string; name: string; postcode: string; city: string };
}

function useAddressSearch(query: string) {
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (query.length < 4) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=6`)
        .then(r => r.json())
        .then((d: { features: BanFeature[] }) => setSuggestions(d.features || []))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);
  return { suggestions, loading };
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (raw: string) => void;
  onSelect: (adresse: string, cp: string, ville: string) => void;
  className?: string;
}

function AddressAutocomplete({ value, onChange, onSelect, className }: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { suggestions, loading } = useAddressSearch(value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const inputCls =
    "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => value.length >= 4 && setOpen(true)}
        className={className ?? inputCls}
        placeholder="12 rue de la Paix, Paris…"
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-2.5">
          <Loader2 size={14} className="animate-spin text-gray-400" />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onSelect(s.properties.name, s.properties.postcode, s.properties.city);
                setOpen(false);
              }}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex items-start gap-2"
            >
              <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <span>{s.properties.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  initialValues?: Partial<typeof EMPTY>;
}

const EMPTY = {
  prenom         : "",
  nom            : "",
  tel            : "",
  email          : "",
  adresse        : "",
  codePostal     : "",
  ville          : "",
  source         : "",
  statutClient   : "NOUVEAU",
  typePresta     : "",
  quantite       : "1",
  date           : "",
  heure          : "",
  prix           : "",
  commission     : "",
  commissionType : "%" as "%" | "€",
  prestataire    : "",
  message        : "",
};

export default function NewClientModal({ prestataires, onClose, onSaved, initialValues }: Props) {
  const [form, setForm]                   = useState({ ...EMPTY, ...initialValues });
  // Articles / prestations supplémentaires (canapé + matelas + tapis en une fois…)
  const [articlesSupp, setArticlesSupp] = useState<{ typePresta: string; quantite: string; prix: string }[]>([]);
  const addArticle    = () => setArticlesSupp(a => [...a, { typePresta: "", quantite: "1", prix: "" }]);
  const removeArticle = (i: number) => setArticlesSupp(a => a.filter((_, j) => j !== i));
  const updateArticle = (i: number, k: "typePresta" | "quantite" | "prix", v: string) =>
    setArticlesSupp(a => { const c = [...a]; c[i] = { ...c[i], [k]: v }; return c; });
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [savedPrestataire, setSavedPrestataire] = useState<Prestataire | null>(null);
  const [savedPrestationId, setSavedPrestationId] = useState<string>("");
  const [showSuccess, setShowSuccess]     = useState(false);
  const [savedFormData, setSavedFormData] = useState<typeof EMPTY | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Champs adaptatifs pilotés par le schéma (src/lib/prestationSchema).
  const hasSchema = getSchema(form.typePresta).length > 0;

  // Total de la fiche (1re prestation + articles). Prix saisis = TTC, TVA 10%.
  const totalTTC = (parseFloat(form.prix) || 0)
    + articlesSupp.reduce((s, a) => s + (parseFloat(a.prix) || 0), 0);
  const totalHT  = totalTTC / 1.10;
  const totalTVA = totalTTC - totalHT;

  const { villes: villesCP, loading: cpLoading } = useVilleFromCP(form.codePostal);
  // Auto-sélectionner si une seule ville pour ce CP
  useEffect(() => {
    if (villesCP.length === 1) set("ville", villesCP[0]);
  }, [villesCP]);

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

  const assignedPrestataire = prestataires.find((p) => p.nom === form.prestataire) ?? null;

  const handleSave = async () => {
    if (!form.nom.trim())   { setError("Le nom est requis."); return; }
    if (!form.prenom.trim()){ setError("Le prénom est requis."); return; }

    setSaving(true);
    setError(null);
    try {
      const hasPrestataire = !!form.prestataire;
      const fullAdresse = [
        form.adresse,
        [form.codePostal, form.ville].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      const payload = {
        ...form,
        adresse     : fullAdresse,
        statut      : hasPrestataire ? "EMAIL ENVOYÉ" : "",
        statutPresta: hasPrestataire ? "EN ATTENTE PRESTA" : "",
        articlesSupp: articlesSupp.filter(a => a.typePresta || a.prix),
      };
      const res = await fetch("/api/clients", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur serveur");
      const data = await res.json();
      const prestationId: string = data.id || "";

      onSaved();

      const clientHasTel = !!form.tel;
      const prestataireHasTel = hasPrestataire && !!assignedPrestataire?.tel;

      if (clientHasTel || prestataireHasTel) {
        setSavedPrestationId(prestationId);
        setSavedFormData({ ...form });
        if (prestataireHasTel) setSavedPrestataire(assignedPrestataire!);
        setShowSuccess(true);
      } else {
        onClose();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  // ── Écran de succès + notifications WhatsApp ─────────────────────────────
  if (showSuccess && savedFormData) {
    const f = savedFormData;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const fullAdresseWA = [f.adresse, [f.codePostal, f.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");

    // Message WhatsApp client
    const clientTelFormatted = f.tel.replace(/\s/g, "").replace(/^0/, "33");
    const clientMsg = encodeURIComponent(
      `Bonjour ${f.prenom} 👋,\n\nVotre demande a bien été enregistrée chez KinouClean ✅\n\n` +
      `📋 Récapitulatif de votre demande :\n` +
      `🧹 Prestation : ${f.typePresta}${f.quantite ? ` (${f.quantite})` : ""}\n` +
      `📍 Adresse : ${fullAdresseWA || "—"}\n` +
      `📅 Date : ${f.date || "—"}${f.heure ? ` à ${f.heure}` : ""}\n` +
      `💶 Montant : ${f.prix || "—"} €\n\n` +
      `Nous revenons vers vous très prochainement pour confirmer votre rendez-vous 🙏\n\nL'équipe KinouClean`
    );

    // Message WhatsApp prestataire
    let prestataireBlock = null;
    if (savedPrestataire) {
      const prestaTel = savedPrestataire.tel.replace(/\s/g, "").replace(/^0/, "33");
      const acceptUrl = savedPrestationId ? `${baseUrl}/api/mission/reponse?id=${savedPrestationId}&action=accepter` : "";
      const refusUrl  = savedPrestationId ? `${baseUrl}/api/mission/reponse?id=${savedPrestationId}&action=refuser`  : "";
      const prestaMsg = encodeURIComponent(
        `Bonjour ${savedPrestataire.nom} 👋,\n\nUne nouvelle mission vous a été proposée chez KinouClean :\n\n` +
        `👤 Client : ${f.prenom} ${f.nom}\n` +
        `🧹 Prestation : ${f.typePresta}${f.quantite ? ` (x${f.quantite})` : ""}\n` +
        `📍 Adresse : ${fullAdresseWA || "—"}\n` +
        `📅 Date : ${f.date || "—"}${f.heure ? ` à ${f.heure}` : ""}\n` +
        `💶 Prix : ${f.prix || "—"} €\n\n` +
        (acceptUrl
          ? `Merci de répondre directement via ces liens :\n\n✅ ACCEPTER la mission :\n${acceptUrl}\n\n❌ REFUSER la mission :\n${refusUrl}\n\nVotre réponse mettra à jour la fiche client automatiquement 🙏`
          : `Merci de confirmer votre disponibilité en répondant à ce message 🙏`)
      );
      prestataireBlock = (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-left">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider mb-2">
            Notifier le prestataire
          </p>
          <p className="text-sm text-gray-600 mb-3">
            Envoyez la mission à <strong>{savedPrestataire.nom}</strong> pour qu&apos;il confirme sa disponibilité.
          </p>
          <a
            href={`https://wa.me/${prestaTel}?text=${prestaMsg}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
          >
            <MessageCircle size={16} />
            Envoyer la mission à {savedPrestataire.nom}
          </a>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Client créé avec succès !</h2>
          <p className="text-sm text-gray-500 mb-6">
            La prestation a été enregistrée.{savedPrestataire && (
              <> Assignée à <span className="font-semibold text-gray-800">{savedPrestataire.nom}</span> — <span className="text-orange-600 font-medium">En attente de confirmation</span>.</>
            )}
          </p>

          <div className="space-y-3 mb-6">
            {/* Bouton WhatsApp client */}
            {f.tel && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-left">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">
                  Confirmer au client
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  Envoyez un récap de la demande à <strong>{f.prenom} {f.nom}</strong> par WhatsApp.
                </p>
                <a
                  href={`https://wa.me/${clientTelFormatted}?text=${clientMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 transition-colors"
                >
                  <MessageCircle size={16} />
                  Envoyer le récap au client
                </a>
              </div>
            )}

            {/* Bouton WhatsApp prestataire */}
            {prestataireBlock}
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // ── Formulaire principal ──────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
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
            <Field label="Adresse complète">
              <AddressAutocomplete
                value={form.adresse}
                onChange={v => set("adresse", v)}
                onSelect={(adresse, cp, ville) => {
                  setForm(f => ({ ...f, adresse, codePostal: cp, ville }));
                }}
              />
              <p className="text-xs text-gray-400 mt-1">Tapez au moins 4 caractères pour rechercher une adresse française</p>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code postal">
                <input type="text" value={form.codePostal} onChange={(e) => set("codePostal", e.target.value)}
                  maxLength={5} placeholder="75001" className={inputCls} />
              </Field>
              <Field label={cpLoading ? "Ville (recherche…)" : "Ville"}>
                {villesCP.length > 1 ? (
                  <select value={form.ville} onChange={(e) => set("ville", e.target.value)} className={inputCls}>
                    <option value="">— Choisir —</option>
                    {villesCP.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input type="text" value={form.ville} onChange={(e) => set("ville", e.target.value)}
                    placeholder="Paris" className={inputCls} />
                )}
              </Field>
            </div>
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
              <Field label="Prix (€)">
                <input type="number" step="0.01" value={form.prix}
                  onChange={(e) => set("prix", e.target.value)} className={inputCls} placeholder="0.00" />
              </Field>
            </div>

            {/* Quantité / durée seulement si aucun champ intelligent pour ce type */}
            {!hasSchema && (
              <Field label="Quantité / Durée">
                <input type="text" value={form.quantite} onChange={(e) => set("quantite", e.target.value)}
                  className={inputCls} placeholder="ex: 3h / 1 passage" />
              </Field>
            )}

            {/* Champs intelligents pilotés par le schéma du type de prestation */}
            {hasSchema && (
              <PrestationFields typePresta={form.typePresta} onDetailChange={(d) => set("quantite", d)} />
            )}
            {/* Autres articles / prestations — juste après le type (fluide sur mobile) */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">Autres articles / prestations (optionnel)</span>
                <button type="button" onClick={addArticle}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Ajouter un article</button>
              </div>
              {articlesSupp.length === 0 ? (
                <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl py-2.5 text-center">
                  Ex : Lavage canapé + Lavage matelas dans la même fiche
                </p>
              ) : (
                <div className="space-y-3">
                  {articlesSupp.map((art, i) => {
                    const artSchema = getSchema(art.typePresta).length > 0;
                    return (
                      <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
                        <div className="flex items-center gap-2">
                          <select value={art.typePresta} onChange={e => updateArticle(i, "typePresta", e.target.value)}
                            className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300">
                            <option value="">— Type de prestation —</option>
                            {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <div className="relative">
                            <input type="number" value={art.prix} min={0} step="0.01" placeholder="Prix"
                              onChange={e => updateArticle(i, "prix", e.target.value)}
                              className="w-24 bg-white border border-gray-200 rounded-lg pl-2 pr-6 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" title="Prix" />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">€</span>
                          </div>
                          <button type="button" onClick={() => removeArticle(i)}
                            className="text-red-400 hover:text-red-600 transition-colors text-xl leading-none px-1" title="Retirer">×</button>
                        </div>
                        {/* Champs intelligents de l'article (adaptés à son type) */}
                        {artSchema ? (
                          <PrestationFields typePresta={art.typePresta} onDetailChange={d => updateArticle(i, "quantite", d)} />
                        ) : (
                          <input type="text" value={art.quantite} onChange={e => updateArticle(i, "quantite", e.target.value)}
                            placeholder="Quantité / durée (optionnel)"
                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
              <Field label="Commission prestataire">
                <div className="flex gap-2">
                  <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1 flex-shrink-0">
                    {(["%", "€"] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, commissionType: t }))}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all
                          ${form.commissionType === t ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input type="number" min="0" step="0.01" value={form.commission}
                    onChange={(e) => set("commission", e.target.value)}
                    className={inputCls} placeholder={form.commissionType === "%" ? "ex: 20" : "ex: 50"} />
                </div>
              </Field>
            </div>

            {/* Total de la fiche (TVA 10%) */}
            {totalTTC > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between text-gray-600"><span>Total HT</span><span>{totalHT.toFixed(2)} €</span></div>
                <div className="flex justify-between text-gray-600"><span>TVA (10 %)</span><span>{totalTVA.toFixed(2)} €</span></div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-blue-100"><span>Total TTC</span><span>{totalTTC.toFixed(2)} €</span></div>
              </div>
            )}

            <Field label="Message / Notes client">
              <textarea value={form.message} onChange={(e) => set("message", e.target.value)}
                rows={3} className={`${inputCls} resize-none`}
                placeholder="Informations complémentaires sur la prestation..." />
            </Field>
          </Section>

          {/* Affectation prestataire */}
          <Section icon={Settings2} title="Affectation du prestataire">
            <Field label="Prestataire affecté">
              <select
                value={form.prestataire}
                onChange={(e) => set("prestataire", e.target.value)}
                className={inputCls}
              >
                <option value="">— Laisser en attente d&apos;affectation —</option>
                {prestataires.map((p) => (
                  <option key={p.nom} value={p.nom}>{p.nom}</option>
                ))}
              </select>
            </Field>

            {/* Bandeau indicatif selon le cas */}
            {form.prestataire ? (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                <UserCheck size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    Mission proposée à {form.prestataire}
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Statut : <strong>En attente de confirmation du prestataire</strong>.
                    {assignedPrestataire?.tel
                      ? " Vous pourrez l'avertir via WhatsApp après la création."
                      : " Aucun numéro WhatsApp enregistré pour ce prestataire."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <Clock size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    En attente d&apos;affectation
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    La prestation sera créée sans prestataire. Elle apparaîtra dans la liste
                    des missions à affecter.
                  </p>
                </div>
              </div>
            )}
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
