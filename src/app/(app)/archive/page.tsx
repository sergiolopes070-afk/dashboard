"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Archive, Phone, Mail, MapPin, User, Wrench, Calendar,
  Clock, Euro, FileText, MessageSquare, Search, Tag, RefreshCw,
  Star, X, CheckCircle2, ExternalLink, Trash2,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import NewClientModal from "@/components/NewClientModal";
import { Prestation, Prestataire } from "@/lib/constants";

// ─── Étoiles ────────────────────────────────────────────────────────────────

function StarRating({ value, onChange, size = 16 }: { value?: number; onChange?: (v: number) => void; size?: number }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <button
          key={i}
          onClick={() => onChange?.(i)}
          onMouseEnter={() => onChange ? setHovered(i) : undefined}
          onMouseLeave={() => onChange ? setHovered(0) : undefined}
          className={onChange ? "transition-transform hover:scale-110" : "cursor-default"}
          disabled={!onChange}
        >
          <Star
            size={size}
            className={`${(hovered || value || 0) >= i ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Modal compte rendu ──────────────────────────────────────────────────────

function CompteRenduModal({
  p, onClose, onReprogrammer, onDelete,
}: {
  p: Prestation;
  onClose: () => void;
  onReprogrammer: (p: Prestation) => void;
  onDelete: (id: string) => void;
}) {
  const LS_KEY = `satisfaction_${p.row}`;
  const [satisfaction, setSatisfaction] = useState<number | undefined>(() => {
    // Priorité : DB → localStorage
    if (p.satisfaction) return p.satisfaction;
    const stored = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    return stored ? Number(stored) : undefined;
  });
  const [savingSat, setSavingSat] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const saveSatisfaction = async (v: number) => {
    setSatisfaction(v);
    // Sauvegarde locale immédiate (persiste même si la colonne DB n'existe pas encore)
    localStorage.setItem(LS_KEY, String(v));
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header modal ────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-5 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-lg">
                {(p.prenom?.[0] ?? "?").toUpperCase()}{(p.nom?.[0] ?? "").toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">
                {p.prenom} {p.nom}
              </h2>
              <p className="text-emerald-100 text-sm mt-0.5">{p.typePresta}</p>
              {dateLabel && (
                <p className="text-emerald-200 text-xs mt-1 flex items-center gap-1">
                  <Calendar size={11} />
                  {dateLabel}{p.heure ? ` à ${p.heure}` : ""}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Badges statut ───────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50 flex-wrap">
          {!isNaN(prix) && prix > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
              <Euro size={13} />{prix.toFixed(2)} €
            </span>
          )}
          {p.archiveReason ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              <Tag size={11} />{p.archiveReason}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
              <CheckCircle2 size={11} />Terminée
            </span>
          )}
          {p.prestataire && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
              <User size={11} />{p.prestataire}
            </span>
          )}
        </div>

        {/* ── Corps scrollable ─────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Client */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <User size={11} /> Informations client
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Nom complet</p>
                <p className="font-semibold text-gray-800">{p.prenom} {p.nom}</p>
              </div>
              {p.tel && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Téléphone</p>
                  <a href={`tel:${p.tel}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
                    <Phone size={13} />{p.tel}
                  </a>
                </div>
              )}
              {p.email && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Email</p>
                  <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline break-all">
                    <Mail size={13} />{p.email}
                  </a>
                </div>
              )}
              {p.adresse && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Adresse</p>
                  <p className="flex items-start gap-1.5 text-sm text-gray-700">
                    <MapPin size={13} className="mt-0.5 shrink-0 text-gray-400" />{p.adresse}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Prestation */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Wrench size={11} /> Détails de la prestation
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Type</p>
                <p className="font-semibold text-gray-800">{p.typePresta || "—"}</p>
              </div>
              {p.quantite && p.quantite !== "1" && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Quantité</p>
                  <p className="text-sm text-gray-700">{p.quantite}</p>
                </div>
              )}
              {dateLabel && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Date d&apos;intervention</p>
                  <p className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Calendar size={13} className="text-gray-400" />
                    {dateLabel}
                  </p>
                </div>
              )}
              {p.heure && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Heure</p>
                  <p className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Clock size={13} className="text-gray-400" />{p.heure}
                  </p>
                </div>
              )}
              {!isNaN(prix) && prix > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Prix</p>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                    <Euro size={13} />{prix.toFixed(2)} €
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Prestataire */}
          {p.prestataire && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <User size={11} /> Prestataire
              </h3>
              <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Nom</p>
                  <p className="font-semibold text-gray-800">{p.prestataire}</p>
                </div>
                {p.emailPresta && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Email</p>
                    <a href={`mailto:${p.emailPresta}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline break-all">
                      <Mail size={13} />{p.emailPresta}
                    </a>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Notes */}
          {(p.message || p.commentaire) && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <MessageSquare size={11} /> Notes & commentaires
              </h3>
              <div className="space-y-2">
                {p.message && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-medium text-blue-500 mb-1">Message client</p>
                    <p className="text-sm text-blue-800 italic">&quot;{p.message}&quot;</p>
                  </div>
                )}
                {p.commentaire && (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-medium text-gray-400 mb-1">Commentaire interne</p>
                    <p className="text-sm text-gray-700">{p.commentaire}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Satisfaction */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Star size={11} /> Satisfaction client
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
              <StarRating value={satisfaction} onChange={saveSatisfaction} size={22} />
              {savingSat && <span className="text-xs text-gray-400">Enregistrement…</span>}
              {!satisfaction && !savingSat && (
                <span className="text-xs text-gray-400">Cliquez pour noter</span>
              )}
              {satisfaction && !savingSat && (
                <span className="text-xs text-gray-500">{satisfaction}/5 étoile{satisfaction > 1 ? "s" : ""}</span>
              )}
            </div>
          </section>

          {/* Archivage */}
          {p.archiveReason && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Archive size={11} /> Raison d&apos;archivage
              </h3>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-800">{p.archiveReason}</p>
              </div>
            </section>
          )}

        </div>

        {/* ── Footer actions ───────────────────────────────────────────── */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 space-y-2">
          {/* Confirmation suppression */}
          {confirmDel && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              <p className="text-xs text-red-700 font-medium">Supprimer définitivement cet enregistrement ?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onDelete(p.row); onClose(); }}
                  className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
                >
                  Supprimer
                </button>
                <button
                  onClick={() => setConfirmDel(false)}
                  className="px-3 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(p.devisPDF || p.genDevis === "FAIT") && (
                <a
                  href={p.devisPDF || `/api/devis/${p.row}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-white transition-colors"
                >
                  <FileText size={14} /> Voir le devis
                </a>
              )}
              <button
                onClick={() => setConfirmDel(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} /> Supprimer
              </button>
            </div>
            <div className="flex items-center gap-2">
              {p.tel && (
                <a
                  href={`https://wa.me/${p.tel.replace(/\s/g, "").replace(/^0/, "33")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-green-200 text-sm text-green-700 hover:bg-green-50 transition-colors"
                >
                  <ExternalLink size={14} /> WhatsApp
                </a>
              )}
              <button
                onClick={() => { onClose(); onReprogrammer(p); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <RefreshCw size={14} /> Reprogrammer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Carte archive (cliquable) ───────────────────────────────────────────────

function CarteArchive({ p, onClick, onDelete }: { p: Prestation; onClick: () => void; onDelete: (id: string) => void }) {
  const [satisfaction] = useState<number | undefined>(() => {
    if (p.satisfaction) return p.satisfaction;
    const stored = typeof window !== "undefined" ? localStorage.getItem(`satisfaction_${p.row}`) : null;
    return stored ? Number(stored) : undefined;
  });
  const [confirmDel, setConfirmDel] = useState(false);

  const dateLabel = (() => {
    if (!p.date) return null;
    const parts = p.date.split("/");
    if (parts.length !== 3) return p.date;
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  })();

  const prix = parseFloat(p.prix);

  return (
    <div className="relative w-full bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group">
      {/* Bouton supprimer */}
      <div className="absolute top-3 right-3 z-10" onClick={e => e.stopPropagation()}>
        {confirmDel ? (
          <span className="inline-flex items-center gap-1">
            <button
              onClick={() => onDelete(p.row)}
              className="px-2 py-0.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              Confirmer
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-gray-200 transition-colors"
            >
              Annuler
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all"
            title="Supprimer cette entrée"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <button
        onClick={onClick}
        className="w-full text-left"
      >
      <div className="flex items-center gap-4 px-5 py-4 pr-16">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
          <span className="text-emerald-700 font-bold text-sm">
            {(p.prenom?.[0] ?? "?").toUpperCase()}{(p.nom?.[0] ?? "").toUpperCase()}
          </span>
        </div>

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{p.prenom} {p.nom}</p>
          <p className="text-xs text-gray-500 truncate">{p.typePresta}</p>
        </div>

        {/* Date */}
        {dateLabel && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
            <Calendar size={12} />
            {dateLabel}{p.heure ? ` · ${p.heure}` : ""}
          </div>
        )}

        {/* Satisfaction mini */}
        <div className="hidden sm:flex items-center gap-0.5 shrink-0">
          {[1,2,3,4,5].map(i => (
            <Star key={i} size={11} className={(satisfaction ?? 0) >= i ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
          ))}
        </div>

        {/* Prix + badge */}
        <div className="flex items-center gap-2 shrink-0">
          {!isNaN(prix) && prix > 0 && (
            <span className="font-bold text-emerald-700 text-sm">{prix.toFixed(0)} €</span>
          )}
          {p.archiveReason ? (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
              <Tag size={10} />{p.archiveReason.split(" — ")[0]}
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              <CheckCircle2 size={10} />Terminée
            </span>
          )}
        </div>

        {/* Indicateur cliquable */}
        <div className="text-gray-300 group-hover:text-emerald-500 transition-colors shrink-0">
          <ExternalLink size={14} />
        </div>
      </div>
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ArchivePage() {
  const [data, setData]                 = useState<Prestation[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [error, setError]               = useState<string | null>(null);
  const [selected, setSelected]         = useState<Prestation | null>(null);
  const [reprogrammer, setReprogrammer] = useState<Prestation | null>(null);

  const handleDelete = async (id: string) => {
    await fetch("/api/archive", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setData(prev => prev.filter(p => p.row !== id));
  };

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
          <div className="space-y-2">
            {filtered.map((p) => (
              <CarteArchive key={p.row} p={p} onClick={() => setSelected(p)} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* Modal compte rendu */}
      {selected && (
        <CompteRenduModal
          p={selected}
          onClose={() => setSelected(null)}
          onReprogrammer={(p) => { setReprogrammer(p); }}
          onDelete={(id) => { handleDelete(id); setSelected(null); }}
        />
      )}

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
