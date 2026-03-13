"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Filter } from "lucide-react";
import Topbar from "@/components/Topbar";
import PrestationTable from "@/components/PrestationTable";
import { Prestation } from "@/lib/constants";

const STATUTS = ["Tous", "EMAIL ENVOYÉ", "CONFIRMÉ", "EN ATTENTE PRESTA", "PRESTATAIRE REFUSÉ – À RÉAFFECTER", "TERMINÉ", "ANNULÉ"];

export default function PrestationsPage() {
  const [data, setData]       = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [statut, setStatut]   = useState("Tous");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prestations");
      if (!res.ok) throw new Error((await res.json()).error);
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = data;
    if (statut !== "Tous") list = list.filter((p) => p.statut === statut || p.statutPresta === statut);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        [p.nom, p.prenom, p.email, p.tel, p.typePresta, p.adresse, p.prestataire]
          .join(" ").toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, search, statut]);

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Prestations"
        subtitle={`${filtered.length} prestation${filtered.length > 1 ? "s" : ""}`}
        onRefresh={load}
        loading={loading}
      />
      <div className="flex-1 p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* Filtres */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher client, prestation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-gray-400" />
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {STATUTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {loading && data.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <PrestationTable prestations={filtered} />
          )}
        </div>
      </div>
    </div>
  );
}
