"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Fiche client UNIFIÉE et réutilisable (Phase 2 — étape 1).
// Panneau latéral autonome : coordonnées, fiscalité, journal de suivi, historique
// des prestations, CA, date de création. Fait ses propres appels API (notes,
// fiscalité) et prévient le parent via onChanged. Destiné à être ouvert depuis
// n'importe où (Clients, Agenda, Prestations, Recherche…) à l'étape 2.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import {
  X, Phone, Mail, MapPin, Send, Trash2, Calendar, Euro, MessageCircle, Star,
} from "lucide-react";
import { ClientNote, STATUT_COLORS } from "@/lib/constants";
import { useToast } from "@/components/Toast";

// Forme minimale d'une prestation affichée dans la fiche (compatible avec le type
// Prestation complet ET avec les données renvoyées par /api/clients/[id]).
export interface FichePrestation {
  row        : string;
  typePresta : string;
  date       : string;
  heure      : string;
  prix       : string;
  prestataire: string;
  modePaiement?: string;
  statut     : string;
  archived?  : boolean;
}

export interface ClientFicheData {
  clientId   : string;
  nom        : string;
  prenom     : string;
  tel        : string;
  email      : string;
  adresse    : string;
  prestations: FichePrestation[];
  totalCA    : number;
  derniere   : string;
  creeLe     : string;
  tags       : string[];
  notes      : ClientNote[];
}

const NOTE_TYPES = [
  { icon: "📞", label: "Appel" },
  { icon: "💬", label: "Message" },
  { icon: "📧", label: "Email" },
  { icon: "📄", label: "Devis" },
  { icon: "🤝", label: "Visite" },
  { icon: "📌", label: "Note" },
];

export default function ClientFiche({
  client, onClose, onChanged,
}: {
  client: ClientFicheData;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [notes, setNotes]   = useState<ClientNote[]>(client.notes ?? []);
  const [noteTexte, setNoteTexte] = useState("");
  const [noteType,  setNoteType]  = useState(NOTE_TYPES[0].icon);
  const [fiscal, setFiscal] = useState<"" | "avance" | "credit">("");

  useEffect(() => { setNotes(client.notes ?? []); }, [client.clientId, client.notes]);

  // Charge la préférence fiscale du client
  useEffect(() => {
    if (!client.clientId) return;
    fetch(`/api/clients/fiscal?clientId=${client.clientId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFiscal(d.fiscal || ""); })
      .catch(() => {});
  }, [client.clientId]);

  async function persistNotes(next: ClientNote[]) {
    setNotes(next); // optimiste
    try {
      await fetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.clientId, notes: next }),
      });
      onChanged?.();
    } catch {
      toast.error("Erreur d'enregistrement de la note");
    }
  }

  function addNote() {
    if (!noteTexte.trim()) return;
    const n: ClientNote = { id: crypto.randomUUID(), date: new Date().toISOString(), texte: noteTexte.trim(), type: noteType };
    persistNotes([n, ...notes]);
    setNoteTexte("");
  }

  async function setFiscalPref(val: "" | "avance" | "credit") {
    const next = fiscal === val ? "" : val;
    const prev = fiscal;
    setFiscal(next);
    try {
      const res = await fetch("/api/clients/fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.clientId, fiscal: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next === "avance" ? "Avance immédiate — noté" : next === "credit" ? "Crédit d'impôt — noté" : "Fiscalité remise à zéro");
    } catch { setFiscal(prev); toast.error("Erreur"); }
  }

  // ── Nouveau RDV / reprogrammation ──
  const [showRdv, setShowRdv] = useState(false);
  const [rdv, setRdv] = useState({ typePresta: "", date: "", heure: "", prix: "" });
  const [rdvSaving, setRdvSaving] = useState(false);
  async function addRdv() {
    if (!rdv.typePresta && !rdv.date) { toast.error("Renseigne au moins le type ou la date"); return; }
    setRdvSaving(true);
    try {
      const frDate = rdv.date ? rdv.date.split("-").reverse().join("/") : "";
      const res = await fetch(`/api/clients/${client.clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rdv, date: frDate }),
      });
      if (!res.ok) throw new Error();
      toast.success("Nouveau RDV ajouté ✅");
      setShowRdv(false);
      setRdv({ typePresta: "", date: "", heure: "", prix: "" });
      onChanged?.();
    } catch { toast.error("Erreur lors de l'ajout du RDV"); }
    finally { setRdvSaving(false); }
  }
  const RDV_TYPES = ["Ménage", "Repassage", "Vitres", "Lavage Canapé", "Lavage de matelas", "Lavage tapis", "Lavage véhicule", "Après travaux", "Bureaux", "Débarras", "Autre"];

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };
  const telWa = client.tel.replace(/\s/g, "").replace(/^0/, "33");

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between z-10">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 text-lg truncate">{client.prenom} {client.nom}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-sm font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-lg">{client.totalCA.toFixed(0)} €</span>
              <span className="text-xs text-gray-400">{client.prestations.length} prestation{client.prestations.length > 1 ? "s" : ""}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer la fiche" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Coordonnées */}
          <div className="space-y-1.5">
            {client.tel && (
              <a href={`tel:${client.tel}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900">
                <Phone size={14} className="text-gray-400" />{client.tel}
              </a>
            )}
            {client.email && (
              <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 truncate">
                <Mail size={14} className="text-gray-400 shrink-0" /><span className="truncate">{client.email}</span>
              </a>
            )}
            {client.adresse && (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <MapPin size={14} className="text-gray-400 shrink-0" /><span className="truncate">{client.adresse}</span>
              </p>
            )}
            {client.tel && (
              <a href={`https://wa.me/${telWa}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg hover:bg-green-100 transition-colors">
                <MessageCircle size={12} /> WhatsApp
              </a>
            )}
          </div>

          {/* Méta */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            {client.creeLe && <span>📅 Fiche créée le {new Date(client.creeLe).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</span>}
            {client.derniere && <span>Dernière intervention : {client.derniere}</span>}
          </div>

          {/* Tags */}
          {client.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {client.tags.map(t => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{t}</span>
              ))}
            </div>
          )}

          {/* Fiscalité */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Avantage fiscal</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { val: "" as const,       label: "Aucun",          icon: "—"  },
                { val: "avance" as const, label: "Avance imméd.",  icon: "⚡" },
                { val: "credit" as const, label: "Crédit d'impôt", icon: "🧾" },
              ].map(({ val, label, icon }) => (
                <button key={label} type="button" onClick={() => setFiscalPref(val)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors flex flex-col items-center gap-0.5 ${
                    fiscal === val ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}>
                  <span>{icon}</span><span className="truncate text-[11px]">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Journal de suivi */}
          <div className="bg-blue-50/40 rounded-xl border border-blue-100 p-3">
            <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MessageCircle size={12} /> Journal de suivi
            </p>
            <div className="flex flex-wrap gap-1 mb-2">
              {NOTE_TYPES.map(t => (
                <button key={t.icon} onClick={() => setNoteType(t.icon)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    noteType === t.icon ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}>{t.icon} {t.label}</button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input type="text" value={noteTexte} onChange={e => setNoteTexte(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
                placeholder="Action menée…"
                className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <button onClick={addNote} disabled={!noteTexte.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40">
                <Send size={14} />
              </button>
            </div>
            {notes.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Aucune action enregistrée</p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {notes.map(n => (
                  <div key={n.id} className="group flex items-start gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                    <span className="text-sm shrink-0">{n.type || "📌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 break-words">{n.texte}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(n.date)}</p>
                    </div>
                    <button onClick={() => persistNotes(notes.filter(x => x.id !== n.id))}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historique prestations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historique des prestations</p>
              <button onClick={() => setShowRdv(v => !v)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                {showRdv ? "Fermer" : "➕ Nouveau RDV"}
              </button>
            </div>

            {/* Formulaire nouveau RDV / reprogrammation */}
            {showRdv && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3 space-y-2">
                <select value={rdv.typePresta} onChange={e => setRdv(r => ({ ...r, typePresta: e.target.value }))}
                  className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300">
                  <option value="">— Type de prestation —</option>
                  {RDV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="grid grid-cols-3 gap-2">
                  <input type="date" value={rdv.date} onChange={e => setRdv(r => ({ ...r, date: e.target.value }))}
                    className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" />
                  <input type="time" value={rdv.heure} onChange={e => setRdv(r => ({ ...r, heure: e.target.value }))}
                    className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" />
                  <div className="relative">
                    <input type="number" value={rdv.prix} min={0} step="0.01" placeholder="Prix"
                      onChange={e => setRdv(r => ({ ...r, prix: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-lg pl-2 pr-5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">€</span>
                  </div>
                </div>
                <button onClick={addRdv} disabled={rdvSaving}
                  className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {rdvSaving ? "Ajout…" : "Ajouter le RDV"}
                </button>
              </div>
            )}

            {client.prestations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Aucune prestation</p>
            ) : (
              <div className="space-y-2">
                {client.prestations.map(p => {
                  const cls = STATUT_COLORS[p.statut] || "bg-gray-100 text-gray-600";
                  return (
                    <div key={p.row} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{p.typePresta || "—"}</span>
                        {p.prix && <span className="text-sm font-semibold text-green-700 shrink-0">{p.prix} €</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                        {p.date && <span className="flex items-center gap-1"><Calendar size={11} />{p.date}{p.heure ? ` à ${p.heure}` : ""}</span>}
                        {p.prestataire && <span>👤 {p.prestataire}</span>}
                        {p.modePaiement && <span className="flex items-center gap-1"><Euro size={11} />{p.modePaiement}</span>}
                        {p.statut && <span className={`px-1.5 py-0.5 rounded-full font-medium ${cls}`}>{p.statut}</span>}
                        {p.archived && <span className="px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">📦 Archivé</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lien avis */}
          {client.clientId && (
            <button
              onClick={() => {
                const params = new URLSearchParams({ nom: `${client.prenom} ${client.nom}`.trim() });
                const last = client.prestations[0];
                if (last?.typePresta) params.set("prestation", last.typePresta);
                navigator.clipboard.writeText(`${window.location.origin}/avis/${client.clientId}?${params.toString()}`)
                  .then(() => toast.success("Lien d'avis copié"));
              }}
              className="w-full py-2 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-700 text-sm font-medium hover:bg-yellow-100 transition-colors flex items-center justify-center gap-1.5">
              <Star size={14} /> Copier le lien d'avis
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Variante : charge la fiche par clientId (ouvrable depuis n'importe où) ────
export function ClientFicheById({
  clientId, onClose, onChanged,
}: {
  clientId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<ClientFicheData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let actif = true;
    setData(null); setError(false);
    fetch(`/api/clients/${clientId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (actif) setData(d); })
      .catch(() => { if (actif) setError(true); });
    return () => { actif = false; };
  }, [clientId]);

  if (data) return <ClientFiche client={data} onClose={onClose} onChanged={onChanged} />;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {error
          ? <p className="text-sm text-gray-400">Fiche introuvable.</p>
          : <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />}
      </div>
    </div>
  );
}
