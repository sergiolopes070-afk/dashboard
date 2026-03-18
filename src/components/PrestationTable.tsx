"use client";
import { Prestation } from "@/lib/constants";
import StatusBadge from "./StatusBadge";
import { ExternalLink, MessageCircle, FileText, Pencil } from "lucide-react";

interface PrestationTableProps {
  prestations: Prestation[];
  showActions?: boolean;
  onEdit?: (p: Prestation) => void;
}

export default function PrestationTable({ prestations, showActions = true, onEdit }: PrestationTableProps) {
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
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {prestations.map((p) => (
            <tr key={p.row} className="hover:bg-gray-50 transition-colors">
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
                <td className="py-3 px-4">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
