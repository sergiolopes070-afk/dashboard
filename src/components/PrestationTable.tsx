"use client";
import { Prestation } from "@/lib/constants";
import StatusBadge from "./StatusBadge";
import {
  ExternalLink, MessageCircle, FileText, Pencil, Archive, Trash2,
  CreditCard, Copy, Check, X, Loader2, Send, Download,
} from "lucide-react";
import { MODE_PAIEMENT_ICONS } from "@/lib/constants";
import { Entite } from "@/lib/entite";
import EntiteBadge from "@/components/EntiteBadge";
import { useState, useEffect } from "react";

// ─── Bouton / Modal paiement Stripe ──────────────────────────────────────────

function PaymentButton({ p }: { p: Prestation }) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl]         = useState(p.stripePaymentUrl || "");
  const [errMsg, setErr]      = useState("");
  const [copied, setCopied]   = useState(false);
  const [open, setOpen]       = useState(false);

  const amount = parseFloat(p.prix) || 0;
  if (amount <= 0 || p.statut === "ANNULÉ") return null;

  const isPaid = p.statut === "PAYÉ";

  const generate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (url) { setErr(""); setOpen(true); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/stripe/checkout", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          prestationId: p.row,
          amount,
          description : `${p.typePresta}${p.quantite ? ` x${p.quantite}` : ""}`,
          clientName  : `${p.prenom} ${p.nom}`.trim(),
          clientEmail : p.email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur Stripe");
      setUrl(data.url);
      setErr("");
      setOpen(true);
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Erreur inconnue");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const copy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Message WhatsApp ──
  const waText = encodeURIComponent(
    `Bonjour ${p.prenom} 👋,\n\nVoici votre lien de paiement sécurisé KinouClean pour votre prestation *${p.typePresta}* :\n\n${url}\n\nMontant : *${amount} €*\n\nMerci et à bientôt ! 🙏`
  );
  const waHref = p.tel
    ? `https://wa.me/${p.tel.replace(/\D/g, "")}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  // ── Message email ──
  const emailHref = `mailto:${p.email || ""}?subject=${encodeURIComponent(`Votre lien de paiement – KinouClean`)}&body=${encodeURIComponent(
    `Bonjour ${p.prenom},\n\nVoici votre lien de paiement sécurisé :\n${url}\n\nMontant : ${amount} €\nPrestation : ${p.typePresta}${p.date ? `\nDate : ${p.date}` : ""}\n\nCordialement,\nKinouClean`
  )}`;

  return (
    <>
      {/* Bouton table */}
      <button
        onClick={generate}
        title={isPaid ? "Paiement reçu ✓" : url ? "Voir / partager le lien" : "Générer un lien de paiement Stripe"}
        className={`p-1.5 rounded-lg transition-colors ${
          isPaid
            ? "bg-emerald-100 text-emerald-700 cursor-default"
            : url
              ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
              : "bg-violet-50 text-violet-500 hover:bg-violet-100"
        }`}
      >
        {loading    ? <Loader2 size={14} className="animate-spin" />
         : isPaid   ? <Check size={14} />
         : <CreditCard size={14} />
        }
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { e.stopPropagation(); setOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className={`p-5 text-white ${errMsg ? "bg-red-500" : isPaid ? "bg-gradient-to-r from-emerald-600 to-green-600" : "bg-gradient-to-r from-violet-600 to-purple-600"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-lg">
                    {errMsg ? "⚠️" : isPaid ? "✅" : <CreditCard size={20} />}
                  </div>
                  <div>
                    <h2 className="font-bold text-base">
                      {errMsg ? "Erreur" : isPaid ? "Paiement reçu !" : url ? "Lien de paiement" : "Générer le lien"}
                    </h2>
                    <p className="text-white/70 text-xs">{p.prenom} {p.nom} · {amount} €</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">

              {errMsg ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-2">
                  <p>{errMsg}</p>
                  {errMsg.toLowerCase().includes("configur") && (
                    <a href="/configuration" className="inline-flex items-center gap-1 underline font-medium text-red-600">
                      <ExternalLink size={12} /> Configurer Stripe
                    </a>
                  )}
                </div>
              ) : (
                <>
                  {/* Récap prestation */}
                  <div className={`rounded-xl p-3.5 space-y-1.5 text-sm ${isPaid ? "bg-emerald-50 border border-emerald-200" : "bg-violet-50"}`}>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Prestation</span>
                      <span className="font-semibold text-gray-800">{p.typePresta}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Montant</span>
                      <span className={`font-bold ${isPaid ? "text-emerald-700" : "text-violet-700"}`}>{amount} €</span>
                    </div>
                    {p.date && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Date</span>
                        <span className="font-medium text-gray-700">{p.date}</span>
                      </div>
                    )}
                    {isPaid && (
                      <div className="pt-1 flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                        <Check size={13} /> Paiement confirmé par Stripe
                      </div>
                    )}
                  </div>

                  {/* Lien + copie */}
                  {url && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500">Lien de paiement Stripe</p>
                      <div className="flex gap-2">
                        <input
                          readOnly value={url}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono bg-gray-50 text-gray-600 truncate min-w-0"
                        />
                        <button
                          onClick={() => copy()}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition-colors ${
                            copied ? "bg-emerald-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                          }`}
                        >
                          {copied ? <><Check size={12} /> Copié !</> : <><Copy size={12} /> Copier</>}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Boutons partage */}
                  {url && !isPaid && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500">Envoyer au client</p>
                      <div className="grid grid-cols-2 gap-2">
                        {/* WhatsApp */}
                        <a
                          href={waHref}
                          target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center justify-center gap-2 py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl text-xs font-semibold transition-colors"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          WhatsApp
                        </a>

                        {/* Email */}
                        {p.email ? (
                          <a
                            href={emailHref}
                            onClick={e => e.stopPropagation()}
                            className="flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-xs font-semibold transition-colors"
                          >
                            <ExternalLink size={13} /> Email
                          </a>
                        ) : (
                          <button disabled className="flex items-center justify-center gap-2 py-2.5 bg-gray-100 text-gray-400 rounded-xl text-xs cursor-not-allowed">
                            <ExternalLink size={13} /> Pas d&apos;email
                          </button>
                        )}
                      </div>

                      {/* Ouvrir dans Stripe */}
                      <a
                        href={url}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center justify-center gap-2 w-full py-2.5 border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-xs font-medium transition-colors"
                      >
                        <CreditCard size={13} /> Aperçu de la page de paiement
                      </a>
                    </div>
                  )}

                  {isPaid && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-sm text-emerald-800 flex items-start gap-2.5">
                      <Check size={16} className="flex-shrink-0 mt-0.5 text-emerald-600" />
                      <div>
                        <p className="font-semibold">Paiement confirmé</p>
                        <p className="text-xs text-emerald-700 mt-0.5">Le prestataire a été notifié par email automatiquement.</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

interface PrestationTableProps {
  prestations: Prestation[];
  showActions?: boolean;
  onEdit?: (p: Prestation) => void;
  onArchive?: (id: string, label: string) => void;
  onDelete?: (id: string, label: string) => void;
  onClientClick?: (clientId: string) => void;
}

export default function PrestationTable({ prestations, showActions = true, onEdit, onArchive, onDelete, onClientClick }: PrestationTableProps) {
  // Corrections manuelles d'entité (settings/entite_override), chargées une fois.
  const [entiteOverrides, setEntiteOverrides] = useState<Record<string, Entite>>({});
  useEffect(() => {
    fetch("/api/prestations/entite").then(r => r.json()).then(d => setEntiteOverrides(d.overrides || {})).catch(() => {});
  }, []);
  async function setEntite(prestationId: string, entite: Entite | null) {
    // Optimiste
    setEntiteOverrides(prev => {
      const next = { ...prev };
      if (entite) next[prestationId] = entite; else delete next[prestationId];
      return next;
    });
    try {
      const r = await fetch("/api/prestations/entite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prestationId, entite }),
      });
      const d = await r.json();
      if (d.overrides) setEntiteOverrides(d.overrides);
    } catch { /* garde l'état optimiste */ }
  }

  if (prestations.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg font-medium">Aucune prestation</p>
        <p className="text-sm mt-1">Les données s&apos;afficheront ici</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Prestation</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Prix</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Prestataire</th>
            {showActions && (
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            )}
            {(onArchive || onDelete) && (
              <th className="py-3 px-2 w-16" />
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {prestations.map((p) => (
            <tr
              key={p.row}
              className={`hover:bg-gray-50 transition-colors ${onEdit ? "cursor-pointer" : ""}`}
              onClick={() => onEdit?.(p)}
            >
              <td className="py-3 px-4">
                {onClientClick && p.clientId ? (
                  <button onClick={(e) => { e.stopPropagation(); onClientClick(p.clientId); }} className="font-medium text-gray-900 hover:text-blue-600 hover:underline transition-colors text-left" title="Ouvrir la fiche client">
                    {p.prenom} {p.nom}
                  </button>
                ) : (
                  <div className="font-medium text-gray-900">{p.prenom} {p.nom}</div>
                )}
                <div className="text-xs text-gray-400">{p.tel}</div>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <span className="font-medium text-gray-800">{p.typePresta}</span>
                  <EntiteBadge prestationId={p.row} typePresta={p.typePresta} overrides={entiteOverrides} onSet={setEntite} />
                </div>
                {p.quantite && <div className="text-xs text-gray-400">{p.quantite}</div>}
              </td>
              <td className="py-3 px-4">
                <div className="text-gray-700">{p.date || "—"}</div>
                {p.heure && <div className="text-xs text-gray-400">{p.heure}</div>}
              </td>
              <td className="py-3 px-4">
                {p.prix
                  ? <span className="font-semibold text-green-700">{p.prix} €</span>
                  : <span className="text-gray-300">—</span>
                }
                {p.modePaiement && (
                  <div className="mt-0.5">
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-lg bg-gray-100 text-gray-600">
                      {MODE_PAIEMENT_ICONS[p.modePaiement]} {p.modePaiement}
                    </span>
                  </div>
                )}
                {p.prix && p.commission && parseFloat(p.commission) > 0 && (() => {
                  const prix  = parseFloat(p.prix)       || 0;
                  const val   = parseFloat(p.commission) || 0;
                  const type  = p.commissionType || "%";
                  const comm  = type === "%" ? prix * val / 100 : val;
                  const net   = prix - comm;
                  return (
                    <div className="mt-0.5 space-y-0.5">
                      <div className="text-xs text-gray-400">
                        Comm. {type === "%" ? `${val}%` : `${val} €`} = {comm.toFixed(0)} €
                      </div>
                      <div className={`text-xs font-semibold ${net >= 0 ? "text-emerald-600" : "text-orange-600"}`}>
                        Net {net >= 0 ? "+" : ""}{net.toFixed(0)} €
                      </div>
                    </div>
                  );
                })()}
              </td>
              <td className="py-3 px-4">
                <StatusBadge statut={p.statut} small />
                {p.statutPresta && (p.statutPresta as string) !== (p.statut as string) && (
                  <div className="mt-1">
                    <StatusBadge statut={p.statutPresta} small />
                  </div>
                )}
              </td>
              <td className="py-3 px-4 text-gray-600">
                {p.prestataire
                  ? <span className="font-medium text-gray-800">{p.prestataire}</span>
                  : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                      À affecter
                    </span>
                }
              </td>
              {showActions && (
                <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(p)}
                        title="Modifier"
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {/* Bouton Stripe */}
                    <PaymentButton p={p} />

                    {p.lienWA && (
                      <a
                        href={p.lienWA}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="WhatsApp"
                        className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                      >
                        <MessageCircle size={14} />
                      </a>
                    )}
                    {p.devisPDF && (
                      <>
                        <a
                          href={p.devisPDF}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Voir devis PDF"
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          <FileText size={14} />
                        </a>
                        <a
                          href={`/api/devis/${p.row}?download=1`}
                          title="Télécharger le devis"
                          className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          <Download size={14} />
                        </a>
                      </>
                    )}
                    {p.email && (() => {
                      const details = [
                        p.typePresta ? `  • Prestation : ${p.typePresta}${p.quantite ? ` (x${p.quantite})` : ""}` : "",
                        p.adresse    ? `  • Adresse    : ${p.adresse}` : "",
                        p.date       ? `  • Date       : ${p.date}${p.heure ? ` à ${p.heure}` : ""}` : "",
                        p.prix       ? `  • Montant    : ${p.prix} €` : "",
                      ].filter(Boolean).join("\n");
                      const body = [
                        `Bonjour ${p.prenom},`,
                        ``,
                        `Nous avons bien enregistré votre demande et vous remercions de votre confiance.`,
                        ``,
                        `Voici le récapitulatif de votre rendez-vous :`,
                        ``,
                        details,
                        ``,
                        `Pour toute question ou modification, n'hésitez pas à nous contacter — nous sommes à votre entière disposition.`,
                        ``,
                        `Nous nous réjouissons de vous accueillir prochainement et vous souhaitons une excellente journée.`,
                        ``,
                        `À très bientôt,`,
                        ``,
                        `L'équipe KinouClean`,
                      ].join("\n");
                      const subject = encodeURIComponent("Confirmation de votre rendez-vous – KinouClean");
                      return (
                        <a
                          href={`mailto:${p.email}?subject=${subject}&body=${encodeURIComponent(body)}`}
                          title="Envoyer un mail de confirmation"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-medium whitespace-nowrap"
                        >
                          <Send size={12} />
                          Mail
                        </a>
                      );
                    })()}
                  </div>
                </td>
              )}
              {(onArchive || onDelete) && (
                <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {onArchive && (
                      <button
                        onClick={() => onArchive(p.row, `${p.prenom} ${p.nom} – ${p.typePresta}`)}
                        title="Archiver cette prestation"
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-colors"
                      >
                        <Archive size={14} />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(p.row, `${p.prenom} ${p.nom} – ${p.typePresta}`)}
                        title="Supprimer définitivement"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
