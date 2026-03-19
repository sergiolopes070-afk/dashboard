"use client";
import { useEffect, useState, useCallback } from "react";
import { Archive } from "lucide-react";
import Topbar from "@/components/Topbar";
import { Prestation } from "@/lib/constants";

export default function ArchivePage() {
  const [data, setData]       = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/archive");
      if (!res.ok) throw new Error((await res.json()).error);
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCA = data.reduce((sum, p) => sum + (parseFloat(p.prix) || 0), 0);

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Historique Prestations"
        subtitle={`${data.length} prestations archivées · CA total : ${totalCA.toFixed(0)} €`}
        onRefresh={load}
        loading={loading}
      />
      <div className="flex-1 p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
            <Archive size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">Aucune prestation archivée</p>
            <p className="text-sm mt-1">Les prestations annulées ou terminées apparaîtront ici</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Prestation</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Prix</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Prestataire</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Raison archivage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.map((p) => (
                    <tr key={p.row} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{p.prenom} {p.nom}</div>
                        <div className="text-xs text-gray-400">{p.tel}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-800">{p.typePresta}</div>
                        {p.quantite && <div className="text-xs text-gray-400">x{p.quantite}</div>}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{p.date || "—"}</td>
                      <td className="py-3 px-4">
                        {p.prix
                          ? <span className="font-semibold text-green-700">{p.prix} €</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="py-3 px-4 text-gray-600">{p.prestataire || "—"}</td>
                      <td className="py-3 px-4">
                        {p.raisonArchivage ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 text-xs font-medium">
                            {p.raisonArchivage}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
