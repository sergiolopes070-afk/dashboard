"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Archive, Phone, Mail, MapPin, User, Wrench, Calendar,
  Clock, Euro, FileText, MessageSquare, Search, RefreshCw,
  Star, X, CheckCircle2, ExternalLink, Trash2, CreditCard, Filter, XCircle, UserCircle2,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { SkeletonCards } from "@/components/Skeleton";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import NewClientModal from "@/components/NewClientModal";
import { ClientFicheById } from "@/components/ClientFiche";
import { Prestation, Prestataire, estAnnulation, PAIEMENTS_CLOTURE } from "@/lib/constants";
import { caRealise, estRealisee, prixPresta, formatMontant } from "@/lib/finance";

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

// ─── Badge motif (vert = terminée, orange/rouge = annulation) ───────────────

function MotifBadge({ p, size = "sm" }: { p: Prestation; size?: "sm" | "md" }) {
  const annul = estAnnulation(p.archiveReason);
  const pad = size === "md" ? "px-3 py-1.5" : "px-2 py-1";
  const ic = size === "md" ? 11 : 10;
  if (annul) {
    return (
      <span className={`inline-flex items-center gap-1 ${pad} rounded-full bg-orange-100 text-red-700 text-xs font-medium`}>
        <XCircle size={ic} />{size === "md" ? p.archiveReason : (p.archiveReason || "").split(" — ")[0]}
      </span>
    );
  }
  const label = p.archiveReason ? (size === "md" ? p.archiveReason : p.archiveReason.split(" — ")[0]) : "Terminée";
  return (
    <span className={`inline-flex items-center gap-1 ${pad} rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium`}>
      <CheckCircle2 size={ic} />{label}
    </span>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4"
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
              <Euro size={13} />{formatMontant(prix, { decimales: 2 })}
            </span>
          )}
          {p.modePaiement && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
              <CreditCard size={11} />{p.modePaiement}
            </span>
          )}
          <MotifBadge p={p} size="md" />
          {p.prestataire && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
              <User size={11} />{p.prestataire}
            </span>
          )}
        </div>

        {/* ── Corps scrollable ─────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-5">

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
                    <Euro size={13} />{formatMontant(prix, { decimales: 2 })}
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
              <div className={`rounded-xl px-4 py-3 border ${estAnnulation(p.archiveReason) ? "bg-orange-50 border-orange-100" : "bg-emerald-50 border-emerald-100"}`}>
                <p className={`text-sm ${estAnnulation(p.archiveReason) ? "text-red-800" : "text-emerald-800"}`}>{p.archiveReason}</p>
              </div>
            </section>
          )}

        </div>

        {/* ── Footer actions ───────────────────────────────────────────── */}
        <div className="border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 space-y-2">
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

          <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
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
                  href={`https://wa.me/${p.tel.replace(/\D/g, "").replace(/^0/, "33")}`}
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

function CarteArchive({ p, onClick, onDelete, onClientClick }: { p: Prestation; onClick: () => void; onDelete: (id: string) => void; onClientClick?: (clientId: string) => void }) {
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
  const annul = estAnnulation(p.archiveReason);

  return (
    <div className={`relative w-full bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all group ${annul ? "border-orange-100 hover:border-orange-200" : "border-gray-100 hover:border-emerald-200"}`}>
      <button
        onClick={onClick}
        className="w-full text-left"
      >
      <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-5 pt-3 sm:pt-4 pb-1 sm:pb-2">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${annul ? "bg-orange-100 group-hover:bg-orange-200" : "bg-emerald-100 group-hover:bg-emerald-200"}`}>
          <span className={`font-bold text-sm ${annul ? "text-orange-700" : "text-emerald-700"}`}>
            {(p.prenom?.[0] ?? "?").toUpperCase()}{(p.nom?.[0] ?? "").toUpperCase()}
          </span>
        </div>

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{p.prenom} {p.nom}</p>
          <p className="text-xs text-gray-500 truncate">{p.typePresta}</p>
        </div>

        {/* Date (desktop) */}
        {dateLabel && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
            <Calendar size={12} />
            {dateLabel}{p.heure ? ` · ${p.heure}` : ""}
          </div>
        )}

        {/* Prix */}
        {!isNaN(prix) && prix > 0 && (
          <span className={`font-bold text-sm shrink-0 ${annul ? "text-gray-400 line-through" : "text-emerald-700"}`}>{formatMontant(prix)}</span>
        )}
      </div>

      {/* Badges (visibles aussi sur mobile) */}
      <div className="flex items-center gap-1.5 flex-wrap px-3 sm:px-5 pb-2 sm:pl-[76px]">
        {dateLabel && (
          <span className="sm:hidden inline-flex items-center gap-1 text-xs text-gray-500">
            <Calendar size={11} />{dateLabel}{p.heure ? ` · ${p.heure}` : ""}
          </span>
        )}
        <MotifBadge p={p} />
        {p.modePaiement && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
            <CreditCard size={10} />{p.modePaiement}
          </span>
        )}
        {(satisfaction ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5">
            {[1,2,3,4,5].map(i => (
              <Star key={i} size={11} className={(satisfaction ?? 0) >= i ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
            ))}
          </span>
        )}
      </div>
      </button>

      {/* Actions (toujours visibles, suppression avec confirmation) */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 pb-3 sm:pl-[76px]">
        {onClientClick && p.clientId ? (
          <button
            onClick={() => onClientClick(p.clientId)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-700 text-xs font-medium hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 transition-colors"
          >
            <UserCircle2 size={14} /> Fiche client
          </button>
        ) : <span />}
        {confirmDel ? (
          <span className="inline-flex items-center gap-1.5">
            <button
              onClick={() => onDelete(p.row)}
              className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              Confirmer
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-gray-200 transition-colors"
            >
              Annuler
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="p-2 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 active:bg-red-50 transition-colors"
            title="Supprimer cette entrée"
            aria-label="Supprimer cette entrée"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ArchivePage() {
  const [data, setData]                 = useState<Prestation[]>(() => cacheGet<Prestation[]>(CACHE_KEYS.archive) ?? []);
  const [prestataires, setPrestataires] = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);
  const [loading, setLoading]           = useState(() => !cacheHas(CACHE_KEYS.archive));
  const [search, setSearch]             = useState("");
  const [filterPaiement, setFilterPaiement] = useState("");
  const [filterPeriode, setFilterPeriode]   = useState("");
  const [error, setError]               = useState<string | null>(null);
  const [selected, setSelected]         = useState<Prestation | null>(null);
  const [reprogrammer, setReprogrammer] = useState<Prestation | null>(null);
  const [filterIssue, setFilterIssue]   = useState<"toutes" | "terminees" | "annulees">("toutes");
  const [ficheClientId, setFicheClientId] = useState<string | null>(null);

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
      const reversed = [...raw].reverse();
      setData(reversed); cacheSet(CACHE_KEYS.archive, reversed);
      if (prestataireRes.ok) { const d = await prestataireRes.json(); setPrestataires(d); cacheSet(CACHE_KEYS.prestataires, d); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // CA = prestations réalisées uniquement (les annulations restent listées mais ne comptent pas) — lib/finance.ts
  const totalCA = useMemo(() => caRealise(data), [data]);
  const nbRealisees = useMemo(() => data.filter(estRealisee).length, [data]);

  // Périodes disponibles (ex: "04/2026")
  const periodes = useMemo(() => {
    const set = new Set<string>();
    data.forEach(p => {
      if (!p.date) return;
      const parts = p.date.split("/");
      if (parts.length === 3) set.add(`${parts[1]}/${parts[2]}`);
    });
    return Array.from(set).sort().reverse();
  }, [data]);

  // CA par mode de paiement
  const caParPaiement = useMemo(() => {
    const map: Record<string, number> = {};
    data.filter(estRealisee).forEach(p => {
      const mode = p.modePaiement || "Non renseigné";
      map[mode] = (map[mode] || 0) + prixPresta(p);
    });
    return map;
  }, [data]);

  const filtered = useMemo(() => {
    let list = data;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        [p.nom, p.prenom, p.tel, p.email, p.typePresta, p.prestataire]
          .join(" ").toLowerCase().includes(q)
      );
    }
    if (filterIssue === "terminees") list = list.filter(p => !estAnnulation(p.archiveReason));
    else if (filterIssue === "annulees") list = list.filter(p => estAnnulation(p.archiveReason));
    if (filterPaiement) {
      list = list.filter(p => (p.modePaiement || "Non renseigné") === filterPaiement);
    }
    if (filterPeriode) {
      list = list.filter(p => {
        if (!p.date) return false;
        const parts = p.date.split("/");
        return parts.length === 3 && `${parts[1]}/${parts[2]}` === filterPeriode;
      });
    }
    return list;
  }, [data, search, filterPaiement, filterPeriode, filterIssue]);
  const nbAnnulFiltre = useMemo(() => filtered.filter(p => !estRealisee(p)).length, [filtered]);

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Historique"
        subtitle={`${nbRealisees} prestation${nbRealisees > 1 ? "s" : ""} terminée${nbRealisees > 1 ? "s" : ""}${data.length > nbRealisees ? ` (+ ${data.length - nbRealisees} annulée${data.length - nbRealisees > 1 ? "s" : ""})` : ""} · CA : ${formatMontant(totalCA)}`}
        onRefresh={load}
        loading={loading}
      />
      <div className="flex-1 p-3 sm:p-6 space-y-3 sm:space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* Barre de recherche + filtres */}
        {data.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 flex flex-wrap gap-2 sm:gap-3 items-center">
            <div className="relative flex-1 min-w-full sm:min-w-[180px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un client, prestation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            {/* Issue : terminées / annulées / toutes */}
            <div className="flex w-full sm:w-auto rounded-xl border border-gray-200 p-0.5 bg-gray-50 text-sm" role="group" aria-label="Filtrer par issue">
              {([
                { v: "toutes",    l: "Toutes" },
                { v: "terminees", l: "Terminées" },
                { v: "annulees",  l: "Annulées" },
              ] as const).map(o => (
                <button
                  key={o.v}
                  onClick={() => setFilterIssue(o.v)}
                  aria-pressed={filterIssue === o.v}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    filterIssue === o.v
                      ? o.v === "annulees" ? "bg-orange-500 text-white" : o.v === "terminees" ? "bg-emerald-600 text-white" : "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
              <CreditCard size={14} className="text-gray-400 flex-shrink-0" />
              <select
                value={filterPaiement}
                onChange={(e) => setFilterPaiement(e.target.value)}
                aria-label="Filtrer par mode de paiement"
                className="w-full sm:w-auto min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                <option value="">Tous les paiements</option>
                {[...PAIEMENTS_CLOTURE, "Non renseigné"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
              <Filter size={14} className="text-gray-400 flex-shrink-0" />
              <select
                value={filterPeriode}
                onChange={(e) => setFilterPeriode(e.target.value)}
                aria-label="Filtrer par période"
                className="w-full sm:w-auto min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                <option value="">Toutes les périodes</option>
                {periodes.map(p => (
                  <option key={p} value={p}>{p.replace("/", " / ")}</option>
                ))}
              </select>
            </div>
            {(filterPaiement || filterPeriode || search || filterIssue !== "toutes") && (
              <button
                onClick={() => { setSearch(""); setFilterPaiement(""); setFilterPeriode(""); setFilterIssue("toutes"); }}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X size={12} /> Réinitialiser
              </button>
            )}
          </div>
        )}

        {/* Stats rapides */}
        {data.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">{filtered.length - nbAnnulFiltre}</p>
                <p className="text-xs text-gray-400 mt-1">Prestations réalisées{nbAnnulFiltre > 0 ? ` (+ ${nbAnnulFiltre} annulée${nbAnnulFiltre > 1 ? "s" : ""})` : ""}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">
                  {formatMontant(caRealise(filtered))}
                </p>
                <p className="text-xs text-gray-400 mt-1">CA {filterPeriode ? filterPeriode.replace("/", " / ") : "total"}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center col-span-2 sm:col-span-1">
                <p className="text-2xl font-bold text-emerald-700">
                  {new Set(filtered.map((p) => p.email || `${p.nom}-${p.prenom}`).filter(Boolean)).size}
                </p>
                <p className="text-xs text-gray-400 mt-1">Clients uniques</p>
              </div>
            </div>
            {/* CA par mode de paiement */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <CreditCard size={12} /> Répartition par mode de paiement
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(caParPaiement).sort((a, b) => b[1] - a[1]).map(([mode, ca]) => (
                  <button
                    key={mode}
                    onClick={() => setFilterPaiement(filterPaiement === mode ? "" : mode)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors ${
                      filterPaiement === mode
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-300"
                    }`}
                  >
                    <span className="font-medium">{mode}</span>
                    <span className={`font-bold ${filterPaiement === mode ? "text-white" : "text-emerald-700"}`}>
                      {formatMontant(ca)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Liste fiches */}
        {loading && data.length === 0 ? (
          <SkeletonCards count={6} />
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
            <Archive size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">
              {data.length === 0 ? "Aucune prestation archivée" : "Aucun résultat"}
            </p>
            <p className="text-sm mt-1">
              {data.length === 0
                ? "Quand tu clôtures un RDV (terminé ou annulé), il apparaît ici."
                : "Essayez un autre terme de recherche."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => (
              <CarteArchive key={p.row} p={p} onClick={() => setSelected(p)} onDelete={handleDelete} onClientClick={setFicheClientId} />
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

      {/* Fiche client (z-[60], au-dessus des modales) */}
      {ficheClientId && (
        <ClientFicheById clientId={ficheClientId} onClose={() => setFicheClientId(null)} onChanged={load} />
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
