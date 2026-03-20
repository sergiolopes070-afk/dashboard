"use client";
import { Prestation } from "@/lib/constants";
import StatusBadge from "./StatusBadge";
import {
  ExternalLink, MessageCircle, FileText, Pencil, Archive, Trash2,
  CreditCard, Copy, Check, X, Loader2, ExternalLink as OpenIcon,
} from "lucide-react";
import { useState } from "react";

// ─── Bouton / Modal paiement Stripe ──────────────────────────────────────────

function PaymentButton({ p }: { p: Prestation }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [url, setUrl]     = useState(p.stripePaymentUrl || "");
  const [errMsg, setErr]  = useState("");
  const [copied, setCopied] = useState(false);
  const [open, setOpen]   = useState(false);

  const amount = parseFloat(p.prix) || 0;
  if (amount <= 0 || p.statut === "ANNULÉ") return null;

  const generate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (url) { setOpen(true); return; } // lien déjà généré → ouvrir direct

    setState("loading");
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
      setState("done");
      setOpen(true);
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Erreur inconnue");
      setState("error");
      setOpen(true);
    }
  };

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasLink = !!url;

  return (
    <>
      {/* Bouton dans la table */}
      <button
        onClick={generate}
        title={hasLink ? "Voir le lien de paiement" : "Générer un lien de paiement Stripe"}
        className={`p-1.5 rounded-lg transition-colors ${
          hasLink
            ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
            : "bg-violet-50 text-violet-500 hover:bg-violet-100"
        }`}
      >
        {state === "loading"
          ? <Loader2 size={14} className="animate-spin" />
          : <CreditCard size={14} />
        }
      </button>

      {/* Modal résultat */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { e.stopPropagation(); setOpen(false); setState("idle"); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-5 text-white ${state === "error" ? "bg-red-500" : "bg-gradient-to-r from-violet-600 to-purple-600"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-base">
                      {state === "error" ? "Erreur Stripe" : "Lien de paiement"}
                    </h2>
                    <p className="text-white/70 text-xs">
                      {state === "error" ? "" : `${p.prenom} ${p.nom} — ${amount} €`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setOpen(false); setState("idle"); }}
                  className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {state === "error" ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                  {errMsg}
                  {errMsg.includes("Configuration") && (
                    <a href="/configuration" className="block mt-2 underline font-medium">
                      → Aller dans Configuration
                    </a>
                  )}
                </div>
              ) : (
                <>
                  {/* Infos prestation */}
                  <div className="bg-violet-50 rounded-xl p-3.5 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Prestation</span>
                      <span className="font-medium text-gray-800">{p.typePresta}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Montant</span>
                      <span className="font-bold text-violet-700">{amount} €</span>
                    </div>
                    {p.date && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Date</span>
                        <span className="font-medium text-gray-800">{p.date}</span>
                      </div>
                    )}
                  </div>

                  {/* Lien */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Lien de paiement Stripe</p>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={url}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono bg-gray-50 text-gray-700 truncate"
                      />
                      <button
                        onClick={copy}
                        className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                          copied
                            ? "bg-emerald-500 text-white"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                        }`}
                      >
                        {copied ? <><Check size={12} /> Copié</> : <><Copy size={12} /> Copier</>}
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold text-center flex items-center justify-center gap-2 transition-colors"
                    >
                      <OpenIcon size={14} /> Ouvrir le paiement
                    </a>
                    {p.email && (
                      <a
                        href={`mailto:${p.email}?subject=Lien%20de%20paiement%20KinouClean&body=Bonjour%20${encodeURIComponent(p.prenom)}%2C%0A%0AVoici%20votre%20lien%20de%20paiement%20s%C3%A9curis%C3%A9%20%3A%0A${encodeURIComponent(url)}%0A%0AMontant%20%3A%20${amount}%20%E2%82%AC%0A%0ACordialement%2C%0AKinouClean`}
                        className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium text-center flex items-center justify-center gap-2 transition-colors"
                      >
                        <ExternalLink size={14} /> Envoyer par email
                      </a>
                    )}
                  </div>
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
}

export default function PrestationTable({ prestations, showActions = true, onEdit, onArchive, onDelete }: PrestationTableProps) {
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
                <div className="font-medium text-gray-900">{p.prenom} {p.nom}</div>
                <div className="text-xs text-gray-400">{p.tel}</div>
              </td>
              <td className="py-3 px-4">
                <div className="font-medium text-gray-800">{p.typePresta}</div>
                {p.quantite && <div className="text-xs text-gray-400">x{p.quantite}</div>}
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
                      <a
                        href={p.devisPDF}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Devis PDF"
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        <FileText size={14} />
                      </a>
                    )}
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        title="Email client"
                        className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
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
