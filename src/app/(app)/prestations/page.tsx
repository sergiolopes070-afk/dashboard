"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Filter, Download, Trash2, Loader2, Inbox, Plus, ArrowUpDown, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import PrestationTable from "@/components/PrestationTable";
import { ClientFicheById } from "@/components/ClientFiche";
import EditPrestationModal from "@/components/EditPrestationModal";
import ClotureModal from "@/components/ClotureModal";
import NewClientModal from "@/components/NewClientModal";
import { Prestation, Prestataire } from "@/lib/constants";
import { frDateToIso } from "@/lib/finance";

// « TERMINÉ » retiré : une prestation terminée passe par la clôture et part dans l'Historique.
const STATUTS = ["Tous", "À affecter", "EMAIL ENVOYÉ", "CONFIRMÉ", "EN ATTENTE PRESTA", "PRESTATAIRE REFUSÉ – À RÉAFFECTER", "ANNULÉ"];

// ?statut=… (lien profond depuis l'accueil) → valeur de STATUTS. Accepte la valeur
// exacte ou une forme « naturelle » sans accents/majuscules : a-affecter, confirme,
// a-reaffecter / refuse, en-attente, annule…
const normStatut = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const STATUT_ALIAS: Record<string, string> = {
  reaffecter: "PRESTATAIRE REFUSÉ – À RÉAFFECTER", areaffecter: "PRESTATAIRE REFUSÉ – À RÉAFFECTER",
  refuse: "PRESTATAIRE REFUSÉ – À RÉAFFECTER", prestatairerefuse: "PRESTATAIRE REFUSÉ – À RÉAFFECTER",
  affecter: "À affecter", enattente: "EN ATTENTE PRESTA",
};
function statutDepuisUrl(v: string | null): string | null {
  if (!v) return null;
  const n = normStatut(v);
  return STATUTS.find(s => normStatut(s) === n) ?? STATUT_ALIAS[n] ?? null;
}

// Vues de l'agenda : cette page sert de vue « Liste ». Jour / Sem. / Mois renvoient
// vers /agenda en pré-enregistrant la vue choisie (même clé localStorage que l'agenda).
const AGENDA_VIEW_KEY = "agenda:viewMode";
const VUES_AGENDA = [
  { v: "day",   label: "Jour" },
  { v: "week",  label: "Sem." },
  { v: "month", label: "Mois" },
] as const;

// Tris proposés
const TRIS = [
  { value: "date_asc",  label: "Intervention ↑ (plus proche)" },
  { value: "date_desc", label: "Intervention ↓ (plus lointaine)" },
  { value: "creation",  label: "Création récente" },
] as const;
type Tri = typeof TRIS[number]["value"];

export default function PrestationsPage() {
  const router = useRouter();
  const [data, setData]                   = useState<Prestation[]>(() => cacheGet<Prestation[]>(CACHE_KEYS.prestations) ?? []);
  const [prestataires, setPrestataires]   = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);
  const [loading, setLoading]             = useState(() => !cacheHas(CACHE_KEYS.prestations));
  const [error, setError]                 = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [ficheClientId, setFicheClientId] = useState<string | null>(null);
  const [statut, setStatut]               = useState("Tous");
  const [editing, setEditing]             = useState<Prestation | null>(null);
  const [clotureCible, setClotureCible]   = useState<Prestation | null>(null); // RDV à clôturer (ClotureModal)
  const [deleteModal, setDeleteModal]     = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [importing, setImporting]         = useState(false);
  const [tri, setTri]                     = useState<Tri>("date_asc");
  const [showNew, setShowNew]             = useState(false);
  // Présélection du filtre statut depuis l'URL (?statut=…). Lu dans un effet
  // (côté client) — pas de useSearchParams, donc pas de Suspense requis.
  useEffect(() => {
    const st = statutDepuisUrl(new URLSearchParams(window.location.search).get("statut"));
    if (st) setStatut(st);
  }, []);
  const toast = useToast();

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

  // Import manuel des demandes de devis reçues par email (formulaire du site).
  const importDemandes = useCallback(async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/cron/inbox");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Import impossible");
      if (d.crees > 0) { toast.success(`${d.crees} nouvelle(s) demande(s) importée(s)`); await load(); }
      else toast.success("Aucune nouvelle demande à importer");
      if (d.erreurs?.length) toast.error(`${d.erreurs.length} email(s) non importé(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import impossible");
    } finally {
      setImporting(false);
    }
  }, [load, toast]);


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

  // Ouvre la modale de clôture unique pour une prestation de la liste.
  const ouvrirCloture = (id: string) => {
    const p = data.find(x => x.row === id);
    if (p) setClotureCible(p);
  };
  // Après clôture : retire la ligne tout de suite, puis recharge.
  const handleClotured = (ids: string[]) => {
    setData(prev => prev.filter(p => !ids.includes(p.row)));
    load();
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
    // Tri (les prestations sans date restent en fin de liste pour les tris par date)
    const sorted = [...list];
    if (tri === "creation") {
      sorted.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    } else {
      const sens = tri === "date_asc" ? 1 : -1;
      sorted.sort((a, b) => {
        const da = frDateToIso(a.date), db = frDateToIso(b.date);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return sens * ((da + (a.heure || "")).localeCompare(db + (b.heure || "")));
      });
    }
    return sorted;
  }, [data, search, statut, tri]);

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Prestations"
        subtitle={`${filtered.length} prestation${filtered.length > 1 ? "s" : ""}`}
        onRefresh={load}
        loading={loading}
        action={
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Mobile : icônes seules (texte à partir de sm) */}
            <button
              onClick={() => setShowNew(true)}
              title="Nouvelle prestation (nouveau client)"
              aria-label="Nouvelle prestation"
              className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Nouveau</span>
            </button>
            <button
              onClick={importDemandes}
              disabled={importing}
              title="Importer les demandes de devis reçues par email (formulaire du site)"
              aria-label="Importer les demandes"
              className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Inbox size={16} />}
              <span className="hidden sm:inline">Importer les demandes</span>
            </button>
            <button
              onClick={exportCSV}
              title="Export CSV"
              aria-label="Export CSV"
              className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        }
      />
      {/* Barre « vue de l'agenda » : retour Agenda + même sélecteur Jour / Sem. / Mois / Liste */}
      <div className="bg-white border-b border-gray-200 px-2 sm:px-4 py-2 flex items-center gap-2">
        <Link href="/agenda"
          className="h-9 px-2 flex items-center gap-1 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors">
          <ChevronLeft size={18} /> Agenda
        </Link>
        <div className="ml-auto flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium shrink-0">
          {VUES_AGENDA.map(({ v, label }, i) => (
            <button key={v}
              onClick={() => { try { localStorage.setItem(AGENDA_VIEW_KEY, v); } catch { /* stockage indisponible */ } router.push("/agenda"); }}
              className={`h-9 px-2 sm:px-3 bg-white text-gray-600 hover:bg-gray-50 transition-colors ${i > 0 ? "border-l border-gray-200" : ""}`}>
              {label}
            </button>
          ))}
          <span aria-current="page" className="h-9 px-2 sm:px-3 border-l border-gray-200 flex items-center bg-blue-600 text-white">Liste</span>
        </div>
      </div>
      <div className="flex-1 p-3 sm:p-6 space-y-3 sm:space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* Filtres */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 flex flex-wrap gap-2 sm:gap-3 items-center">
          <div className="relative flex-1 min-w-full sm:min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher client, prestation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
            <Filter size={15} className="text-gray-400 flex-shrink-0" />
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
              aria-label="Filtrer par statut"
              className="w-full sm:w-auto min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {STATUTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
            <ArrowUpDown size={15} className="text-gray-400 flex-shrink-0" />
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value as Tri)}
              aria-label="Trier"
              className="w-full sm:w-auto min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {TRIS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="md:bg-white md:rounded-2xl md:border md:border-gray-100 md:shadow-sm md:p-5">
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
              onArchive={(id) => ouvrirCloture(id)}
              onDelete={(id, label) => setDeleteModal({ id, label })}
              onClientClick={setFicheClientId}
            />
          )}
        </div>
      </div>

      {showNew && (
        <NewClientModal
          prestataires={prestataires}
          onClose={() => setShowNew(false)}
          onSaved={() => load()} // la fenêtre reste ouverte sur son écran de succès
        />
      )}

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
          onArchive={(id) => {
            setEditing(null);
            ouvrirCloture(id);
          }}
          onClotured={handleClotured}
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

      {/* Clôture (archivage) — modale unique partagée */}
      {clotureCible && (
        <ClotureModal
          prestation={clotureCible}
          onClose={() => setClotureCible(null)}
          onDone={handleClotured}
        />
      )}
    </div>
  );
}
