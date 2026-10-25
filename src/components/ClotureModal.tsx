"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Modale UNIQUE de clôture (= archivage) d'un ou plusieurs RDV.
// Utilisée par : tableau de bord, Prestations, Agenda, Clients, EditPrestationModal.
// - Motif : MOTIFS_ARCHIVAGE + « Autre » (texte libre) + commentaire optionnel
// - Prestation réalisée → mode de paiement obligatoire (PAIEMENTS_CLOTURE,
//   « Avance immédiate » par défaut) + satisfaction / avis laissé (optionnels)
//   + demande d'avis par email (1 seule prestation, si l'interrupteur global est actif)
// - Annulation → aucun paiement, non comptée dans le CA ni le stock
// Appelle PATCH /api/archive { id, reason, modePaiement, satisfaction, avisLaisse }.
// Bottom sheet sur mobile, centrée sur ordinateur.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  Prestation, PAIEMENTS_CLOTURE, MOTIF_TERMINEE, MOTIFS_ARCHIVAGE, MODE_PAIEMENT_ICONS, estAnnulation,
} from "@/lib/constants";

// Champs minimum nécessaires pour afficher / clôturer une prestation.
export type ClotureCible = Pick<Prestation, "row" | "prenom" | "nom" | "date" | "heure" | "typePresta" | "prix">;

export interface ClotureModalProps {
  /** Prestation à clôturer (cas courant). */
  prestation?: ClotureCible | null;
  /** Plusieurs prestations à clôturer d'un coup (ex. archiver un client entier). */
  prestations?: ClotureCible[];
  /** Libellé affiché en en-tête (sinon : prénom nom du 1er RDV). */
  label?: string;
  /** Motif présélectionné (défaut : « Prestation terminée »). */
  motifInitial?: string;
  onClose: () => void;
  /** Appelé avec les ids effectivement archivés (succès seulement). */
  onDone: (ids: string[]) => void;
}

const AUTRE = "__autre__";
const SATISFACTION = [
  { e: "😠", n: 1, t: "Très mécontent" }, { e: "🙁", n: 2, t: "Mécontent" }, { e: "😐", n: 3, t: "Neutre" },
  { e: "🙂", n: 4, t: "Content" }, { e: "😄", n: 5, t: "Très content" },
];

export default function ClotureModal({ prestation, prestations, label, motifInitial = MOTIF_TERMINEE, onClose, onDone }: ClotureModalProps) {
  const toast = useToast();
  const cibles = useMemo<ClotureCible[]>(
    () => (prestations && prestations.length ? prestations : prestation ? [prestation] : []),
    [prestation, prestations],
  );
  const unique = cibles.length === 1 ? cibles[0] : null;

  const initAutre = !!motifInitial && !MOTIFS_ARCHIVAGE.includes(motifInitial);
  const [motif, setMotif]           = useState(initAutre ? AUTRE : motifInitial);
  const [motifLibre, setMotifLibre] = useState(initAutre ? motifInitial : "");
  const [paiement, setPaiement]     = useState<string>(PAIEMENTS_CLOTURE[0]); // « Avance immédiate »
  const [commentaire, setCommentaire] = useState("");
  const [satisf, setSatisf]         = useState(0);     // 0 = non noté
  const [avisLaisse, setAvisLaisse] = useState(false); // le client a laissé un avis Google
  const [avisGlobalActif, setAvisGlobalActif] = useState(true);
  const [envoyerAvis, setEnvoyerAvis] = useState(true);
  const [saving, setSaving]         = useState(false);

  // Interrupteur global des demandes d'avis (Configuration → Automatisations).
  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(s => {
      const actif = s ? s.avis_actif !== "false" : true;
      setAvisGlobalActif(actif); setEnvoyerAvis(actif);
    }).catch(() => {});
  }, []);

  // Échap = fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const motifFinal = (motif === AUTRE ? motifLibre : motif).trim();
  const annulation = estAnnulation(motifFinal);
  const valide = !!motifFinal && (annulation || !!paiement) && cibles.length > 0;
  const total = cibles.reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);

  async function confirmer() {
    if (!valide || saving) return;
    setSaving(true);
    const reason = motifFinal + (commentaire.trim() ? ` — ${commentaire.trim()}` : "");
    const body = (id: string) => JSON.stringify({
      id, reason,
      modePaiement: annulation ? "" : paiement,
      ...(annulation ? {} : { satisfaction: satisf || "", avisLaisse }),
    });
    const res = await Promise.all(cibles.map(p =>
      fetch("/api/archive", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: body(p.row) })
        .then(r => r.ok).catch(() => false),
    ));
    const okIds = cibles.filter((_, i) => res[i]).map(p => p.row);
    const ko = cibles.length - okIds.length;

    if (okIds.length) {
      toast.success(okIds.length > 1 ? `${okIds.length} prestations clôturées` : annulation ? "RDV archivé (annulation)" : "RDV clôturé");
    }
    if (ko) toast.error(`${ko} clôture${ko > 1 ? "s" : ""} en échec — réessayez`);

    // Demande d'avis (1 seule prestation réalisée, case cochée, interrupteur actif)
    if (unique && okIds.length === 1 && !annulation && avisGlobalActif && envoyerAvis) {
      try {
        const r = await fetch("/api/emails/send-avis", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prestationId: unique.row }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && !d.paused) toast.success("Demande d'avis envoyée au client ⭐");
        else if (!r.ok) toast.error(d.error || "Avis non envoyé");
      } catch { toast.error("Avis non envoyé (réseau)"); }
    }

    setSaving(false);
    if (okIds.length) onDone(okIds);
    if (!ko) onClose();
  }

  const chip = (actif: boolean, couleur: "amber" | "blue") =>
    `px-3 py-2.5 rounded-xl border text-sm text-left transition-colors ${
      actif
        ? couleur === "amber" ? "border-amber-400 bg-amber-50 text-amber-800 font-medium" : "border-blue-500 bg-blue-50 text-blue-700 font-medium"
        : "border-gray-200 text-gray-700 hover:border-gray-300"
    }`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="dialog" aria-modal="true" aria-label="Clôturer le RDV">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900">✅ Clôturer {cibles.length > 1 ? `${cibles.length} RDV` : "le RDV"}</h2>
            {unique ? (
              <>
                <p className="text-sm font-medium text-gray-700 truncate mt-0.5">{label || `${unique.prenom} ${unique.nom}`}</p>
                <p className="text-xs text-gray-500">
                  {unique.date}{unique.heure ? ` à ${unique.heure}` : ""}{unique.typePresta ? ` · ${unique.typePresta}` : ""}
                  {unique.prix ? <span className="font-semibold text-gray-700"> · {unique.prix} €</span> : null}
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">
                {label || (cibles[0] ? `${cibles[0].prenom} ${cibles[0].nom}` : "")} — {cibles.length} prestations
                {total > 0 ? <span className="font-semibold text-gray-700"> · {total} €</span> : null}
              </p>
            )}
          </div>
          <button onClick={onClose} disabled={saving} className="p-2 -mr-2 rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Motif */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Motif</p>
            <div className="grid grid-cols-2 gap-2">
              {MOTIFS_ARCHIVAGE.map(m => (
                <button key={m} type="button" onClick={() => setMotif(m)} className={chip(motif === m, "amber")}>
                  {m === MOTIF_TERMINEE ? "✅ " : ""}{m}
                </button>
              ))}
              <button type="button" onClick={() => setMotif(AUTRE)} className={`${chip(motif === AUTRE, "amber")} col-span-2`}>✏️ Autre…</button>
            </div>
            {motif === AUTRE && (
              <input autoFocus type="text" value={motifLibre} onChange={e => setMotifLibre(e.target.value)} placeholder="Précisez le motif…"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            )}
          </div>

          {/* Paiement — uniquement si la prestation a eu lieu */}
          {annulation ? (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <span className="text-lg">🚫</span>
              <p className="text-xs text-gray-500">Pas de paiement pour une annulation — non comptabilisé dans le CA ni le stock.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Mode de paiement <span className="text-red-400">*</span></p>
              <div className="grid grid-cols-2 gap-2">
                {PAIEMENTS_CLOTURE.map(m => (
                  <button key={m} type="button" onClick={() => setPaiement(m)} className={chip(paiement === m, "blue")}>
                    {MODE_PAIEMENT_ICONS[m] ? `${MODE_PAIEMENT_ICONS[m]} ` : ""}{m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Satisfaction + avis — seulement si prestation réalisée */}
          {!annulation && (
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-medium text-gray-600 mb-2">Satisfaction du client <span className="text-gray-400 font-normal">(optionnel)</span></p>
              <div className="flex items-center justify-between gap-1">
                {SATISFACTION.map(({ e, n, t }) => (
                  <button key={n} type="button" title={t} aria-label={t} onClick={() => setSatisf(satisf === n ? 0 : n)}
                    className={`flex-1 py-1.5 rounded-lg text-2xl transition-all ${satisf === n ? "bg-emerald-50 scale-110" : "grayscale opacity-50 hover:opacity-80"}`}>
                    {e}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2.5 mt-3 pt-3 border-t border-gray-100 cursor-pointer">
                <input type="checkbox" checked={avisLaisse} onChange={e => setAvisLaisse(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                <span className="text-sm text-gray-700">⭐ Le client a laissé un avis (Google)</span>
              </label>
            </div>
          )}

          {/* Demande d'avis par email (1 seul RDV réalisé) */}
          {!annulation && unique && (
            avisGlobalActif ? (
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 bg-amber-50 cursor-pointer">
                <input type="checkbox" checked={envoyerAvis} onChange={e => setEnvoyerAvis(e.target.checked)} className="w-4 h-4 accent-amber-500 mt-0.5" />
                <span className="text-xs text-amber-800 leading-snug">
                  <strong>⭐ Envoyer la demande d&apos;avis à ce client</strong><br />
                  <span className="text-amber-600">Décoche si le client n&apos;était pas satisfait (aucun email ne partira).</span>
                </span>
              </label>
            ) : (
              <div className="p-3 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-500">
                ⏸️ Demandes d&apos;avis <strong>en pause</strong> — aucun email d&apos;avis ne sera envoyé.
              </div>
            )
          )}

          {/* Commentaire */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-600">Commentaire <span className="text-gray-400 font-normal">(optionnel)</span></p>
            <textarea rows={2} value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Note interne…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Annuler
          </button>
          <button onClick={confirmer} disabled={!valide || saving}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50 ${annulation ? "bg-amber-500 hover:bg-amber-600" : "bg-green-500 hover:bg-green-600"}`}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {saving ? "Clôture…" : annulation ? "Archiver" : "Clôturer"}
          </button>
        </div>
      </div>
    </div>
  );
}
