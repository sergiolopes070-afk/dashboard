"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Section « Devis » partagée par la fiche client et la fiche prospect :
//   • devis STANDARD générés par le dashboard (liens passés par le parent) ;
//   • devis EXTERNES (faits ailleurs, envoyés à la main) : date d'envoi, montant
//     TTC, intitulé, statut, pièce jointe PDF/image, note.
// Données : /api/devis-externes (settings JSON, aucune migration) ; pièce jointe :
// /api/devis-externes/upload (bucket `depenses`, dossier devis-externes/).
// Envoi par email (pièce jointe incluse) : /api/devis-externes/send.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Plus, Trash2, Loader2, ExternalLink, X, StickyNote, Mail, Send } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { DevisExterne, DevisStatut, DevisFichier } from "@/app/api/devis-externes/_store";

export type { DevisExterne };

export interface DevisStandard { key: string; label: string; href: string; sub?: string }

const STATUT_META: Record<DevisStatut, { label: string; on: string }> = {
  envoye : { label: "Envoyé",  on: "bg-blue-600 text-white border-blue-600" },
  accepte: { label: "Accepté", on: "bg-green-600 text-white border-green-600" },
  refuse : { label: "Refusé",  on: "bg-red-500 text-white border-red-500" },
};
const STATUTS = Object.keys(STATUT_META) as DevisStatut[];
const MAX_DIRECT = 4 * 1024 * 1024;   // au-delà : upload direct via URL signée
const MAX_FILE   = 20 * 1024 * 1024;

const todayIso = () => new Date().toLocaleDateString("sv-SE");
export function fmtDevisDate(iso: string) {
  const p = (iso || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
// "25/10/2026 à 14:32" (heure de Paris)
const fmtEnvoi = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const o = { timeZone: "Europe/Paris" } as const;
  return `${d.toLocaleDateString("fr-FR", o)} à ${d.toLocaleTimeString("fr-FR", { ...o, hour: "2-digit", minute: "2-digit" })}`;
};
export interface DevisEnvoiInfo { email: string; journal: { id: string; date: string; texte: string; type?: string } | null; dateRelance?: string }
const fmtMontant = (m: string) => {
  const n = parseFloat(m);
  return isNaN(n) ? "" : n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
};

async function uploadFichier(kind: string, id: string, file: File): Promise<DevisFichier> {
  if (file.size > MAX_FILE) throw new Error("Fichier trop lourd (20 Mo max).");
  if (file.size <= MAX_DIRECT) {
    const fd = new FormData();
    fd.append("kind", kind); fd.append("id", id); fd.append("file", file);
    const r = await fetch("/api/devis-externes/upload", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Envoi du fichier impossible");
    return { url: d.url, path: d.path, nom: d.nom || file.name, type: d.type || file.type };
  }
  // Gros fichier : le serveur fournit une URL signée, le navigateur envoie directement.
  const r = await fetch("/api/devis-externes/upload", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, id, nom: file.name, type: file.type, size: file.size }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Envoi du fichier impossible");
  const up = await fetch(d.signedUrl, {
    method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, body: file,
  });
  if (!up.ok) throw new Error("Envoi du fichier impossible (stockage)");
  return { url: d.url, path: d.path, nom: d.nom || file.name, type: d.type || file.type };
}

export default function DevisExternes({
  kind, ownerId, standard = [], onAdded, onListChange, onSent,
}: {
  kind: "client" | "prospect";
  ownerId: string;
  standard?: DevisStandard[];
  onAdded?: (d: DevisExterne) => void;           // ex. ajout d'une ligne au journal
  onListChange?: (list: DevisExterne[]) => void;
  // Après un envoi par email : le serveur a déjà écrit la ligne 📧 au journal (et,
  // pour un prospect, relance → demain / NOUVEAU → CONTACTÉ) → le parent rafraîchit.
  onSent?: (d: DevisExterne, info: DevisEnvoiInfo) => void;
}) {
  const toast = useToast();
  const [list, setList] = useState<DevisExterne[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), montant: "", intitule: "", statut: "envoye" as DevisStatut, note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Feuille de confirmation d'envoi par email
  const [sendFor, setSendFor] = useState<DevisExterne | null>(null);
  const [sendEmail, setSendEmail] = useState<string | null>(null); // null = chargement
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const listChangeRef = useRef(onListChange);
  listChangeRef.current = onListChange;

  function apply(next: DevisExterne[]) {
    setList(next);
    listChangeRef.current?.(next);
  }

  useEffect(() => {
    if (!ownerId) return;
    let actif = true;
    setLoading(true);
    fetch(`/api/devis-externes?kind=${kind}&id=${encodeURIComponent(ownerId)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (actif) apply(Array.isArray(d.devis) ? d.devis : []); })
      .catch(() => { /* section vide, pas bloquant */ })
      .finally(() => { if (actif) setLoading(false); });
    return () => { actif = false; };
  }, [kind, ownerId]);

  function resetForm() {
    setForm({ date: todayIso(), montant: "", intitule: "", statut: "envoye", note: "" });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function save(andSend = false) {
    if (!form.intitule.trim() && !file) { toast.error("Indique un intitulé ou joins le devis"); return; }
    setSaving(true);
    try {
      const fichier = file ? await uploadFichier(kind, ownerId, file) : undefined;
      const r = await fetch("/api/devis-externes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: ownerId, devis: { ...form, fichier } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Enregistrement impossible");
      apply(d.list);
      onAdded?.(d.devis);
      toast.success("Devis externe ajouté ✅");
      resetForm();
      setShowForm(false);
      if (andSend && d.devis) openSend(d.devis);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setSaving(false); }
  }

  // Ouvre la confirmation d'envoi : on affiche l'adresse de la fiche avant d'envoyer.
  function openSend(dv: DevisExterne) {
    setSendFor(dv); setSendEmail(null); setSendMsg(""); setSendError("");
    fetch(`/api/devis-externes/send?cible=${kind}&id=${encodeURIComponent(ownerId)}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Adresse introuvable");
        setSendEmail(d.email || "");
      })
      .catch(e => { setSendEmail(""); setSendError(e instanceof Error ? e.message : "Adresse introuvable"); });
  }

  async function doSend() {
    if (!sendFor) return;
    setSending(true); setSendError("");
    try {
      const r = await fetch("/api/devis-externes/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cible: kind, id: ownerId, devisId: sendFor.id, message: sendMsg }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Envoi impossible (erreur ${r.status})`);
      if (Array.isArray(d.list)) apply(d.list);
      toast.success(`Envoyé à ${d.email} le ${fmtEnvoi(d.devis?.envoyeLe || new Date().toISOString())} ✅`);
      if (!d.journal) toast.error("Devis envoyé, mais pas la ligne du journal");
      onSent?.(d.devis, { email: d.email, journal: d.journal ?? null, dateRelance: d.dateRelance });
      setSendFor(null);
    } catch (e) { setSendError(e instanceof Error ? e.message : "Envoi impossible"); }
    finally { setSending(false); }
  }

  async function setStatut(dv: DevisExterne, statut: DevisStatut) {
    if (dv.statut === statut) return;
    const prev = list;
    apply(list.map(x => x.id === dv.id ? { ...x, statut } : x)); // optimiste
    setBusyId(dv.id);
    try {
      const r = await fetch("/api/devis-externes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: ownerId, devisId: dv.id, updates: { statut } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Erreur");
      apply(d.list);
      toast.success(`Devis ${STATUT_META[statut].label.toLowerCase()}`);
    } catch (e) { apply(prev); toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusyId(""); }
  }

  async function remove(dv: DevisExterne) {
    setBusyId(dv.id);
    try {
      const r = await fetch("/api/devis-externes", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: ownerId, devisId: dv.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Erreur");
      apply(d.list);
      toast.success("Devis supprimé");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusyId(""); setConfirmId(""); }
  }

  const fieldCls = "w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300";
  const total = standard.length + list.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <FileText size={12} className="text-indigo-500" /> Devis {total > 0 && `(${total})`}
        </p>
        <button type="button" onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1 py-1">
          {showForm ? <><X size={12} /> Fermer</> : <><Plus size={12} /> Ajouter un devis externe</>}
        </button>
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 space-y-2">
          <input type="text" value={form.intitule} onChange={e => setForm(f => ({ ...f, intitule: e.target.value }))}
            placeholder="Intitulé (ex. Remise en état après travaux 120 m²)" className={fieldCls} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">Date d&apos;envoi</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={fieldCls} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">Montant TTC (€)</label>
              <input type="number" inputMode="decimal" min={0} step="0.01" value={form.montant} placeholder="optionnel"
                onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} className={fieldCls} />
            </div>
          </div>
          <div className="flex gap-1.5">
            {STATUTS.map(s => (
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, statut: s }))}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  form.statut === s ? STATUT_META[s].on : "bg-white text-gray-500 border-gray-200"
                }`}>{STATUT_META[s].label}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 bg-white border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 cursor-pointer hover:border-indigo-300">
            <Paperclip size={14} className="text-gray-400 shrink-0" />
            <span className="flex-1 truncate">{file ? file.name : "Joindre le devis (PDF ou photo) — optionnel"}</span>
            {file && (
              <button type="button" onClick={e => { e.preventDefault(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="text-gray-400 hover:text-red-500"><X size={14} /></button>
            )}
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <textarea rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Note (conditions, remise, interlocuteur…) — optionnel" className={`${fieldCls} resize-none`} />
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => save(false)} disabled={saving}
              className="flex-1 py-2 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : "Enregistrer"}
            </button>
            <button type="button" onClick={() => save(true)} disabled={saving}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
              <Send size={14} /> Enregistrer et envoyer
            </button>
          </div>
        </div>
      )}

      {/* Devis standard (générés par le dashboard) */}
      {standard.length > 0 && (
        <div className="space-y-1.5">
          {standard.map(s => (
            <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 hover:bg-indigo-50 transition-colors">
              <FileText size={14} className="text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{s.label}</p>
                {s.sub && <p className="text-[11px] text-gray-400 truncate">{s.sub}</p>}
              </div>
              <span className="text-[10px] font-medium text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded-full shrink-0">Dashboard</span>
              <ExternalLink size={12} className="text-gray-400 shrink-0" />
            </a>
          ))}
        </div>
      )}

      {/* Devis externes */}
      {loading && list.length === 0 ? (
        <div className="flex justify-center py-2"><Loader2 size={14} className="animate-spin text-gray-300" /></div>
      ) : list.length > 0 ? (
        <div className="space-y-1.5">
          {list.map(dv => (
            <div key={dv.id} className="border border-indigo-100 rounded-lg px-3 py-2 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 break-words">{dv.intitule || dv.fichier?.nom || "Devis externe"}</p>
                  <p className="text-[11px] text-gray-400">
                    Envoyé le {fmtDevisDate(dv.date)} · externe{dv.origine === "prospect" ? " · repris du prospect" : ""}
                  </p>
                </div>
                {dv.montant && <span className="text-sm font-semibold text-green-700 shrink-0">{fmtMontant(dv.montant)}</span>}
              </div>
              {dv.envoyeLe && (
                <p className="flex items-center gap-1 text-[11px] text-green-700 bg-green-50 rounded-lg px-2 py-1 break-all">
                  <Mail size={11} className="shrink-0" />
                  Envoyé par mail le {fmtEnvoi(dv.envoyeLe)}{dv.envoyeA ? ` à ${dv.envoyeA}` : ""}
                  {(dv.envoisCount || 0) > 1 ? ` · ${dv.envoisCount} envois` : ""}
                </p>
              )}
              {dv.note && (
                <p className="flex items-start gap-1 text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1 whitespace-pre-line break-words">
                  <StickyNote size={11} className="shrink-0 mt-0.5 text-gray-400" />{dv.note}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUTS.map(s => (
                  <button key={s} type="button" onClick={() => setStatut(dv, s)} disabled={busyId === dv.id}
                    className={`px-2 py-1 rounded-full border text-[11px] font-medium transition-colors disabled:opacity-60 ${
                      dv.statut === s ? STATUT_META[s].on : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                    }`}>{STATUT_META[s].label}</button>
                ))}
                <span className="flex-1" />
                <button type="button" onClick={() => openSend(dv)} disabled={busyId === dv.id}
                  className="flex items-center gap-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded-lg transition-colors disabled:opacity-50">
                  <Send size={11} /> {dv.envoyeLe ? "Renvoyer" : "Envoyer par mail"}
                </button>
                {dv.fichier && (
                  <a href={dv.fichier.url} target="_blank" rel="noopener noreferrer" title={dv.fichier.nom}
                    className="flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors">
                    <Paperclip size={11} /> Voir
                  </a>
                )}
                {confirmId === dv.id ? (
                  <span className="flex items-center gap-1.5">
                    <button type="button" onClick={() => remove(dv)} disabled={busyId === dv.id}
                      className="text-[11px] px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                      {busyId === dv.id ? "…" : "Supprimer"}
                    </button>
                    <button type="button" onClick={() => setConfirmId("")} className="text-[11px] text-gray-500">Annuler</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmId(dv.id)} title="Supprimer ce devis"
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : standard.length === 0 && !showForm ? (
        <p className="text-xs text-gray-400 text-center py-1">Aucun devis. Un devis fait hors dashboard ? Ajoute-le ici pour le garder sous la main.</p>
      ) : null}

      {/* Confirmation d'envoi par email (feuille bas d'écran sur mobile) */}
      {sendFor && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40"
          onClick={e => { e.stopPropagation(); if (!sending) setSendFor(null); }}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-3 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Mail size={14} className="text-indigo-500" /> {sendFor.envoyeLe ? "Renvoyer le devis" : "Envoyer le devis par mail"}</p>
                <p className="text-xs text-gray-500 break-words">{sendFor.intitule || sendFor.fichier?.nom || "Devis externe"}{sendFor.montant ? ` · ${fmtMontant(sendFor.montant)}` : ""}</p>
              </div>
              <button type="button" onClick={() => !sending && setSendFor(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-gray-500">À : </span>
              {sendEmail === null
                ? <Loader2 size={12} className="inline animate-spin text-gray-400" />
                : sendEmail
                  ? <strong className="text-gray-800 break-all">{sendEmail}</strong>
                  : <span className="text-red-600">aucune adresse email sur la fiche</span>}
            </div>
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              <Paperclip size={11} className="shrink-0" />
              {sendFor.fichier ? `Pièce jointe : ${sendFor.fichier.nom}` : "Aucune pièce jointe — l'email partira sans le devis joint."}
            </p>
            <textarea rows={3} value={sendMsg} onChange={e => setSendMsg(e.target.value)} maxLength={3000}
              placeholder="Message personnel (optionnel) — ajouté dans l'email" className={`${fieldCls} resize-none`} />
            {sendFor.envoyeLe && (
              <p className="text-[11px] text-amber-700">Déjà envoyé le {fmtEnvoi(sendFor.envoyeLe)}{sendFor.envoyeA ? ` à ${sendFor.envoyeA}` : ""}.</p>
            )}
            {sendError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-2 break-words">{sendError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setSendFor(null)} disabled={sending}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 disabled:opacity-50">Annuler</button>
              <button type="button" onClick={doSend} disabled={sending || !sendEmail}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {sending ? <><Loader2 size={14} className="animate-spin" /> Envoi…</> : <><Send size={14} /> Envoyer</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
