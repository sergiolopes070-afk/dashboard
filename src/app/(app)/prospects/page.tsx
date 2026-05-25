"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Plus, X, Search, Phone, Mail, MapPin, Calendar, MessageSquare,
  ChevronRight, UserCheck, Loader2, Trash2, Star, ArrowRight, Bell,
  Users, TrendingUp, Clock, CheckCircle2, Pencil, Check,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import AddressAutocomplete from "@/components/AddressAutocomplete";

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
}

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
  "Ménage", "Repassage", "Vitres", "Débarras",
  "Après travaux", "Bureaux", "Lavage Canapé", "Lavage véhicule", "Lavage de matelas", "Autre",
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
      const res = await fetch("/api/prospects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
              <label className="text-xs text-gray-500 mb-1 block">Prestation</label>
              <select value={form.typePresta} onChange={e => set("typePresta", e.target.value)} className={inputCls}>
                <option value="">— Type —</option>
                {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
              className={`${inputCls} resize-none`} placeholder="Demande, budget, disponibilités…" />
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
  prospect, onClose, onUpdated, onDeleted, onConverted,
}: {
  prospect: Prospect;
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
  const [convertForm, setConvertForm] = useState({ date: "", heure: "", prix: "", typePresta: p.typePresta, adresse: p.adresse });
  const [converting, setConverting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameForm, setNameForm] = useState({ prenom: prospect.prenom, nom: prospect.nom });
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of comments when added
  useEffect(() => { commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [p.commentaires]);

  async function patch(updates: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/prospects/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const next = { ...p, ...updates } as Prospect;
      setP(next);
      onUpdated({ id: p.id, ...updates } as Partial<Prospect> & { id: string });
    } finally { setSaving(false); }
  }

  async function addComment() {
    if (!commentText.trim()) return;
    setAddingComment(true);
    try {
      const res = await fetch(`/api/prospects/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addComment: commentText.trim() }),
      });
      const { comment } = await res.json();
      const next = { ...p, commentaires: [...p.commentaires, comment] };
      setP(next);
      onUpdated({ id: p.id, commentaires: next.commentaires });
      setCommentText("");
    } finally { setAddingComment(false); }
  }

  async function handleDelete() {
    await fetch(`/api/prospects/${p.id}`, { method: "DELETE" });
    onDeleted(p.id);
    onClose();
  }

  async function handleConvert() {
    setConverting(true);
    try {
      const res = await fetch(`/api/prospects/${p.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(convertForm),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setP(prev => ({ ...prev, statut: "CONVERTI" }));
      onConverted(p.id);
      setShowConvert(false);
    } finally { setConverting(false); }
  }

  async function saveName() {
    if (!nameForm.prenom.trim()) return;
    await patch({ prenom: nameForm.prenom.trim(), nom: nameForm.nom.trim() });
    setEditingName(false);
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
  const relance  = relanceLabel(p.dateRelance);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}>
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

          {/* Statut + relance */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {STATUTS.map(s => (
                <button key={s} onClick={() => patch({ statut: s })}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    p.statut === s
                      ? `${STATUT_META[s].bg} ${STATUT_META[s].color} border-transparent`
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}>
                  {STATUT_META[s].icon} {STATUT_META[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Infos contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: Phone,    label: "Téléphone", val: p.tel,    href: p.tel ? `tel:${p.tel}` : undefined },
              { icon: Mail,     label: "Email",     val: p.email,  href: p.email ? `mailto:${p.email}` : undefined },
              { icon: MapPin,   label: "Adresse",   val: p.adresse },
              { icon: Star,     label: "Prestation",val: p.typePresta },
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
            {p.source && (
              <div className="flex items-start gap-2 text-sm">
                <Users size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div><p className="text-xs text-gray-400">Source</p><p className="text-gray-800 font-medium">{p.source}</p></div>
              </div>
            )}
          </div>

          {/* Étapes de relance cochables */}
          {(() => {
            const STEPS = [
              { key: "j1", label: "J+1 — Demain",      days: 1 },
              { key: "j3", label: "J+3 — 3 jours",     days: 3 },
              { key: "j7", label: "J+7 — 1 semaine",   days: 7 },
            ];
            const steps = p.relanceSteps || [];

            function toggleStep(key: string) {
              const next = steps.includes(key) ? steps.filter(s => s !== key) : [...steps, key];
              // Auto-avance la relance à la prochaine étape non cochée
              const nextStep = STEPS.find(s => !next.includes(s.key));
              const updates: Record<string, unknown> = { relanceSteps: next };
              if (nextStep && !steps.includes(key)) {
                const d = new Date(); d.setDate(d.getDate() + nextStep.days);
                updates.dateRelance = d.toISOString().split("T")[0];
              }
              patch(updates as Parameters<typeof patch>[0]);
            }

            return (
              <div className="bg-white border border-gray-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                  <Bell size={12} className="text-orange-400" /> Suivi des contacts
                </p>
                <div className="space-y-2">
                  {STEPS.map(({ key, label }) => {
                    const done = steps.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleStep(key)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-all ${
                          done
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-gray-50 border-gray-200 text-gray-500 hover:border-orange-300 hover:bg-orange-50"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          done ? "bg-green-500 border-green-500" : "border-gray-300"
                        }`}>
                          {done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span className={`font-medium ${done ? "line-through opacity-60" : ""}`}>{label}</span>
                        {done && <span className="ml-auto text-xs text-green-600 font-medium">Contacté ✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Date de relance */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bell size={14} className="text-orange-500" />
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Relance</p>
              {relance && <span className={`text-xs ml-auto ${relance.cls}`}>{relance.text}</span>}
              {p.dateRelance && (
                <button onClick={() => patch({ dateRelance: "" })} className="text-gray-300 hover:text-red-400 ml-1" title="Supprimer la relance">
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Chips rapides */}
            <div className="flex gap-1.5 flex-wrap mb-2">
              {[
                { label: "Demain",    days: 1 },
                { label: "+3 jours",  days: 3 },
                { label: "+1 semaine",days: 7 },
              ].map(({ label, days }) => {
                const d = new Date(); d.setDate(d.getDate() + days);
                const iso = d.toISOString().split("T")[0];
                const active = p.dateRelance === iso;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => patch({ dateRelance: active ? "" : iso })}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      active
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-orange-600 border-orange-200 hover:border-orange-400"
                    }`}
                  >
                    {active ? "✓ " : ""}{label}
                  </button>
                );
              })}
            </div>
            {/* Date personnalisée */}
            <input
              type="date"
              value={p.dateRelance}
              onChange={e => patch({ dateRelance: e.target.value })}
              className="w-full border border-orange-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 text-gray-600"
            />
          </div>

          {/* Notes internes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes internes</p>
            <textarea
              rows={2}
              value={p.notes}
              onChange={e => setP(prev => ({ ...prev, notes: e.target.value }))}
              onBlur={e => patch({ notes: e.target.value })}
              placeholder="Informations clés, points importants…"
              className={`${inputCls} resize-none`}
            />
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

          {/* ── Convertir en client ── */}
          {isActive && (
            <div className="border border-green-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowConvert(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <UserCheck size={16} />
                  Convertir en client
                </div>
                <ChevronRight size={14} className={`transition-transform ${showConvert ? "rotate-90" : ""}`} />
              </button>
              {showConvert && (
                <div className="px-4 py-4 space-y-3 bg-white border-t border-green-100">
                  <p className="text-xs text-gray-500">Renseignez les détails du premier rendez-vous (optionnel)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-500 mb-1 block">Date RDV</label>
                      <input type="date" value={convertForm.date}
                        onChange={e => setConvertForm(f => ({ ...f, date: e.target.value }))}
                        className={inputCls} /></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Heure RDV</label>
                      <input type="time" value={convertForm.heure}
                        onChange={e => setConvertForm(f => ({ ...f, heure: e.target.value }))}
                        className={inputCls} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-500 mb-1 block">Prestation</label>
                      <select value={convertForm.typePresta}
                        onChange={e => setConvertForm(f => ({ ...f, typePresta: e.target.value }))}
                        className={inputCls}>
                        <option value="">— Sélectionner —</option>
                        {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Prix (€)</label>
                      <input type="number" value={convertForm.prix}
                        onChange={e => setConvertForm(f => ({ ...f, prix: e.target.value }))}
                        placeholder="0" className={inputCls} /></div>
                  </div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Adresse intervention</label>
                    <input value={convertForm.adresse}
                      onChange={e => setConvertForm(f => ({ ...f, adresse: e.target.value }))}
                      className={inputCls} /></div>
                  <button onClick={handleConvert} disabled={converting}
                    className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {converting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                    {converting ? "Conversion…" : "Confirmer la conversion"}
                  </button>
                </div>
              )}
            </div>
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
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filterStatut, setFilterStatut] = useState<string>("ACTIFS");
  const [showAdd, setShowAdd]     = useState(false);
  const [selected, setSelected]   = useState<Prospect | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/prospects");
      if (res.ok) setProspects(await res.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // ── Stats ──
  const stats = useMemo(() => {
    const now = new Date().toDateString();
    return {
      total    : prospects.length,
      actifs   : prospects.filter(p => !["CONVERTI","PERDU"].includes(p.statut)).length,
      convertis: prospects.filter(p => p.statut === "CONVERTI").length,
      relances : prospects.filter(p => p.dateRelance && !["CONVERTI","PERDU"].includes(p.statut) && new Date(p.dateRelance) <= new Date(now)).length,
    };
  }, [prospects]);

  // ── Filtres ──
  const filtered = useMemo(() => {
    return prospects.filter(p => {
      if (filterStatut === "ACTIFS" && ["CONVERTI","PERDU"].includes(p.statut)) return false;
      if (filterStatut !== "ACTIFS" && filterStatut !== "TOUS" && p.statut !== filterStatut) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return `${p.prenom} ${p.nom} ${p.tel} ${p.email} ${p.typePresta}`.toLowerCase().includes(q);
    });
  }, [prospects, filterStatut, search]);

  // ── Mutations ──
  function handleUpdated(update: Partial<Prospect> & { id: string }) {
    setProspects(prev => prev.map(p => p.id === update.id ? { ...p, ...update } : p));
    if (selected?.id === update.id) setSelected(prev => prev ? { ...prev, ...update } : prev);
  }
  function handleDeleted(id: string) {
    setProspects(prev => prev.filter(p => p.id !== id));
  }
  function handleConverted(id: string) {
    setProspects(prev => prev.map(p => p.id === id ? { ...p, statut: "CONVERTI" } : p));
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Topbar
        title="Prospects"
        subtitle="Suivi et relance des contacts entrants"
        onRefresh={load}
        loading={loading}
        alerts={stats.relances}
        action={
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={15} />
            Nouveau prospect
          </button>
        }
      />

      <div className="flex-1 p-3 sm:p-6 space-y-4">

        {/* ── À relancer aujourd'hui ── */}
        {(() => {
          const today = new Date().toDateString();
          const aRelancer = prospects.filter(p =>
            p.dateRelance &&
            !["CONVERTI","PERDU"].includes(p.statut) &&
            new Date(p.dateRelance) <= new Date(today)
          );
          if (!aRelancer.length) return null;
          return (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bell size={16} className="text-orange-500" />
                <h3 className="font-semibold text-orange-800 text-sm">
                  À relancer aujourd'hui · {aRelancer.length} contact{aRelancer.length > 1 ? "s" : ""}
                </h3>
              </div>
              <div className="space-y-2">
                {aRelancer.map(p => {
                  const overdue = isOverdue(p.dateRelance);
                  return (
                    <div key={p.id} className="bg-white rounded-xl border border-orange-100 px-3 py-2.5 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {p.prenom[0]?.toUpperCase()}{p.nom[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{p.prenom} {p.nom}</p>
                        <p className="text-xs text-gray-500 truncate">{p.typePresta || p.source || "—"}</p>
                      </div>
                      {overdue && <span className="text-xs text-red-500 font-semibold shrink-0">En retard</span>}
                      <div className="flex gap-1.5 shrink-0">
                        {p.tel && (
                          <a
                            href={`https://wa.me/${p.tel.replace(/\s/g,"").replace(/^0/,"33")}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                            title="WhatsApp"
                          >
                            <Phone size={13} />
                          </a>
                        )}
                        <button
                          onClick={() => setSelected(p)}
                          className="p-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors text-xs font-medium px-2"
                        >
                          Ouvrir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total prospects", val: stats.total,     icon: Users,       color: "text-blue-600",   bg: "bg-blue-50"   },
            { label: "Actifs",          val: stats.actifs,    icon: Clock,       color: "text-amber-600",  bg: "bg-amber-50"  },
            { label: "À relancer",      val: stats.relances,  icon: Bell,        color: "text-orange-600", bg: "bg-orange-50" },
            { label: "Convertis",       val: stats.convertis, icon: TrendingUp,  color: "text-green-600",  bg: "bg-green-50"  },
          ].map(({ label, val, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{val}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Barre filtres ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un prospect…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[
              { key: "ACTIFS", label: "Actifs" },
              { key: "NOUVEAU", label: "Nouveaux" },
              { key: "CONTACTÉ", label: "Contactés" },
              { key: "RELANCÉ", label: "Relancés" },
              { key: "CONVERTI", label: "Convertis" },
              { key: "PERDU", label: "Perdus" },
              { key: "TOUS", label: "Tous" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilterStatut(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatut === f.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Liste des prospects ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users size={24} className="text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">Aucun prospect trouvé</p>
            <p className="text-sm text-gray-400 mt-1">Ajoutez votre premier prospect en cliquant sur le bouton en haut à droite.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => {
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
          onSaved={p => { setProspects(prev => [p, ...prev]); setShowAdd(false); }}
        />
      )}
      {selected && (
        <ProspectModal
          prospect={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onConverted={handleConverted}
        />
      )}

    </div>
  );
}
