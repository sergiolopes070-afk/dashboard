"use client";
import { useEffect, useState, useCallback } from "react";
import { Phone, Mail, Wrench, UserPlus } from "lucide-react";
import Topbar from "@/components/Topbar";
import NewPrestataireModal from "@/components/NewPrestataireModal";
import { Prestataire } from "@/lib/constants";

export default function PrestatairesPage() {
  const [data, setData]       = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prestataires");
      if (!res.ok) throw new Error((await res.json()).error);
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col min-h-screen">
      {showModal && (
        <NewPrestataireModal
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
      <Topbar
        title="Prestataires"
        subtitle={`${data.length} prestataire${data.length > 1 ? "s" : ""} dans l'équipe`}
        onRefresh={load}
        loading={loading}
        action={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            <UserPlus size={16} />
            Nouveau prestataire
          </button>
        }
      />
      <div className="flex-1 p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{error}</div>
        )}

        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((p, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <Wrench size={20} className="text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{p.nom}</p>
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1 truncate">
                      <Mail size={13} />{p.email}
                    </a>
                  )}
                  {p.tel && (
                    <a href={`tel:${p.tel}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mt-0.5">
                      <Phone size={13} />{p.tel}
                    </a>
                  )}
                  {p.tel && (
                    <a
                      href={`https://wa.me/${p.tel.replace(/\s/g, "").replace(/^0/, "33")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg hover:bg-green-100 transition-colors"
                    >
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
            {data.length === 0 && !loading && (
              <div className="col-span-3 text-center py-12 text-gray-400">
                <Wrench size={40} className="mx-auto mb-3 opacity-20" />
                <p>Aucun prestataire trouvé</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
