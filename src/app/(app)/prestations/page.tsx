"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Filter, Archive, X, Download, Trash2, Loader2 } from "lucide-react";
import Topbar from "@/components/Topbar";
import { Skeleton } from "@/components/Skeleton";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import PrestationTable from "@/components/PrestationTable";
import { ClientFicheById } from "@/components/ClientFiche";
import EditPrestationModal from "@/components/EditPrestationModal";
import { Prestation, Prestataire } from "@/lib/constants";

const STATUTS = ["Tous", "À affecter", "EMAIL ENVOYÉ", "CONFIRMÉ", "EN ATTENTE PRESTA", "PRESTATAIRE REFUSÉ – À RÉAFFECTER", "TERMINÉ", "ANNULÉ"];

export default function PrestationsPage() {
  const [data, setData]                   = useState<Prestation[]>(() => cacheGet<Prestation[]>(CACHE_KEYS.prestations) ?? []);
  const [prestataires, setPrestataires]   = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);
  const [loading, setLoading]             = useState(() => !cacheHas(CACHE_KEYS.prestations));
  const [error, setError]                 = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [ficheClientId, setFicheClientId] = useState<string | null>(null);
  const [statut, setStatut]               = useState("Tous");
  const [editing, setEditing]             = useState<Prestation | null>(null);
  const [archiveModal, setArchiveModal]       = useState<{ id: string; label: string } | null>(null);
  const [archiveReason, setArchiveReason]     = useState("");
  const [archivePayment, setArchivePayment]   = useState("");
  const [archiveComment, setArchiveComment]   = useState("");
  const [archiving, setArchiving]             = useState(false);
  const [deleteModal, setDeleteModal]     = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting]           = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resPres, resPresta] = await Promise.all([
        fetch("/api/prestations"),
        fetch("/api/prestataires"),
      ]);
      if (!resPres.ok) throw new Error((await resPres.json()).error);
      { const d = await resPres.json(); setData(d); cacheSet(CACHE_KEYS.prestations, d); }
      if (resPresta.ok) { const d = await resPresta.json(); setPrestataires(d); cacheSet(CACHE_KEYS.prestataires, d); }
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

  const exportCSV = () => {
    const headers = ["Prénom", "Nom", "Tel", "Email", "Adresse", "Type", "Quantité", "Date", "Heure", "Prix", "Statut", "Prestataire", "Commission", "Commentaire"];
    const rows = filtered.map(p => [
      p.prenom, p.nom, p.tel, p.email, p.adresse,
      p.typePresta, p.quantite, p.date, p.heure,
      p.prix, p.statut, p.prestataire,
      p.commission ? `${p.commission}${p.commissionType}` : "",
      p.commentaire,
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `prestations_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleArchiveConfirm = async () => {
    if (!archiveModal) return;
    setArchiving(true);
    try {
      const fullReason = archiveReason + (archiveComment.trim() ? ` — ${archiveComment.trim()}` : "");
      await fetch("/api/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: archiveModal.id, reason: fullReason, modePaiement: archivePayment }),
      });
      setArchiveModal(null);
      setArchiveReason("");
      setArchivePayment("");
      setArchiveComment("");
      load();
    } finally {
      setArchiving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await fetch("/api/prestations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteModal.id }),
      });
      setDeleteModal(null);
      load();
    } finally {
      setDeleting(false);
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
        action={
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        }
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
            <div className="space-y-3" aria-busy="true" aria-label="Chargement en cours">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <PrestationTable
              prestations={filtered}
              onEdit={setEditing}
              onArchive={(id, label) => { setArchiveModal({ id, label }); setArchiveReason(""); setArchivePayment(""); }}
              onDelete={(id, label) => setDeleteModal({ id, label })}
              onClientClick={setFicheClientId}
            />
          )}
        </div>
      </div>

      {ficheClientId && (
        <ClientFicheById clientId={ficheClientId} onClose={() => setFicheClientId(null)} onChanged={load} />
      )}

      {editing && (
        <EditPrestationModal
          prestation={editing}
          prestataires={prestataires}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onViewClient={setFicheClientId}
          onArchive={(id, label) => {
            setEditing(null);
            setArchiveModal({ id, label });
            setArchiveReason("");
          }}
        />
      )}

      {/* Modal suppression */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-600" />
            </div>
            <h2 className="font-bold text-gray-900 mb-1">Supprimer définitivement ?</h2>
            <p className="text-sm text-gray-500 mb-6">
              <span className="font-medium text-gray-700">{deleteModal.label}</span> sera supprimée définitivement. Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
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
            {/* Mode de paiement — obligatoire */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">
                Mode de paiement <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {["Espèces", "Virement bancaire", "Lien de paiement", "Chèque", "Carte sur place"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setArchivePayment(m)}
                    className={`text-xs px-3 py-2 rounded-xl border transition-colors text-left ${
                      archivePayment === m
                        ? "border-blue-400 bg-blue-50 text-blue-700 font-medium"
                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                    }`}
                  >
                    {m === "Espèces" ? "💵 " : m === "Virement bancaire" ? "🏦 " : m === "Lien de paiement" ? "🔗 " : m === "Chèque" ? "📄 " : "💳 "}
                    {m}
                  </button>
                ))}
              </div>
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
                disabled={!archiveReason.trim() || !archivePayment || archiving}
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
