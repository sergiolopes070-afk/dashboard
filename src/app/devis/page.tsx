"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { FileText, ExternalLink, Search, Download } from "lucide-react";
import Topbar from "@/components/Topbar";
import { Prestation } from "@/lib/constants";

export default function DevisPage() {
  const [data, setData]       = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prestations");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const devis = useMemo(() =>
    data.filter((p) => p.devisPDF || p.genDevis === "FAIT"),
    [data]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return devis;
    const q = search.toLowerCase();
    return devis.filter((p) => [p.nom, p.prenom, p.typePresta].join(" ").toLowerCase().includes(q));
  }, [devis, search]);

  const downloadUrl = (pdfUrl: string, clientName: string) => {
    const name = `devis-${clientName.toLowerCase().replace(/\s+/g, "-")}`;
    return `/api/devis/download?url=${encodeURIComponent(pdfUrl)}&name=${encodeURIComponent(name)}`;
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Devis"
        subtitle={`${filtered.length} devis généré${filtered.length > 1 ? "s" : ""}`}
        onRefresh={load}
        loading={loading}
      />
      <div className="flex-1 p-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un devis..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
            <FileText size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">Aucun devis généré</p>
            <p className="text-sm mt-1">Les devis apparaissent ici quand la colonne V = OUI dans Google Sheets</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Client</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Prestation</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Montant</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.row} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{p.prenom} {p.nom}</div>
                      <div className="text-xs text-gray-400">{p.tel}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{p.typePresta}</td>
                    <td className="py-3 px-4 text-gray-700">{p.date || "—"}</td>
                    <td className="py-3 px-4">
                      {p.prix
                        ? <span className="font-semibold text-green-700">{p.prix} €</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="py-3 px-4">
                      {p.devisPDF ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={p.devisPDF}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                          >
                            <FileText size={12} />
                            Voir
                            <ExternalLink size={10} />
                          </a>
                          <a
                            href={downloadUrl(p.devisPDF, `${p.prenom}-${p.nom}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
                          >
                            <Download size={12} />
                            Télécharger
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Généré (lien manquant)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
