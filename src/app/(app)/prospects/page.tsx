"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Plus, X, Search, Phone, Mail, MapPin, Calendar, MessageSquare,
  ChevronRight, UserCheck, Loader2, Trash2, Star, ArrowRight, Bell,
  Users, TrendingUp, Clock, CheckCircle2, Pencil, Check, FileText,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { useToast } from "@/components/Toast";
import { SkeletonList } from "@/components/Skeleton";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import NewClientModal from "@/components/NewClientModal";
import PrestationFields from "@/components/PrestationFields";
import { getSchema } from "@/lib/prestationSchema";
import { Prestataire } from "@/lib/constants";

// Formatage FR compact pour le pense-bête d'import.
function fmtImportDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function fmtImportDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Commentaire {
  id: string;
  date: string;
  texte: string;
}
interface Prospect {
  id: string;
  createdAt: string;
  updatedAt: string;
  genre: string;
  prenom: string;
  nom: string;
  tel: string;
  email: string;
  source: string;
  typePresta: string;
  adresse: string;
  budget: string;
  statut: string;
  dateRelance: string;
  relanceSteps: string[]; // étapes cochées : "j1", "j3", "j7"
  notes: string;
  commentaires: Commentaire[];
  besoins?: Besoin[]; // prestations souhaitées (type + détails + prix), pré-remplit la conversion
  suivi?: Suivi;      // suivi commercial : devis envoyé + relances
}

// Suivi commercial d'un prospect (stocké dans settings/prospects_suivi).
interface Suivi { devisEnvoye?: boolean; devisDate?: string; relanceNiveau?: number; relanceDate?: string; avanceImmediate?: boolean; infosEnvoye?: boolean; infosDate?: string; infoRelanceNiveau?: number }

// Une prestation souhaitée notée sur le prospect (même forme que les articles client).
// `details` = valeurs structurées des champs intelligents (tissu, places…), pour
// les reporter tels quels à la conversion en client.
interface Besoin { typePresta: string; quantite: string; prix: string; details?: Record<string, string> }

// ─── Constantes ───────────────────────────────────────────────────────────────
const STATUTS = ["NOUVEAU", "CONTACTÉ", "RELANCÉ", "CONVERTI", "PERDU"] as const;

const STATUT_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  NOUVEAU  : { label: "Nouveau",   color: "text-blue-700",  bg: "bg-blue-100",   icon: "🆕" },
  CONTACTÉ : { label: "Contacté",  color: "text-amber-700", bg: "bg-amber-100",  icon: "📞" },
  RELANCÉ  : { label: "Relancé",   color: "text-orange-700",bg: "bg-orange-100", icon: "🔄" },
  CONVERTI : { label: "Converti",  color: "text-green-700", bg: "bg-green-100",  icon: "✅" },
  PERDU    : { label: "Perdu",     color: "text-gray-500",  bg: "bg-gray-100",   icon: "❌" },
};

const SOURCES = ["Google", "Réseaux sociaux", "Bouche à oreille", "Recommandation", "Formulaire web", "Autre"];
const TYPES_PRESTA = [
  "Ménage", "Repassage", "Vitres", "Débarras", "Après travaux", "Bureaux",
  "Lavage Canapé", "Lavage fauteuil", "Lavage chaises", "Lavage de matelas",
  "Lavage tapis", "Sièges auto", "Lavage véhicule", "Autre",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}
function isOverdue(dateRelance: string): boolean {
  if (!dateRelance) return false;
  return new Date(dateRelance) < new Date(new Date().toDateString());
}
function isDueToday(dateRelance: string): boolean {
  if (!dateRelance) return false;
  const d = new Date(dateRelance);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function relanceLabel(dateRelance: string) {
  if (!dateRelance) return null;
  if (isOverdue(dateRelance)) return { text: "En retard", cls: "text-red-600 font-semibold" };
  if (isDueToday(dateRelance)) return { text: "Aujourd'hui", cls: "text-orange-600 font-semibold" };
  return { text: formatDate(dateRelance), cls: "text-gray-500" };
}

// ─── Composant : Badge statut ─────────────────────────────────────────────────
function StatutBadge({ statut, small }: { statut: string; small?: boolean }) {
  const m = STATUT_META[statut] ?? { label: statut, color: "text-gray-600", bg: "bg-gray-100", icon: "" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${m.bg} ${m.color} ${small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`}>
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}

// ─── Composant : Formulaire ajout prospect ────────────────────────────────────
function AddProspectModal({ onClose, onSaved }: { onClose: () => void; onSaved: (p: Prospect) => void }) {
  const [form, setForm] = useState({
    genre: "", prenom: "", nom: "", tel: "", email: "",
    source: "Réseaux sociaux", typePresta: "", adresse: "", budget: "", notes: "",
  });
  // Prestation souhaitée détaillée (comme à la création d'un client) : détails
  // structurés (tissu, places…) + montant, mémorisés dans besoins[0] à la création.
  const [prestaDetails, setPrestaDetails] = useState<Record<string, string>>({});
  const [prestaResume,  setPrestaResume]  = useState(""); // résumé lisible des détails (= quantite)
  const [montant,       setMontant]       = useState("");
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
      setExtracted(true);
    }, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.prenom) { setError("Le prénom est requis."); return; }
    setSaving(true); setError("");
    try {
      // Si une prestation est renseignée, on la mémorise comme 1er besoin
      // (type + détails + montant) afin de pouvoir générer un devis sans ressaisir.
      const besoins = form.typePresta
        ? [{ typePresta: form.typePresta, quantite: prestaResume || "1", prix: montant || "", details: prestaDetails }]
        : [];
      const res = await fetch("/api/prospects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, budget: montant || form.budget, besoins }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      onSaved(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Nouveau prospect</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={18} className="text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 max-h-[80vh] overflow-y-auto">

          {/* Zone collage DM — toujours visible */}
          <div className={`rounded-xl border-2 border-dashed p-3 transition-colors ${extracted ? "border-green-300 bg-green-50" : "border-purple-200 bg-purple-50"}`}>
            <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5 ${extracted ? 'text-green-700' : 'text-purple-700'}">
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
              <input value={form.tel} onChange={e => set("tel", e.target.value)} className={inputCls} placeholder="06 00 00 00 00" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} placeholder="email@exemple.fr" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Adresse</label>
            <AddressAutocomplete value={form.adresse} onChange={v => set("adresse", v)} onSelect={a => set("adresse", a)} className={inputCls} placeholder="Adresse (optionnel)" />
          </div>

          {/* Prestation souhaitée — comme à la création d'un client */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-600">Prestation souhaitée</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Type</label>
                <select value={form.typePresta} onChange={e => { set("typePresta", e.target.value); setPrestaDetails({}); setPrestaResume(""); }} className={inputCls}>
                  <option value="">— Type —</option>
                  {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Montant (€)</label>
                <input type="number" inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} className={inputCls} placeholder="ex : 190" />
              </div>
            </div>
            {form.typePresta && getSchema(form.typePresta).length > 0 && (
              <PrestationFields
                typePresta={form.typePresta}
                initialValues={prestaDetails}
                onDetailChange={(resume, values) => { setPrestaResume(resume); setPrestaDetails(values); }}
              />
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

// ─── Composant : Modal détail / édition ───────────────────────────────────────
function ProspectModal({
  prospect, prestataires, onClose, onUpdated, onDeleted, onConverted,
}: {
  prospect: Prospect;
  prestataires: Prestataire[];
  onClose: () => void;
  onUpdated: (p: Partial<Prospect> & { id: string }) => void;
  onDeleted: (id: string) => void;
  onConverted: (id: string) => void;
}) {
  const [p, setP] = useState<Prospect>({ ...prospect, genre: prospect.genre ?? "", relanceSteps: prospect.relanceSteps ?? [] });
  const [commentText, setCommentText] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameForm, setNameForm] = useState({ prenom: prospect.prenom, nom: prospect.nom });
  const [editingCoord, setEditingCoord] = useState(false);
  const [coordForm, setCoordForm] = useState({ tel: prospect.tel, email: prospect.email, adresse: prospect.adresse, budget: prospect.budget });
  const [draft, setDraft] = useState<Besoin>({ typePresta: "", quantite: "1", prix: "" }); // saisie d'une prestation souhaitée
  const [draftStatut, setDraftStatut] = useState<string>(prospect.statut); // statut choisi, en attente de validation
  const [actionBusy, setActionBusy] = useState<"" | "devis" | "relance" | "avance" | "infos" | "relance_infos">("");
  const toast = useToast();
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of comments when added
  useEffect(() => { commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [p.commentaires]);

  async function patch(updates: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/prospects/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const msg = String(d.error || "");
        toast.error("besoins" in updates && /besoins/i.test(msg)
          ? "Colonne « besoins » manquante — lance le SQL (une seule fois)."
          : (d.error || "Échec de l'enregistrement"));
        return;
      }
      const next = { ...p, ...updates } as Prospect;
      setP(next);
      onUpdated({ id: p.id, ...updates } as Partial<Prospect> & { id: string });
    } finally { setSaving(false); }
  }

  // Sélection d'un statut. Choisir « Relancé » pose une date de relance par
  // défaut au lendemain (si aucune n'est encore fixée) — modifiable juste en dessous.
  function chooseStatut(s: string) {
    setDraftStatut(s);
    if (s === "RELANCÉ" && !p.dateRelance) {
      const t = new Date(); t.setDate(t.getDate() + 1);
      patch({ dateRelance: t.toISOString().split("T")[0] });
    }
  }

  // Prestations souhaitées (besoins) — mêmes champs que la fiche client.
  function addBesoin() {
    if (!draft.typePresta) return;
    const updates: Record<string, unknown> = {
      besoins: [...(p.besoins || []), { typePresta: draft.typePresta, quantite: draft.quantite || "1", prix: draft.prix || "", details: draft.details }],
    };
    // Dès qu'on note un besoin, le prospect n'est plus « Nouveau ».
    if (p.statut === "NOUVEAU") { updates.statut = "CONTACTÉ"; setDraftStatut("CONTACTÉ"); }
    patch(updates);
    setDraft({ typePresta: "", quantite: "1", prix: "" });
  }
  function removeBesoin(i: number) {
    patch({ besoins: (p.besoins || []).filter((_, j) => j !== i) });
  }

  // ── Suivi commercial : envoi du devis + relances (mails manuels) ──
  // Avance immédiate activée par défaut (suivi.avanceImmediate !== false).
  const avanceActive = p.suivi?.avanceImmediate !== false;

  async function setAvance(value: boolean) {
    setActionBusy("avance");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_avance", value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi }));
      onUpdated({ id: p.id, suivi: d.suivi });
      toast.success(value ? "Avance immédiate activée" : "Avance immédiate retirée");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionBusy(""); }
  }

  async function envoyerDevis() {
    const dest = p.email || "(aucun email)";
    if (!confirm(`Envoyer le DEVIS par email à ${p.prenom} ${p.nom} (${dest}) ?\n\nLe devis sera joint au message${avanceActive ? ", avec l'explication de l'avance immédiate (−50 %)" : ""}.`)) return;
    setActionBusy("devis");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "devis_envoye" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      const statut = p.statut === "NOUVEAU" ? "CONTACTÉ" : p.statut;
      setP(prev => ({ ...prev, suivi: d.suivi, statut }));
      setDraftStatut(statut);
      onUpdated({ id: p.id, suivi: d.suivi, statut });
      toast.success(d.pdf ? "Devis (PDF) envoyé par email 📧" : "Devis envoyé 📧 (joint en HTML — PDF indisponible)");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionBusy(""); }
  }

  async function retirerDevis() {
    setActionBusy("devis");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "devis_envoye", unmark: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi }));
      onUpdated({ id: p.id, suivi: d.suivi });
      toast.success("Marque « devis envoyé » retirée");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionBusy(""); }
  }
  async function envoyerRelance() {
    const niveau = Math.min((p.suivi?.relanceNiveau || 0) + 1, 3);
    if (!confirm(`Envoyer la RELANCE ${niveau} par email à ${p.prenom} ${p.nom} ?\n\n(À ne faire que si le prospect n'a pas répondu.)`)) return;
    setActionBusy("relance");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "relance" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi, statut: "RELANCÉ" }));
      setDraftStatut("RELANCÉ");
      onUpdated({ id: p.id, suivi: d.suivi, statut: "RELANCÉ" });
      toast.success(`Relance ${d.niveau} envoyée par email 📧`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur d'envoi"); }
    finally { setActionBusy(""); }
  }

  // ── Parcours « demande d'informations » (prospect injoignable) ──
  async function envoyerDemandeInfos() {
    const dest = p.email || "(aucun email)";
    if (!confirm(`Envoyer une DEMANDE D'INFORMATIONS par email à ${p.prenom} ${p.nom} (${dest}) ?`)) return;
    setActionBusy("infos");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demande_infos" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      const statut = p.statut === "NOUVEAU" ? "CONTACTÉ" : p.statut;
      setP(prev => ({ ...prev, suivi: d.suivi, statut }));
      setDraftStatut(statut);
      onUpdated({ id: p.id, suivi: d.suivi, statut });
      toast.success("Demande d'informations envoyée 📧");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur d'envoi"); }
    finally { setActionBusy(""); }
  }

  async function envoyerRelanceInfos() {
    const niveau = Math.min((p.suivi?.infoRelanceNiveau || 0) + 1, 3);
    if (!confirm(`Envoyer la RELANCE ${niveau} (demande d'infos) par email à ${p.prenom} ${p.nom} ?\n\n(À ne faire que si le prospect n'a pas répondu.)`)) return;
    setActionBusy("relance_infos");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "relance_infos" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi, statut: "RELANCÉ" }));
      setDraftStatut("RELANCÉ");
      onUpdated({ id: p.id, suivi: d.suivi, statut: "RELANCÉ" });
      toast.success(`Relance ${d.niveau} (infos) envoyée par email 📧`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur d'envoi"); }
    finally { setActionBusy(""); }
  }

  async function addComment() {
    if (!commentText.trim()) return;
    setAddingComment(true);
    try {
      const res = await fetch(`/api/prospects/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addComment: commentText.trim() }),
      });
      const d = await res.json();
      // Ajouter une note = action faite → « à recontacter » aujourd'hui + sortie de « Nouveau ».
      const next = {
        ...p,
        commentaires: [...p.commentaires, d.comment],
        dateRelance : d.dateRelance ?? p.dateRelance,
        statut      : d.statut ?? p.statut,
      };
      setP(next);
      setDraftStatut(next.statut);
      onUpdated({ id: p.id, commentaires: next.commentaires, dateRelance: next.dateRelance, statut: next.statut });
      setCommentText("");
    } finally { setAddingComment(false); }
  }

  async function handleDelete() {
    await fetch(`/api/prospects/${p.id}`, { method: "DELETE" });
    onDeleted(p.id);
    onClose();
  }

  // Après création du client via NewClientModal : on marque le prospect converti.
  async function handleConvertedSaved() {
    try {
      await fetch(`/api/prospects/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: "CONVERTI" }),
      });
    } catch { /* le client est créé ; le statut prospect suivra au prochain refresh */ }
    setP(prev => ({ ...prev, statut: "CONVERTI" }));
    onConverted(p.id);
    setShowConvert(false);
    onClose();
  }

  async function saveName() {
    if (!nameForm.prenom.trim()) return;
    await patch({ prenom: nameForm.prenom.trim(), nom: nameForm.nom.trim() });
    setEditingName(false);
  }

  async function saveCoord() {
    await patch({
      tel: coordForm.tel.trim(), email: coordForm.email.trim(),
      adresse: coordForm.adresse.trim(), budget: coordForm.budget.trim(),
    });
    setEditingCoord(false);
  }

  async function deleteComment(commentId: string) {
    const updated = p.commentaires.filter(c => c.id !== commentId);
    await fetch(`/api/prospects/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentaires: updated }),
    });
    const next = { ...p, commentaires: updated };
    setP(next);
    onUpdated({ id: p.id, commentaires: updated });
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const isActive = p.statut !== "CONVERTI" && p.statut !== "PERDU";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0">
              {p.prenom[0]?.toUpperCase()}{p.nom[0]?.toUpperCase()}
            </div>
            <div>
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={nameForm.prenom}
                    onChange={e => setNameForm(f => ({ ...f, prenom: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="border border-gray-300 rounded px-2 py-0.5 text-sm font-bold w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Prénom"
                  />
                  <input
                    value={nameForm.nom}
                    onChange={e => setNameForm(f => ({ ...f, nom: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="border border-gray-300 rounded px-2 py-0.5 text-sm font-bold w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Nom"
                  />
                  <button onClick={saveName} className="text-green-500 hover:text-green-700 p-0.5" title="Sauvegarder"><Check size={14} /></button>
                  <button onClick={() => setEditingName(false)} className="text-gray-300 hover:text-gray-500 p-0.5" title="Annuler"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group">
                  <h2 className="font-bold text-gray-900">{p.prenom} {p.nom}</h2>
                  <button
                    onClick={() => { setNameForm({ prenom: p.prenom, nom: p.nom }); setEditingName(true); }}
                    className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    title="Modifier le nom"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400">{formatDate(p.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin text-gray-400" />}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full"><X size={18} className="text-gray-400" /></button>
          </div>
        </div>

        {/* ── Body scrollable ── */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Genre */}
          <div className="flex gap-2">
            {["Monsieur", "Madame"].map(g => (
              <button key={g} type="button"
                onClick={() => patch({ genre: p.genre === g ? "" : g })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  p.genre === g
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                }`}>
                {g}
              </button>
            ))}
          </div>

          {/* Statut — on choisit (le bouton se met en avant), puis on valide en bas.
              « Converti » n'est pas un statut manuel : la conversion se fait via le
              bouton « Convertir en client » plus bas. */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Statut</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATUTS.filter(s => s !== "CONVERTI").map(s => {
                const sel = draftStatut === s;
                return (
                  <button key={s} type="button" onClick={() => chooseStatut(s)}
                    className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                      sel
                        ? `${STATUT_META[s].bg} ${STATUT_META[s].color} border-current shadow-sm scale-[1.03]`
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                    }`}>
                    <span className="text-lg leading-none">{STATUT_META[s].icon}</span>
                    <span>{STATUT_META[s].label}</span>
                  </button>
                );
              })}
            </div>
            {draftStatut !== p.statut && (
              <p className="text-[11px] text-amber-600 mt-1.5">Statut modifié — clique sur <strong>Valider</strong> en bas pour enregistrer.</p>
            )}

            {/* Date de relance : par défaut au lendemain quand on clique « Relancé »,
                ou date précise choisie à la main (ex. « rappelez-moi le 15 »). */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <label className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Calendar size={13} /> Date de relance</label>
              <input type="date" value={p.dateRelance ? p.dateRelance.slice(0, 10) : ""}
                onChange={e => patch({ dateRelance: e.target.value })}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {p.dateRelance && (
                <button type="button" onClick={() => patch({ dateRelance: "" })}
                  className="text-[11px] text-gray-400 hover:text-gray-600 underline">retirer</button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Le prospect remonte dans « À rappeler » à cette date. Enregistré immédiatement.</p>
          </div>

          {/* Infos contact */}
          <div className="relative rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">Coordonnées</p>
              {!editingCoord ? (
                <button
                  onClick={() => { setCoordForm({ tel: p.tel, email: p.email, adresse: p.adresse, budget: p.budget }); setEditingCoord(true); }}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
                  <Pencil size={12} /> Modifier
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingCoord(false)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
                  <button onClick={saveCoord} disabled={saving}
                    className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-2.5 py-1 flex items-center gap-1 disabled:opacity-50 font-medium">
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />} Enregistrer
                  </button>
                </div>
              )}
            </div>

            {editingCoord ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Téléphone</label>
                    <input value={coordForm.tel} onChange={e => setCoordForm(f => ({ ...f, tel: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="06 00 00 00 00" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Email</label>
                    <input type="email" value={coordForm.email} onChange={e => setCoordForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="email@exemple.fr" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Adresse</label>
                  <AddressAutocomplete value={coordForm.adresse} onChange={v => setCoordForm(f => ({ ...f, adresse: v }))} onSelect={a => setCoordForm(f => ({ ...f, adresse: a }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Adresse" />
                </div>
                <div className="w-1/2">
                  <label className="text-xs text-gray-400 mb-1 block">Budget estimé (€)</label>
                  <input type="number" inputMode="decimal" value={coordForm.budget} onChange={e => setCoordForm(f => ({ ...f, budget: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="ex : 190" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: Phone,    label: "Téléphone", val: p.tel,    href: p.tel ? `tel:${p.tel}` : undefined },
                  { icon: Mail,     label: "Email",     val: p.email,  href: p.email ? `mailto:${p.email}` : undefined },
                  { icon: MapPin,   label: "Adresse",   val: p.adresse },
                ].map(({ icon: Icon, label, val, href }) => val ? (
                  <div key={label} className="flex items-start gap-2 text-sm">
                    <Icon size={14} className="text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-400">{label}</p>
                      {href
                        ? <a href={href} className="text-blue-600 hover:underline font-medium">{val}</a>
                        : <p className="text-gray-800 font-medium">{val}</p>}
                    </div>
                  </div>
                ) : null)}
                {p.budget && (
                  <div className="flex items-start gap-2 text-sm">
                    <TrendingUp size={14} className="text-gray-400 mt-0.5 shrink-0" />
                    <div><p className="text-xs text-gray-400">Budget estimé</p><p className="text-gray-800 font-medium">{p.budget} €</p></div>
                  </div>
                )}
                {!p.tel && !p.email && !p.adresse && !p.budget && (
                  <p className="text-xs text-gray-400 italic">Aucune coordonnée — clique sur <strong>Modifier</strong> pour en ajouter.</p>
                )}
              </div>
            )}
            {p.source && (
              <div className="flex items-start gap-2 text-sm">
                <Users size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div><p className="text-xs text-gray-400">Source</p><p className="text-gray-800 font-medium">{p.source}</p></div>
              </div>
            )}
          </div>

          {/* Prestations souhaitées — même formulaire que la fiche client (pré-remplit la conversion) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3.5 space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
              <Star size={14} className="text-blue-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Prestations souhaitées</span>
            </div>

            {/* Liste des prestations déjà notées */}
            {(p.besoins && p.besoins.length > 0) ? (
              <div className="space-y-1.5">
                {p.besoins.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{b.typePresta || "—"}</p>
                      {b.quantite && b.quantite !== "1" && <p className="text-xs text-gray-500 truncate">{b.quantite}</p>}
                    </div>
                    {b.prix && <span className="text-sm font-semibold text-green-700 shrink-0">{b.prix} €</span>}
                    <button onClick={() => removeBesoin(i)} title="Retirer" className="text-gray-300 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Aucune prestation notée. Ajoute ce que le prospect souhaite (canapé, matelas, chaises…), avec les détails et le prix.</p>
            )}

            {/* Ajout d'une prestation souhaitée */}
            <div className="space-y-2 border-t border-gray-100 pt-2.5">
              <select value={draft.typePresta}
                onChange={e => setDraft({ typePresta: e.target.value, quantite: "1", prix: draft.prix })}
                className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300">
                <option value="">— Type de prestation —</option>
                {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {draft.typePresta && getSchema(draft.typePresta).length > 0 && (
                <PrestationFields typePresta={draft.typePresta} initialValues={draft.details} onDetailChange={(d, v) => setDraft(x => ({ ...x, quantite: d, details: v }))} />
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Prix (optionnel)</label>
                <div className="relative">
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={draft.prix} placeholder="ex. 210"
                    onChange={e => setDraft(x => ({ ...x, prix: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                </div>
              </div>
              <button onClick={addBesoin} disabled={!draft.typePresta || saving}
                className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                + Ajouter la prestation
              </button>
            </div>
            <p className="text-[11px] text-gray-400">💡 Tout ce que tu notes ici sera pré-rempli automatiquement à la conversion en client.</p>
          </div>

          {/* Note interne — juste sous les prestations souhaitées */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Note interne</p>
            <textarea
              rows={2}
              value={p.notes}
              onChange={e => setP(prev => ({ ...prev, notes: e.target.value }))}
              onBlur={e => patch({ notes: e.target.value })}
              placeholder="Tache de sang, accès, remarques… (infos clés du prospect)"
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Suivi commercial : devis envoyé + relances email (100% manuel) */}
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Bell size={12} className="text-blue-500" /> Suivi commercial
            </p>

            {/* Avance immédiate (−50 %) — activée par défaut, décocher si le client n'en veut pas */}
            <button type="button" onClick={() => setAvance(!avanceActive)} disabled={actionBusy !== ""}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm transition-all disabled:opacity-60 ${
                avanceActive ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-200"
              }`}>
              <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${avanceActive ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${avanceActive ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
              <span className="flex-1 text-left">
                <span className={`font-semibold ${avanceActive ? "text-emerald-800" : "text-gray-600"}`}>Avance immédiate (−50 %)</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  {avanceActive ? "Le client ne paie que la moitié — mis en avant dans le devis + le mail." : "Devis au tarif plein (crédit d'impôt classique)."}
                </span>
              </span>
              {actionBusy === "avance" && <Loader2 size={14} className="animate-spin text-emerald-600" />}
            </button>

            {(() => {
              const hasPrice = !!(p.besoins && p.besoins.some(b => parseFloat(String(b.prix || "").replace(",", ".")) > 0)) || parseFloat(String(p.budget || "").replace(",", ".")) > 0;
              const canSend = hasPrice && !!p.email;
              const title = !hasPrice ? "Ajoute une prestation souhaitée AVEC son prix" : !p.email ? "Ce prospect n'a pas d'email — ajoute-le dans Coordonnées" : "Envoie le devis en pièce jointe par email";
              return (
                <>
                  {/* Envoi du devis par email (devis joint) */}
                  <button type="button" onClick={envoyerDevis} disabled={actionBusy !== "" || !canSend} title={title}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-blue-300 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-300 disabled:border-gray-200 transition-colors">
                    {actionBusy === "devis" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                    <span className="flex-1 text-left">{p.suivi?.devisEnvoye ? "Renvoyer le devis par email" : "Envoyer le devis par email"}</span>
                  </button>
                  {!canSend && (
                    <p className="text-[11px] text-amber-600 -mt-1">{!hasPrice ? "⚠️ Ajoute une prestation avec un prix." : "⚠️ Ajoute une adresse email au prospect (bloc Coordonnées)."}</p>
                  )}

                  {/* État « devis envoyé » + retrait manuel */}
                  {p.suivi?.devisEnvoye && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                      <CheckCircle2 size={15} className="shrink-0" />
                      <span className="flex-1">Devis envoyé{p.suivi?.devisDate ? ` le ${p.suivi.devisDate}` : ""}</span>
                      <button onClick={retirerDevis} disabled={actionBusy !== ""} className="text-[11px] text-gray-400 hover:text-gray-600 underline">retirer</button>
                    </div>
                  )}

                  {/* Aperçu / impression du devis */}
                  <button type="button"
                    onClick={() => window.open(`/api/prospects/${p.id}/devis?pdf=1`, "_blank")}
                    disabled={!hasPrice}
                    title={hasPrice ? "Aperçu du devis en PDF (identique à la pièce jointe)" : "Ajoute d'abord une prestation souhaitée avec son prix"}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors">
                    <FileText size={15} /> Aperçu du devis (PDF)
                  </button>
                </>
              );
            })()}

            {/* Relances — visibles une fois le devis envoyé */}
            {p.suivi?.devisEnvoye && (() => {
              const niv = p.suivi?.relanceNiveau || 0;
              const labels: Record<number, string> = { 1: "Relance 1 · rappel", 2: "Relance 2 · relance", 3: "Relance 3 · offre −10 %" };
              return (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-gray-400">Sans réponse ? Relance par email (à faire à la main) :</p>
                  {[1, 2, 3].map(n => {
                    const done = niv >= n;
                    const isNext = niv + 1 === n;
                    return (
                      <div key={n} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                        done ? "bg-green-50 border-green-200 text-green-700"
                        : isNext ? "bg-white border-blue-200 text-gray-700"
                        : "bg-gray-50 border-gray-100 text-gray-400"
                      }`}>
                        <span className="flex-1">{labels[n]}</span>
                        {done ? <span className="text-xs font-medium">Envoyée ✓</span>
                          : isNext ? (
                            <button onClick={envoyerRelance} disabled={actionBusy !== ""}
                              className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                              {actionBusy === "relance" ? "Envoi…" : "Envoyer"}
                            </button>
                          ) : <span className="text-[11px]">en attente</span>}
                      </div>
                    );
                  })}
                  {niv >= 3 && <p className="text-[11px] text-gray-400">Les 3 relances ont été envoyées.</p>}
                </div>
              );
            })()}
          </div>

          {/* Demande d'information : prospect contacté mais injoignable (100% manuel) */}
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={12} className="text-indigo-500" /> Demande d'information
            </p>
            <p className="text-[11px] text-gray-400 -mt-1">Pour un prospect qui vous a contacté mais reste injoignable : on lui demande les infos manquantes, puis 3 relances, puis clôture.</p>

            <button type="button" onClick={envoyerDemandeInfos} disabled={actionBusy !== "" || !p.email}
              title={!p.email ? "Ce prospect n'a pas d'email — ajoute-le dans Coordonnées" : "Envoie l'email de demande d'informations"}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-indigo-300 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:bg-gray-300 disabled:border-gray-200 transition-colors">
              {actionBusy === "infos" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              <span className="flex-1 text-left">{p.suivi?.infosEnvoye ? "Renvoyer la demande d'infos" : "Envoyer une demande d'infos"}</span>
            </button>
            {!p.email && <p className="text-[11px] text-amber-600 -mt-1">⚠️ Ajoute une adresse email au prospect (bloc Coordonnées).</p>}

            {p.suivi?.infosEnvoye && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm">
                <CheckCircle2 size={15} className="shrink-0" />
                <span className="flex-1">Demande d'infos envoyée{p.suivi?.infosDate ? ` le ${p.suivi.infosDate}` : ""}</span>
              </div>
            )}

            {/* Relances « infos » — visibles une fois la demande envoyée */}
            {p.suivi?.infosEnvoye && (() => {
              const niv = p.suivi?.infoRelanceNiveau || 0;
              const labels: Record<number, string> = { 1: "Relance 1 · rappel", 2: "Relance 2 · relance", 3: "Relance 3 · dernière (avant clôture)" };
              return (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-gray-400">Sans réponse ? Relance par email (à faire à la main) :</p>
                  {[1, 2, 3].map(n => {
                    const done = niv >= n;
                    const isNext = niv + 1 === n;
                    return (
                      <div key={n} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                        done ? "bg-green-50 border-green-200 text-green-700"
                        : isNext ? "bg-white border-indigo-200 text-gray-700"
                        : "bg-gray-50 border-gray-100 text-gray-400"
                      }`}>
                        <span className="flex-1">{labels[n]}</span>
                        {done ? <span className="text-xs font-medium">Envoyée ✓</span>
                          : isNext ? (
                            <button onClick={envoyerRelanceInfos} disabled={actionBusy !== ""}
                              className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                              {actionBusy === "relance_infos" ? "Envoi…" : "Envoyer"}
                            </button>
                          ) : <span className="text-[11px]">en attente</span>}
                      </div>
                    );
                  })}
                  {niv >= 3 && <p className="text-[11px] text-gray-400">Les 3 relances ont été envoyées — clôture automatique en « perdu » faute de réponse.</p>}
                </div>
              );
            })()}
          </div>

          {/* Journal des échanges */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <MessageSquare size={12} />
              Journal des échanges {p.commentaires.length > 0 && `(${p.commentaires.length})`}
            </p>

            {/* Tags rapides */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                { emoji: "📞", label: "Appel passé" },
                { emoji: "💬", label: "DM envoyé" },
                { emoji: "📧", label: "Email envoyé" },
                { emoji: "🎯", label: "Très intéressé" },
                { emoji: "💤", label: "Pas disponible" },
                { emoji: "💶", label: "Devis demandé" },
                { emoji: "❌", label: "Pas de réponse" },
              ].map(({ emoji, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCommentText(t => t ? `${emoji} ${label} — ${t}` : `${emoji} ${label}`)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-xs text-gray-600 border border-gray-200 hover:border-blue-200 transition-colors"
                >
                  {emoji} {label}
                </button>
              ))}
            </div>

            {/* Input note */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                placeholder="Ajouter une note… (Entrée pour valider)"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button onClick={addComment} disabled={!commentText.trim() || addingComment}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0">
                {addingComment ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              </button>
            </div>

            {/* Timeline */}
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {p.commentaires.length === 0 && (
                <p className="text-xs text-gray-400 italic text-center py-3">Aucune note pour le moment</p>
              )}
              {[...p.commentaires].reverse().map(c => {
                const firstChar = c.texte.charAt(0);
                const emoji = (firstChar.codePointAt(0) ?? 0) > 127 ? firstChar : null;
                return (
                  <div key={c.id} className="flex gap-2.5 items-start group">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${emoji ? "bg-blue-50" : "bg-gray-100"}`}>
                      {emoji || "💬"}
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                      <p className="text-[10px] text-gray-400 mb-0.5">{formatDate(c.date)}</p>
                      <p className="text-sm text-gray-800 leading-snug">{c.texte}</p>
                    </div>
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-400 transition-all shrink-0 mt-0.5"
                      title="Supprimer cette note"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
              <div ref={commentsEndRef} />
            </div>
          </div>

          {/* ── Actions rapides ── */}
          {isActive && (p.tel || p.email) && (
            <div className="flex gap-2 flex-wrap">
              {p.tel && (
                <a
                  href={`https://wa.me/${p.tel.replace(/\s/g,"").replace(/^0/,"33")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 transition-colors"
                >
                  <Phone size={15} />
                  WhatsApp
                </a>
              )}
              {p.tel && (
                <a
                  href={`tel:${p.tel}`}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <Phone size={15} />
                  Appeler
                </a>
              )}
              {p.email && (
                <a
                  href={`mailto:${p.email}`}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <Mail size={15} />
                </a>
              )}
            </div>
          )}

          {/* ── Convertir en client (formulaire intelligent complet) ── */}
          {isActive && (
            <button
              onClick={() => setShowConvert(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              <UserCheck size={16} />
              Convertir en client
            </button>
          )}
          {p.statut === "CONVERTI" && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Converti en client !</p>
                <a href="/prestations" className="text-xs text-green-700 underline">Voir dans Prestations →</a>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors">
              <Trash2 size={13} />
              Supprimer
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 font-medium">Confirmer ?</span>
              <button onClick={handleDelete} className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600">Oui, supprimer</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">Annuler</button>
            </div>
          )}
          <button
            onClick={async () => { if (draftStatut !== p.statut) await patch({ statut: draftStatut }); onClose(); }}
            disabled={saving}
            className="px-5 py-1.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
            <CheckCircle2 size={15} /> Valider
          </button>
        </div>
      </div>

      {/* Conversion : même formulaire intelligent que « Nouveau client », prérempli */}
      {showConvert && (
        <NewClientModal
          prestataires={prestataires}
          initialValues={{
            prenom: p.prenom, nom: p.nom, tel: p.tel, email: p.email, adresse: p.adresse,
            typePresta: p.besoins?.[0]?.typePresta || p.typePresta,
            quantite  : p.besoins?.[0]?.quantite || "1",
            prix      : p.besoins?.[0]?.prix || "",
          }}
          initialDetails={p.besoins?.[0]?.details}
          initialArticles={(p.besoins || []).slice(1)}
          onClose={() => setShowConvert(false)}
          onSaved={handleConvertedSaved}
        />
      )}
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>(() => cacheGet<Prospect[]>(CACHE_KEYS.prospects) ?? []);
  const [loading, setLoading]     = useState(() => !cacheHas(CACHE_KEYS.prospects));
  const [search, setSearch]       = useState("");
  const [filterRelance, setFilterRelance] = useState<string>("ACTIFS"); // montre tous les actifs (leads sans date de relance inclus)
  const [filterStatut,  setFilterStatut]  = useState<string>("ACTIFS");
  const [showAdd, setShowAdd]     = useState(false);
  const [selected, setSelected]   = useState<Prospect | null>(null);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<{ at: string; created: number; skipped: number; lastLeadName?: string; lastLeadDate?: string } | null>(null);
  const [prestataires, setPrestataires] = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/prospects");
      if (res.ok) { const d = await res.json(); setProspects(d); cacheSet(CACHE_KEYS.prospects, d); }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Liste des prestataires (pour pouvoir en affecter un lors de la conversion en client).
  useEffect(() => {
    fetch("/api/prestataires")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) { setPrestataires(d); cacheSet(CACHE_KEYS.prestataires, d); } })
      .catch(() => {});
  }, []);

  // Pense-bête : récupère le récap du dernier import (persisté dans settings).
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s?.inbox_last_import) { try { setLastImport(JSON.parse(s.inbox_last_import)); } catch { /* ignore */ } } })
      .catch(() => {});
  }, []);

  // Relève MANUELLE des nouveaux leads reçus par email (formulaire du site) →
  // crée les prospects manquants. Uniquement au clic : aucun import automatique.
  async function importerLeads() {
    setImporting(true);
    try {
      const res = await fetch("/api/cron/inbox?days=30");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Import impossible");
      if (d.lastImport) setLastImport(d.lastImport);
      const n = d.crees ?? 0;
      if (n > 0) { toast.success(`${n} nouveau${n > 1 ? "x" : ""} lead${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""} 🎉`); await load(); }
      else toast.success("Aucun nouveau lead — tout est déjà à jour ✅");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'import");
    } finally {
      setImporting(false);
    }
  }

  // ── Dates de référence ──
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);
  const in3Iso   = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().split("T")[0]; }, []);
  const in7Iso   = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; }, []);

  // ── Compteurs pour badges ──
  const counts = useMemo(() => {
    const actifs = prospects.filter(p => !["CONVERTI","PERDU"].includes(p.statut));
    return {
      urgent : actifs.filter(p => p.dateRelance && p.dateRelance <= todayIso).length,
      j3     : actifs.filter(p => p.dateRelance && p.dateRelance <= in3Iso).length,
      j7     : actifs.filter(p => p.dateRelance && p.dateRelance <= in7Iso).length,
      actifs : actifs.length,
      total  : prospects.length,
      convertis: prospects.filter(p => p.statut === "CONVERTI").length,
    };
  }, [prospects, todayIso, in3Iso, in7Iso]);

  // ── Filtrage + tri ──
  const sorted = useMemo(() => {
    const actifs = !["ACTIFS","TOUS"].includes(filterRelance) || filterStatut === "ACTIFS";
    const list = prospects.filter(p => {
      // Filtre statut secondaire
      if (filterStatut !== "ACTIFS" && filterStatut !== "TOUS" && p.statut !== filterStatut) return false;
      if (filterStatut === "ACTIFS" && ["CONVERTI","PERDU"].includes(p.statut)) return false;

      // Filtre relance principal
      if (filterRelance === "urgent") {
        if (["CONVERTI","PERDU"].includes(p.statut)) return false;
        return p.dateRelance && p.dateRelance <= todayIso;
      }
      if (filterRelance === "j3") {
        if (["CONVERTI","PERDU"].includes(p.statut)) return false;
        return p.dateRelance && p.dateRelance <= in3Iso;
      }
      if (filterRelance === "j7") {
        if (["CONVERTI","PERDU"].includes(p.statut)) return false;
        return p.dateRelance && p.dateRelance <= in7Iso;
      }
      if (filterRelance === "ACTIFS" || actifs) {
        if (filterRelance === "ACTIFS" && ["CONVERTI","PERDU"].includes(p.statut)) return false;
      }

      // Filtre recherche
      if (search) {
        const q = search.toLowerCase();
        return `${p.prenom} ${p.nom} ${p.tel} ${p.email} ${p.typePresta}`.toLowerCase().includes(q);
      }
      return true;
    }).filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return `${p.prenom} ${p.nom} ${p.tel} ${p.email} ${p.typePresta}`.toLowerCase().includes(q);
    });

    // Tri : date relance croissante (sans date → en bas), puis date de création décroissante
    return [...list].sort((a, b) => {
      if (!a.dateRelance && !b.dateRelance) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (!a.dateRelance) return 1;
      if (!b.dateRelance) return -1;
      return a.dateRelance.localeCompare(b.dateRelance);
    });
  }, [prospects, filterRelance, filterStatut, search, todayIso, in3Iso, in7Iso]);

  // ── Mutations ──
  function handleUpdated(update: Partial<Prospect> & { id: string }) {
    setProspects(prev => prev.map(p => p.id === update.id ? { ...p, ...update } : p));
    if (selected?.id === update.id) setSelected(prev => prev ? { ...prev, ...update } : prev);
  }
  function handleDeleted(id: string) {
    setProspects(prev => prev.filter(p => p.id !== id));
  }
  // Suppression rapide depuis la liste (bouton corbeille), avec confirmation.
  async function deleteProspect(p: Prospect, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Supprimer définitivement le prospect « ${p.prenom} ${p.nom} » ?`)) return;
    try {
      const res = await fetch(`/api/prospects/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      handleDeleted(p.id);
      toast.success("Prospect supprimé");
    } catch {
      toast.error("Suppression impossible");
    }
  }
  function handleConverted(id: string) {
    setProspects(prev => prev.map(p => p.id === id ? { ...p, statut: "CONVERTI" } : p));
  }

  const RELANCE_FILTERS = [
    { key: "urgent", label: "🔴 Aujourd'hui",    count: counts.urgent,   activeClass: "bg-red-500 text-white",    inactiveClass: "bg-red-50 text-red-600 border-red-200"    },
    { key: "j3",     label: "🟠 Dans 3 jours",   count: counts.j3,       activeClass: "bg-orange-500 text-white", inactiveClass: "bg-orange-50 text-orange-600 border-orange-200" },
    { key: "j7",     label: "🟡 Cette semaine",  count: counts.j7,       activeClass: "bg-amber-500 text-white",  inactiveClass: "bg-amber-50 text-amber-600 border-amber-200"  },
    { key: "ACTIFS", label: "📋 Tous les actifs",count: counts.actifs,   activeClass: "bg-blue-600 text-white",   inactiveClass: "bg-gray-100 text-gray-600 border-gray-200"    },
    { key: "TOUS",   label: "Tous",              count: counts.total,    activeClass: "bg-gray-700 text-white",   inactiveClass: "bg-gray-100 text-gray-600 border-gray-200"    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Topbar
        title="Prospects"
        subtitle="Suivi et relance des contacts entrants"
        onRefresh={load}
        loading={loading}
        alerts={counts.urgent}
        action={
          <div className="flex items-center gap-2">
            <button onClick={importerLeads} disabled={importing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-60"
              title="Relever les nouveaux leads reçus par email (formulaire du site)">
              {importing ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              <span className="hidden sm:inline">{importing ? "Import…" : "Importer les leads"}</span>
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
              <Plus size={15} />
              <span className="hidden sm:inline">Nouveau prospect</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 p-3 sm:p-6 space-y-4">

        {/* Pense-bête du dernier import (formulaires du site → prospects) */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-xs text-blue-800 flex items-start gap-2">
          <span className="mt-0.5">🕘</span>
          <div className="leading-relaxed">
            {lastImport ? (
              <>
                <span className="font-semibold">Dernier import :</span>{" "}
                {fmtImportDateTime(lastImport.at)} · <span className="font-semibold text-blue-900">{lastImport.created} nouveau{lastImport.created > 1 ? "x" : ""}</span>, {lastImport.skipped} déjà connu{lastImport.skipped > 1 ? "s" : ""}
                {lastImport.lastLeadName && (
                  <><br />📩 Dernier formulaire capté : <span className="font-semibold">{lastImport.lastLeadName}</span>{lastImport.lastLeadDate ? ` — reçu le ${fmtImportDate(lastImport.lastLeadDate)}` : ""}</>
                )}
              </>
            ) : (
              <>Aucun import effectué pour l&apos;instant. Clique sur <span className="font-semibold">« Importer les leads »</span> pour relever les formulaires reçus.</>
            )}
            <div className="text-blue-500/80 mt-0.5">Seuls les formulaires reçus à partir du 19/09 créent des prospects · zéro doublon garanti.</div>
          </div>
        </div>


        {/* ── Stat cards compactes ── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Actifs",    val: counts.actifs,    color: "text-blue-600",   bg: "bg-blue-50",   icon: Clock       },
            { label: "À rappeler",val: counts.urgent,    color: "text-red-600",    bg: "bg-red-50",    icon: Bell        },
            { label: "Convertis", val: counts.convertis, color: "text-green-600",  bg: "bg-green-50",  icon: TrendingUp  },
            { label: "Total",     val: counts.total,     color: "text-gray-600",   bg: "bg-gray-100",  icon: Users       },
          ].map(({ label, val, color, bg, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
              <p className="text-lg font-bold text-gray-900 leading-none">{val}</p>
              <p className="text-[10px] text-gray-400 text-center leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Filtres relance (principal) ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {RELANCE_FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilterRelance(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filterRelance === f.key ? f.activeClass : f.inactiveClass + " hover:opacity-80"
                }`}>
                {f.label}
                {f.count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    filterRelance === f.key ? "bg-white/30" : "bg-white border border-current"
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filtres statut secondaires + recherche */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {[
                { key: "ACTIFS",   label: "Actifs"    },
                { key: "NOUVEAU",  label: "Nouveaux"  },
                { key: "CONTACTÉ", label: "Contactés" },
                { key: "RELANCÉ",  label: "Relancés"  },
                { key: "CONVERTI", label: "Convertis" },
                { key: "PERDU",    label: "Perdus"    },
                { key: "TOUS",     label: "Tous"      },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterStatut(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filterStatut === f.key ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Liste triée par urgence ── */}
        {loading ? (
          <SkeletonList count={6} />
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell size={24} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">
              {filterRelance === "urgent" ? "Aucun prospect à rappeler aujourd'hui 🎉" : "Aucun prospect trouvé"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {filterRelance === "urgent" ? "Tu es à jour !" : "Essaie un autre filtre."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(p => {
              const relance = relanceLabel(p.dateRelance);
              const isOverdueFlag = p.dateRelance ? isOverdue(p.dateRelance) : false;
              const isTodayFlag   = p.dateRelance ? isDueToday(p.dateRelance) : false;
              const tomorrowIso = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();
              const hasRelanceTomorrow = p.dateRelance === tomorrowIso;

              async function quickRelance() {
                const newDate = hasRelanceTomorrow ? "" : tomorrowIso;
                await fetch(`/api/prospects/${p.id}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ dateRelance: newDate }),
                });
                setProspects(prev => prev.map(pr => pr.id === p.id ? { ...pr, dateRelance: newDate } : pr));
              }

              return (
                <div
                  key={p.id}
                  className={`w-full bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer
                    ${isOverdueFlag ? "border-red-200" : isTodayFlag ? "border-orange-200" : "border-gray-100"}`}
                  onClick={() => setSelected(p)}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {p.prenom[0]?.toUpperCase()}{p.nom[0]?.toUpperCase()}
                  </div>

                  {/* Infos principales */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{p.prenom} {p.nom}</p>
                      <StatutBadge statut={p.statut} small />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {p.tel && <span className="text-xs text-gray-500 flex items-center gap-1"><Phone size={11} />{p.tel}</span>}
                      {p.typePresta && <span className="text-xs text-gray-500">{p.typePresta}</span>}
                    </div>
                  </div>

                  {/* Relance rapide + statut relance */}
                  <div className="shrink-0 flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={quickRelance}
                      title={hasRelanceTomorrow ? "Annuler la relance demain" : "Relance demain"}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        hasRelanceTomorrow
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-white text-gray-400 border-gray-200 hover:text-orange-500 hover:border-orange-300"
                      }`}
                    >
                      <Bell size={11} />
                      {hasRelanceTomorrow ? "Demain ✓" : "Rappel"}
                    </button>
                    {relance && !hasRelanceTomorrow && (
                      <span className={`text-[11px] flex items-center gap-1 ${relance.cls}`}>
                        <Calendar size={10} />{relance.text}
                      </span>
                    )}
                  </div>

                  {/* Corbeille : suppression rapide (prospect créé par erreur) */}
                  <button
                    onClick={e => deleteProspect(p, e)}
                    title="Supprimer ce prospect"
                    aria-label="Supprimer ce prospect"
                    className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>

                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showAdd && (
        <AddProspectModal
          onClose={() => setShowAdd(false)}
          onSaved={p => {
            setProspects(prev => [p, ...prev]);
            setShowAdd(false);
            setSelected(p); // Ouvre directement la fiche du nouveau prospect
          }}
        />
      )}
      {selected && (
        <ProspectModal
          prospect={selected}
          prestataires={prestataires}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onConverted={handleConverted}
        />
      )}

    </div>
  );
}
