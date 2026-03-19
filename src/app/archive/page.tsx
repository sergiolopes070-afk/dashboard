"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Archive, Phone, Mail, MapPin, User, Wrench, Calendar,
  Clock, Euro, FileText, MessageSquare, Search, ChevronDown, ChevronUp, Tag, RefreshCw, Star,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import NewClientModal from "@/components/NewClientModal";
import { Prestation, Prestataire } from "@/lib/constants";

// ─── Fiche archivée ──────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <button
          key={i}
          onClick={() => onChange(i)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            size={16}
            className={`${(hovered || value || 0) >= i ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
          />
        </button>
      ))}
    </div>
  );
}

function FicheArchive({ p, onReprogrammer }: { p: Prestation; onReprogrammer: (p: Prestation) => void }) {
  const [open, setOpen] = useState(false);
  const [satisfaction, setSatisfaction] = useState(p.satisfaction);
  const [savingSat, setSavingSat] = useState(false);

  const saveSatisfaction = async (v: number) => {
    setSatisfaction(v);
    setSavingSat(true);
    try {
      await fetch("/api/prestations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: p.row, updates: { satisfaction: String(v) } }),
      });
    } finally {
      setSavingSat(false);
    }
  };

  const dateLabel = (() => {
    if (!p.date) return null;
    const parts = p.date.split("/");
    if (parts.length !== 3) return p.date;
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  })();

  const prix = parseFloat(p.prix);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* ── Header fiche ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4">
        {/* Identité client */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <span className="text-emerald-700 font-bold text-sm">
              {(p.prenom?.[0] ?? "?").toUpperCase()}{(p.nom?.[0] ?? "").toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {p.prenom} {p.nom}
            </p>
            <p className="text-xs text-gray-400 truncate">{p.typePresta}</p>
          </div>
        </div>

        {/* Métadonnées rapides */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500 shrink-0 mx-4">
          {dateLabel && (
            <span className="flex items-center gap-1">
              <Calendar size={12} className="text-gray-400" />
              {dateLabel}
            </span>
          )}
          {p.heure && (
            <span className="flex items-center gap-1">
              <Clock size={12} className="text-gray-400" />
              {p.heure}
            </span>
          )}
        </div>

        {/* Satisfaction + reprogrammer */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <StarRating value={satisfaction} onChange={saveSatisfaction} />
          {savingSat && <span className="text-xs text-gray-400">…</span>}
          <button
            onClick={(e) => { e.stopPropagation(); onReprogrammer(p); }}
            title="Reprogrammer cette prestation"
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <RefreshCw size={11} />
            Reprogram.
          </button>
        </div>

        {/* Prix + badge terminé + toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {!isNaN(prix) && prix > 0 && (
            <span className="font-bold text-emerald-700 text-sm">
              {prix.toFixed(0)} €
            </span>
          )}
          {p.archiveReason ? (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
              <Tag size={10} />
              {p.archiveReason}
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              <Archive size={10} />
              Terminée
            </span>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
            aria-label={open ? "Réduire" : "Voir la fiche complète"}
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* ── Fiche détaillée (dépliable) ──────────────────────────── */}
      {open && (
        <div className="border-t border-gray-50 px-5 pb-5 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Bloc client */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <User size={11} /> Client
            </p>
            <div className="space-y-1.5">
              <p className="font-semibold text-gray-800 text-sm">{p.prenom} {p.nom}</p>
              {p.tel && (
                <a href={`tel:${p.tel}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600">
                  <Phone size={11} className="text-gray-400" />{p.tel}
                </a>
              )}
              {p.email && (
                <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600 break-all">
                  <Mail size={11} className="text-gray-400" />{p.email}
                </a>
              )}
              {(p.adresse) && (
                <p className="flex items-start gap-1.5 text-xs text-gray-600">
                  <MapPin size={11} className="text-gray-400 mt-0.5 shrink-0" />{p.adresse}
                </p>
              )}
            </div>
          </div>

          {/* Bloc prestation */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <Wrench size={11} /> Prestation
            </p>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-800">{p.typePresta || "—"}</p>
              {p.quantite && p.quantite !== "1" && (
                <p className="text-xs text-gray-500">Quantité : {p.quantite}</p>
              )}
              {dateLabel && (
                <p className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Calendar size={11} className="text-gray-400" />{dateLabel}{p.heure ? ` à ${p.heure}` : ""}
                </p>
              )}
              {p.adresse && (
                <p className="flex items-start gap-1.5 text-xs text-gray-600">
                  <MapPin size={11} className="text-gray-400 mt-0.5 shrink-0" />{p.adresse}
                </p>
              )}
              {!isNaN(prix) && prix > 0 && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <Euro size={11} />{prix.toFixed(2)} €
                </p>
              )}
            </div>
          </div>

          {/* Bloc prestataire + notes */}
          <div className="space-y-2">
            {p.prestataire && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <User size={11} /> Prestataire
                </p>
                <div className="space-y-1.5">
                  <p className="text-sm text-gray-800">{p.prestataire}</p>
                  {p.emailPresta && (
                    <a href={`mailto:${p.emailPresta}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600 break-all">
                      <Mail size={11} className="text-gray-400" />{p.emailPresta}
                    </a>
                  )}
                </div>
              </>
            )}
            {(p.message || p.commentaire) && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                  <MessageSquare size={11} /> Notes
                </p>
                {p.message && <p className="text-xs text-gray-600 italic">&quot;{p.message}&quot;</p>}
                {p.commentaire && <p className="text-xs text-gray-500 mt-1">{p.commentaire}</p>}
              </div>
            )}
            {p.archiveReason && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                  <Tag size={11} /> Raison archivage
                </p>
                <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">{p.archiveReason}</p>
              </div>
            )}
            {(p.devisPDF || p.genDevis === "FAIT") && (
              <a
                href={p.devisPDF || `/api/devis/${p.row}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"
              >
                <FileText size={11} /> Voir le devis
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ArchivePage() {
  const [data, setData]         = useState<Prestation[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [reprogrammer, setReprogrammer] = useState<Prestation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [archiveRes, prestataireRes] = await Promise.all([
        fetch(`/api/archive?t=${Date.now()}`, { cache: "no-store" }),
        fetch("/api/prestataires"),
      ]);
      if (!archiveRes.ok) throw new Error((await archiveRes.json()).error);
      const raw: Prestation[] = await archiveRes.json();
      setData([...raw].reverse());
      if (prestataireRes.ok) setPrestataires(await prestataireRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCA = useMemo(
    () => data.reduce((sum, p) => sum + (parseFloat(p.prix) || 0), 0),
    [data]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((p) =>
      [p.nom, p.prenom, p.tel, p.email, p.typePresta, p.prestataire]
        .join(" ").toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Historique"
        subtitle={`${data.length} prestation${data.length > 1 ? "s" : ""} terminée${data.length > 1 ? "s" : ""} · CA : ${totalCA.toFixed(0)} €`}
        onRefresh={load}
        loading={loading}
      />
      <div className="flex-1 p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* Barre de recherche */}
        {data.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un client, prestation, prestataire…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
          </div>
        )}

        {/* Stats rapides */}
        {data.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{data.length}</p>
              <p className="text-xs text-gray-400 mt-1">Prestations terminées</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{totalCA.toFixed(0)} €</p>
              <p className="text-xs text-gray-400 mt-1">CA généré</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center col-span-2 sm:col-span-1">
              <p className="text-2xl font-bold text-emerald-700">
                {new Set(data.map((p) => p.email || `${p.nom}-${p.prenom}`).filter(Boolean)).size}
              </p>
              <p className="text-xs text-gray-400 mt-1">Clients uniques</p>
            </div>
          </div>
        )}

        {/* Liste fiches */}
        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
            <Archive size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">
              {data.length === 0 ? "Aucune prestation archivée" : "Aucun résultat"}
            </p>
            <p className="text-sm mt-1">
              {data.length === 0
                ? "Quand une prestation est marquée « TERMINÉ », elle apparaît automatiquement ici."
                : "Essayez un autre terme de recherche."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <FicheArchive key={p.row} p={p} onReprogrammer={setReprogrammer} />
            ))}
          </div>
        )}
      </div>

      {/* Modal reprogrammer */}
      {reprogrammer && (
        <NewClientModal
          prestataires={prestataires}
          initialValues={{
            prenom     : reprogrammer.prenom,
            nom        : reprogrammer.nom,
            tel        : reprogrammer.tel,
            email      : reprogrammer.email,
            adresse    : reprogrammer.adresse,
            typePresta : reprogrammer.typePresta,
            quantite   : reprogrammer.quantite,
            prix       : reprogrammer.prix,
            prestataire: reprogrammer.prestataire,
          }}
          onClose={() => setReprogrammer(null)}
          onSaved={() => setReprogrammer(null)}
        />
      )}
    </div>
  );
}
