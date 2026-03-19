"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Filter, Archive, X } from "lucide-react";
import Topbar from "@/components/Topbar";
import PrestationTable from "@/components/PrestationTable";
import EditPrestationModal from "@/components/EditPrestationModal";
import { Prestation, Prestataire } from "@/lib/constants";

const STATUTS = ["Tous", "À affecter", "EMAIL ENVOYÉ", "CONFIRMÉ", "EN ATTENTE PRESTA", "PRESTATAIRE REFUSÉ – À RÉAFFECTER", "TERMINÉ", "ANNULÉ"];

export default function PrestationsPage() {
  const [data, setData]                   = useState<Prestation[]>([]);
  const [prestataires, setPrestataires]   = useState<Prestataire[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [statut, setStatut]               = useState("Tous");
  const [editing, setEditing]             = useState<Prestation | null>(null);
  const [archiveModal, setArchiveModal]   = useState<{ id: string; label: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveComment, setArchiveComment] = useState("");
  const [archiving, setArchiving]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resPres, resPresta] = await Promise.all([
        fetch("/api/prestations"),
        fetch("/api/prestataires"),
      ]);
      if (!resPres.ok) throw new Error((await resPres.json()).error);
      setData(await resPres.json());
      if (resPresta.ok) setPrestataires(await resPresta.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaved = useCallback((row: string, updates: Record<string, string>) => {
    setData((prev) =>
      prev.map((p) => (p.row === row ? { ...p, ...updates } : p))
    );
  }, []);

  const handleArchiveConfirm = async () => {
    if (!archiveModal) return;
    setArchiving(true);
    try {
      const fullReason = archiveReason + (archiveComment.trim() ? ` — ${archiveComment.trim()}` : "");
      await fetch("/api/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: archiveModal.id, reason: fullReason }),
      });
      setArchiveModal(null);
      setArchiveReason("");
      setArchiveComment("");
      load();
    } finally {
      setArchiving(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = data;
    if (statut === "À affecter") list = list.filter((p) => !p.prestataire);
    else if (statut !== "Tous") list = list.filter((p) => p.statut === statut || p.statutPresta === statut);
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
            <PrestationTable
              prestations={filtered}
              onEdit={setEditing}
              onArchive={(id, label) => { setArchiveModal({ id, label }); setArchiveReason(""); }}
            />
          )}
        </div>
      </div>

      {editing && (
        <EditPrestationModal
          prestation={editing}
          prestataires={prestataires}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onArchive={(id, label) => {
            setEditing(null);
            setArchiveModal({ id, label });
            setArchiveReason("");
          }}
        />
      )}

      {/* Modal archivage */}
      {archiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive size={18} className="text-amber-500" />
                <h2 className="font-semibold text-gray-900">Archiver la prestation</h2>
              </div>
              <button onClick={() => setArchiveModal(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{archiveModal.label}</span> sera déplacée dans l&apos;historique.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Raison de l&apos;archivage</label>
              <div className="grid grid-cols-2 gap-2">
                {["Annulation client", "Prestation terminée", "Client injoignable", "Doublon"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setArchiveReason(r)}
                    className={`text-xs px-3 py-2 rounded-xl border transition-colors text-left ${
                      archiveReason === r
                        ? "border-amber-400 bg-amber-50 text-amber-700 font-medium"
                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Autre raison…"
                value={["Annulation client", "Prestation terminée", "Client injoignable", "Doublon"].includes(archiveReason) ? "" : archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Commentaire <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <textarea
                rows={2}
                placeholder="Détails supplémentaires sur la situation…"
                value={archiveComment}
                onChange={(e) => setArchiveComment(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setArchiveModal(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleArchiveConfirm}
                disabled={!archiveReason.trim() || archiving}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {archiving ? "Archivage…" : "Archiver"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
