"use client";
import { useEffect, useState, useCallback } from "react";
import { Archive } from "lucide-react";
import Topbar from "@/components/Topbar";
import PrestationTable from "@/components/PrestationTable";
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
            <p className="text-sm mt-1">Les prestations terminées apparaîtront ici</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <PrestationTable prestations={data} showActions={false} />
          </div>
        )}
      </div>
    </div>
  );
}
