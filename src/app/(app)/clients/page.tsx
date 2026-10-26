"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Search, Phone, Mail, MapPin, UserPlus, Pencil, Wrench,
  Clock, ChevronDown, ChevronUp, CheckCircle2, FileText,
  MessageCircle, Send, AlertTriangle, Calendar, Trash2, Download, Archive, X, Star,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { SkeletonCards } from "@/components/Skeleton";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import ClientModal from "@/components/ClientModal";
import { ClientFicheById } from "@/components/ClientFiche";
import { useToast } from "@/components/Toast";
import NewClientModal from "@/components/NewClientModal";
import ClotureModal from "@/components/ClotureModal";
import AvanceBadge from "@/components/AvanceBadge";
import { formatMontant } from "@/lib/finance";
import { fetchJsonOk } from "@/lib/fetchOk";
import { waMobile, waLien, waTexteAvis } from "@/lib/waMessages";
import { Prestation, Prestataire, ClientNote, STATUT_COLORS, estAnnulation } from "@/lib/constants";

const TAGS_PRESET = ["Régulier", "VIP", "Difficile", "Sensible", "Pro", "Fidèle"];
const TAG_COLORS: Record<string, string> = {
  "Régulier": "bg-blue-100 text-blue-700",
  "VIP"     : "bg-purple-100 text-purple-700",
  "Difficile": "bg-red-100 text-red-700",
  "Sensible": "bg-orange-100 text-orange-700",
  "Pro"     : "bg-gray-100 text-gray-700",
  "Fidèle"  : "bg-green-100 text-green-700",
};

// Prestation telle que renvoyée par GET /api/clients (historique complet).
type PrestaC = Prestation & { archived?: boolean };

// Format brut de GET /api/clients (tous les clients de la table, archivés inclus).
interface ApiClient {
  clientId: string;
  nom: string;
  prenom: string;
  tel: string;
  email: string;
  adresse: string;
  creeLe: string;
  tags: string[];
  notes: ClientNote[];
  prestations: PrestaC[];
}

interface Client {
  nom: string;
  prenom: string;
  tel: string;
  email: string;
  adresse: string;
  prestations: PrestaC[];   // ordre chronologique (plus ancienne → plus récente)
  totalCA: number;
  derniere: string;         // dernière intervention passée (dd/mm/yyyy)
  creeLe: string;
  tags: string[];
  clientId: string;
  notes: ClientNote[];
  latest?: PrestaC;         // dernière prestation effectuée (date passée la plus récente)
  prochain?: PrestaC;       // prochain RDV actif à venir
  activiteTs: number;       // dernière activité (tri « Récents »)
  reel: boolean;            // au moins une prestation en cours ou réalisée (pas que des annulations)
  prixManquant: boolean;    // une prestation valable sans prix
}

// Cache local (format différent de CACHE_KEYS.prestations, partagé par d'autres pages).
const CLIENTS_CACHE_KEY = "clients-full";

// "dd/mm/yyyy" (+ "HH:MM") → timestamp, pour comparer chronologiquement (0 si vide).
function frTs(date: string, heure?: string): number {
  const p = (date || "").split("/");
  if (p.length !== 3) return 0;
  const [h, m] = (heure || "00:00").split(":").map(n => parseInt(n) || 0);
  const t = new Date(+p[2], +p[1] - 1, +p[0], h, m).getTime();
  return isNaN(t) ? 0 : t;
}

type Tri = "prestations" | "recents" | "rdv" | "nouveaux" | "sans";

const NOTE_TYPES = [
  { icon: "📞", label: "Appel" },
  { icon: "💬", label: "Message" },
  { icon: "📧", label: "Email" },
  { icon: "📄", label: "Devis" },
  { icon: "🤝", label: "Visite" },
  { icon: "📌", label: "Note" },
];

function StatusBadge({ label }: { label: string }) {
  if (!label) return null;
  const cls = STATUT_COLORS[label] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function ConfirmBtns({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <button
        onClick={onConfirm}
        className="px-2 py-0.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
      >
        Supprimer
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-gray-200 transition-colors"
      >
        Annuler
      </button>
    </span>
  );
}

function ClientJournal({
  notes,
  onAdd,
  onDelete,
}: {
  notes: ClientNote[];
  onAdd: (texte: string, type: string) => void;
  onDelete: (noteId: string) => void;
}) {
  const [texte, setTexte] = useState("");
  const [type, setType]   = useState(NOTE_TYPES[0].icon);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const submit = () => {
    if (!texte.trim()) return;
    onAdd(texte, type);
    setTexte("");
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
      " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="bg-blue-50/40 rounded-xl border border-blue-100 p-3">
      <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <MessageCircle size={12} /> Journal de suivi
      </p>

      {/* Sélecteur de type */}
      <div className="flex flex-wrap gap-1 mb-2">
        {NOTE_TYPES.map(t => (
          <button
            key={t.icon}
            onClick={() => setType(t.icon)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              type === t.icon
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Input d'ajout */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={texte}
          onChange={e => setTexte(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="Action menée (ex: relance téléphonique, devis envoyé…)"
          className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          onClick={submit}
          disabled={!texte.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          <Send size={14} />
        </button>
      </div>

      {/* Liste */}
      {notes.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">
          Aucune action enregistrée pour ce client
        </p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {notes.map(n => (
            <div key={n.id} className="group flex items-start gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
              <span className="text-sm shrink-0">{n.type || "📌"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 break-words">{n.texte}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(n.date)}</p>
              </div>
              {confirmDel === n.id ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { onDelete(n.id); setConfirmDel(null); }} className="text-red-600 text-xs font-semibold">Oui</button>
                  <button onClick={() => setConfirmDel(null)} className="text-gray-400 text-xs">Non</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDel(n.id)}
                  className="text-gray-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyAvisLink({ clientId, clientName, prestation }: { clientId: string; clientName: string; prestation?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const params = new URLSearchParams({ nom: clientName });
    if (prestation) params.set("prestation", prestation);
    const url = `${window.location.origin}/avis/${clientId}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
        copied
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
      }`}
    >
      <Star size={12} className={copied ? "text-green-500" : "text-yellow-500"} />
      {copied ? "Lien copié !" : "Copier lien avis"}
    </button>
  );
}

function CopyMsgBtn({ msg }: { msg: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
        copied
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
      }`}
    >
      <MessageCircle size={12} />
      {copied ? "Message copié !" : "Copier message fin de prestation"}
    </button>
  );
}

function PrestationRow({
  p,
  onDelete,
  onDevisGenerated,
  onArchive,
}: {
  p: PrestaC;
  onDelete: (id: string) => void;
  onDevisGenerated: () => void;
  onArchive: (ids: string[], label: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [generatingDevis, setGeneratingDevis] = useState(false);

  const handleGenerateDevis = async () => {
    setGeneratingDevis(true);
    try {
      const url = `/api/devis/${p.row}`;
      // Ouvrir dans un nouvel onglet (le PDF sera servi et devis_genere = true côté serveur)
      window.open(url, "_blank");
      // Rafraîchir pour mettre à jour le badge "Devis disponible"
      setTimeout(onDevisGenerated, 1500);
    } finally {
      setGeneratingDevis(false);
    }
  };

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
      {/* Ligne 1 : type + date + prix + poubelle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {p.typePresta && (
            <span className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-lg">
              {p.typePresta}
              {p.quantite ? ` · ${p.quantite}` : ""}
            </span>
          )}
          {p.date && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar size={11} />
              {p.date}{p.heure ? ` à ${p.heure}` : ""}
            </span>
          )}
          {p.archived && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">📦 Archivé</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {p.prix && (
            <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-lg">
              {formatMontant(parseFloat(p.prix) || 0)}
            </span>
          )}
          {!p.archived && (
            <button
              onClick={() => onArchive([p.row], `${p.typePresta} – ${p.date || "?"}`)}
              className="p-1 rounded-lg hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-colors"
              title="Archiver cette prestation"
            >
              <Archive size={13} />
            </button>
          )}
          {!confirmDel ? (
            <button
              onClick={() => setConfirmDel(true)}
              className="p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
              title="Supprimer cette prestation"
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <ConfirmBtns
              onConfirm={() => onDelete(p.row)}
              onCancel={() => setConfirmDel(false)}
            />
          )}
        </div>
      </div>

      {/* Ligne 2 : statuts */}
      {(p.statut || p.statutPresta) && (
        <div className="flex flex-wrap gap-1">
          {p.statut && <StatusBadge label={p.statut} />}
          {p.statutPresta && <StatusBadge label={p.statutPresta} />}
        </div>
      )}

      {/* Ligne 3 : prestataire */}
      {p.prestataire ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Wrench size={11} className="text-gray-400" />
          <span className="font-medium">{p.prestataire}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle size={11} />
          <span>Aucun prestataire affecté</span>
        </div>
      )}

      {/* Ligne 4 : actions menées */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {p.envoyer === "OUI" && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <CheckCircle2 size={12} />Email client envoyé
          </span>
        )}
        {p.rappel === "OUI" && (
          <span className="flex items-center gap-1 text-xs text-purple-600">
            <Send size={12} />Rappel J-1 envoyé
          </span>
        )}
        {p.lienWA && (
          <a
            href={p.lienWA}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-green-600 hover:underline"
          >
            <MessageCircle size={12} />WhatsApp prestataire
          </a>
        )}
        {/* Devis : voir PDF existant OU générer */}
        {p.devisPDF ? (
          <a
            href={p.devisPDF}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
          >
            <FileText size={12} />Voir devis PDF
          </a>
        ) : p.genDevis === "FAIT" ? (
          <a
            href={`/api/devis/${p.row}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
          >
            <FileText size={12} />Voir devis PDF
          </a>
        ) : null}
        {/* Bouton générer (toujours disponible) */}
        <button
          onClick={handleGenerateDevis}
          disabled={generatingDevis}
          className="flex items-center gap-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
        >
          <Download size={11} />
          {generatingDevis ? "..." : p.genDevis === "FAIT" || p.devisPDF ? "Re-générer" : "Générer devis"}
        </button>
      </div>

      {/* Adresse prestation si différente */}
      {p.adresse && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin size={11} />
          {p.adresse}
        </p>
      )}
    </div>
  );
}

export default function ClientsPage() {
  const toast = useToast();
  const [merging, setMerging] = useState(false);
  // Fusion manuelle : sélection de fiches à fusionner (au cas où l'auto-détection
  // ne les relie pas — ex. 2 fiches sans aucun champ commun).
  const [selectedMerge, setSelectedMerge] = useState<Set<string>>(new Set());
  const toggleMergeSel = (clientId: string) => setSelectedMerge(prev => {
    const n = new Set(prev); if (n.has(clientId)) n.delete(clientId); else n.add(clientId); return n;
  });
  // Source : GET /api/clients = TOUS les clients (archivés inclus) + historique complet.
  const [data, setData]               = useState<ApiClient[]>(() => cacheGet<ApiClient[]>(CLIENTS_CACHE_KEY) ?? []);
  const [prestataires, setPrestataires] = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);
  const [loading, setLoading]         = useState(() => !cacheHas(CLIENTS_CACHE_KEY));
  const [tri, setTri]                 = useState<Tri>("prestations");
  // Pré-remplit la recherche depuis l'URL (?q=…) → arrivée directe sur une fiche
  // depuis la recherche globale. Lu côté client uniquement (pas de Suspense requis).
  const [search, setSearch]           = useState(() =>
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("q") || "") : ""
  );
  const [modal, setModal]             = useState<{ mode: "add" | "edit"; client?: Client } | null>(null);
  // Fiche client : TOUJOURS la version complète (ClientFicheById), quelle que soit l'entrée.
  // Ouverture directe d'une fiche depuis la recherche globale (?fiche=<clientId>).
  // Lu dans un effet (côté client uniquement) — pas dans un initialiseur useState,
  // sinon la valeur serveur (null) fige l'état et la fiche ne s'ouvre jamais.
  const [ficheById, setFicheById] = useState<string | null>(null);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("fiche");
    if (f) setFicheById(f);
  }, []);
  // Fermeture : on retire ?fiche= de l'URL (sinon la fiche se rouvre au rechargement).
  const closeFiche = useCallback(() => {
    setFicheById(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("fiche")) {
      url.searchParams.delete("fiche");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [confirmClientDel, setConfirmClientDel] = useState<string | null>(null);
  // Clôture (archivage) d'une prestation ou de toutes celles d'un client → ClotureModal
  const [archiveModal, setArchiveModal] = useState<{ prestations: PrestaC[]; label: string } | null>(null);
  const [tagEditKey, setTagEditKey]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resCli, resPresta] = await Promise.all([
        // Pas de paramètre anti-cache : la liste en cache (CLIENTS_CACHE_KEY, aussi
        // préchargée par la Sidebar) s'affiche tout de suite, ce fetch la rafraîchit.
        fetch("/api/clients", { cache: "no-store" }),
        fetch("/api/prestataires"),
      ]);
      if (resCli.ok) { const d = await resCli.json(); if (Array.isArray(d)) { setData(d); cacheSet(CLIENTS_CACHE_KEY, d); } }
      if (resPresta.ok) { const d = await resPresta.json(); setPrestataires(d); cacheSet(CACHE_KEYS.prestataires, d); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clients = useMemo<Client[]>(() => {
    const now = Date.now();
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
    return data.map(c => {
      const ps = c.prestations ?? [];
      // CA : tout l'historique, sauf les archivages pour annulation (même règle que la fiche)
      const totalCA = ps
        // + hors RDV actifs au statut ANNULÉ (même règle que finance.ts : une annulation ne compte jamais)
        .filter(p => !(p.archived && estAnnulation(p.archiveReason)) && !(!p.archived && p.statut === "ANNULÉ"))
        .reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
      // Dernière prestation effectuée = date passée la plus récente (comparaison chronologique)
      const passees = ps.filter(p => { const t = frTs(p.date, p.heure); return t > 0 && t <= now; });
      const latest = passees.reduce<PrestaC | undefined>((acc, p) =>
        !acc || frTs(p.date, p.heure) > frTs(acc.date, acc.heure) ? p : acc, undefined);
      // Prochain RDV = prestation active (non archivée, non annulée) à venir la plus proche
      const prochain = ps
        .filter(p => !p.archived && p.statut !== "ANNULÉ" && frTs(p.date) >= debutJour.getTime())
        .reduce<PrestaC | undefined>((acc, p) =>
          !acc || frTs(p.date, p.heure) < frTs(acc.date, acc.heure) ? p : acc, undefined);
      // Vrai client = au moins une prestation en cours ou réalisée (pas seulement annulée).
      // Les autres fiches (aucune prestation, que des annulations) sortent de la liste par défaut.
      const valables = ps.filter(p => !p.archived || !estAnnulation(p.archiveReason));
      const reel = valables.length > 0;
      const prixManquant = valables.some(p => !(parseFloat(p.prix) > 0));
      const activiteTs = Math.max(
        0, ...ps.map(p => frTs(p.date, p.heure)), ...ps.map(p => Date.parse(p.timestamp) || 0), Date.parse(c.creeLe) || 0,
      );
      return {
        ...c,
        prestations: ps,
        totalCA,
        derniere: latest?.date || "",
        tags: c.tags ?? [],
        notes: c.notes ?? [],
        latest, prochain, activiteTs, reel, prixManquant,
      };
    }).sort((a, b) => b.prestations.length - a.prestations.length);
  }, [data]);

  const nbSans = useMemo(() => clients.filter(c => !c.reel).length, [clients]);
  const filtered = useMemo(() => {
    let list = clients;
    // Onglet « Sans prestation réalisée » : fiches vides ou 100 % annulées. Ailleurs, on
    // ne les montre que si on les cherche explicitement (la recherche couvre tout).
    if (tri === "sans") list = list.filter(c => !c.reel);
    else if (!search.trim()) list = list.filter(c => c.reel);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        [c.nom, c.prenom, c.email, c.tel, c.adresse].join(" ").toLowerCase().includes(q)
      );
    }
    if (tri === "rdv") {
      return list.filter(c => c.prochain)
        .sort((a, b) => frTs(a.prochain!.date, a.prochain!.heure) - frTs(b.prochain!.date, b.prochain!.heure));
    }
    if (tri === "recents") return [...list].sort((a, b) => b.activiteTs - a.activiteTs);
    if (tri === "nouveaux") return [...list].sort((a, b) => (Date.parse(b.creeLe) || 0) - (Date.parse(a.creeLe) || 0));
    return list;
  }, [clients, search, tri]);

  // Rendu progressif (mobile) : 50 fiches d'abord, « Voir plus » pour la suite.
  // La recherche et les onglets portent toujours sur TOUTE la liste.
  const PAGE_CLIENTS = 50;
  const [nbVisibles, setNbVisibles] = useState(PAGE_CLIENTS);
  useEffect(() => { setNbVisibles(PAGE_CLIENTS); }, [search, tri]);

  // Détecte les fiches en double de façon ROBUSTE et SÛRE. On ne se base JAMAIS
  // sur le nom (deux clients différents peuvent avoir le même nom). On relie deux
  // fiches uniquement si elles partagent un identifiant qui ne peut appartenir
  // qu'à une seule personne : même TÉLÉPHONE, OU même EMAIL, OU même ADRESSE
  // postale. Par chaînage (union-find), toutes les variantes se regroupent.
  const [showDoublons, setShowDoublons] = useState(false);
  const doublons = useMemo(() => {
    const norm    = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "").trim();
    // Téléphone : on ne garde que les chiffres (ignore +33/0, espaces, points…)
    const normTel = (s: string) => { const d = (s || "").replace(/\D/g, ""); return d.replace(/^0/, "").replace(/^33/, ""); };
    // Adresse : minuscules, sans espaces ni ponctuation
    const normAdr = (s: string) => (s || "").toLowerCase().replace(/[\s,.\-]/g, "").trim();

    const parent = new Map<string, string>();
    const find = (x: string): string => {
      while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
      return x;
    };
    const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

    for (const c of clients) if (c.clientId) parent.set(c.clientId, c.clientId);

    const bySignal = new Map<string, string>();
    for (const c of clients) {
      if (!c.clientId) continue;
      const signals: string[] = [];
      const tel = normTel(c.tel);   if (tel.length >= 6)   signals.push("t:" + tel);
      const em  = norm(c.email);    if (em)                signals.push("e:" + em);
      const adr = normAdr(c.adresse); if (adr.length >= 8) signals.push("a:" + adr);
      for (const s of signals) {
        const seen = bySignal.get(s);
        if (seen) union(c.clientId, seen);
        else bySignal.set(s, c.clientId);
      }
    }

    const groups = new Map<string, Client[]>();
    for (const c of clients) {
      if (!c.clientId) continue;
      const root = find(c.clientId);
      const arr = groups.get(root) ?? [];
      arr.push(c);
      groups.set(root, arr);
    }
    return Array.from(groups.values()).filter(g => g.length > 1);
  }, [clients]);

  async function mergeGroup(group: Client[]) {
    if (group.length < 2) return;
    // Fiche maître = celle qui a le plus de prestations (à défaut, la 1re)
    const master = [...group].sort((a, b) => b.prestations.length - a.prestations.length)[0];
    const mergeIds = group.filter(c => c.clientId !== master.clientId).map(c => c.clientId);
    setMerging(true);
    try {
      const res = await fetch("/api/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId: master.clientId, mergeIds }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      toast.success(`${master.prenom} ${master.nom} : ${mergeIds.length + 1} fiches fusionnées en une`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fusion impossible");
    } finally {
      setMerging(false);
    }
  }

  async function mergeSelected() {
    const group = clients.filter(c => selectedMerge.has(c.clientId));
    if (group.length < 2) return;
    await mergeGroup(group);
    setSelectedMerge(new Set());
  }

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDeletePrestation = async (id: string) => {
    try {
      await fetchJsonOk("/api/prestations", "DELETE", { id });
    } catch (e) {
      toast.error(`Suppression impossible : ${e instanceof Error ? e.message : "Erreur"}`);
    }
    load();
  };

  const handleDeleteClient = async (c: Client) => {
    const clientId = c.clientId;
    if (!clientId) return;
    try {
      await fetchJsonOk("/api/clients", "DELETE", { clientId });
    } catch (e) {
      toast.error(`Suppression du client impossible : ${e instanceof Error ? e.message : "Erreur"}`);
    }
    setConfirmClientDel(null);
    load();
  };

  const handleToggleTag = async (c: Client, tag: string) => {
    const current = c.tags ?? [];
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
    // Optimistic update
    setData(prev => prev.map(x => x.clientId === c.clientId ? { ...x, tags: next } : x));
    try {
      await fetchJsonOk("/api/clients", "PATCH", { clientId: c.clientId, tags: next });
    } catch (e) {
      setData(prev => prev.map(x => x.clientId === c.clientId ? { ...x, tags: current } : x)); // rollback
      toast.error(`Tag non enregistré : ${e instanceof Error ? e.message : "Erreur"}`);
    }
  };

  const persistNotes = async (c: Client, notes: ClientNote[]) => {
    // Optimistic update
    const previous = c.notes;
    setData(prev => prev.map(x => x.clientId === c.clientId ? { ...x, notes } : x));
    try {
      await fetchJsonOk("/api/clients", "PATCH", { clientId: c.clientId, notes });
    } catch (e) {
      setData(prev => prev.map(x => x.clientId === c.clientId ? { ...x, notes: previous } : x)); // rollback
      toast.error(`Note non enregistrée : ${e instanceof Error ? e.message : "Erreur"}`);
    }
  };

  const handleAddNote = (c: Client, texte: string, type: string) => {
    if (!texte.trim() || !c.clientId) return;
    const note: ClientNote = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      texte: texte.trim(),
      type,
    };
    persistNotes(c, [note, ...(c.notes ?? [])]);
  };

  const handleDeleteNote = (c: Client, noteId: string) => {
    persistNotes(c, (c.notes ?? []).filter(n => n.id !== noteId));
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        title="Clients"
        subtitle={`${filtered.length} client${filtered.length > 1 ? "s" : ""}`}
        onRefresh={load}
        loading={loading}
      />
      <div className="flex-1 p-3 sm:p-6 space-y-4">
        {/* Barre recherche + bouton Ajouter */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 space-y-3">
          <div className="flex gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <button
              onClick={() => setModal({ mode: "add" })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <UserPlus size={15} />
              <span className="hidden sm:inline">Ajouter</span>
            </button>
          </div>
          {/* Tri / filtre rapide */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 [scrollbar-width:none]">
            {([
              ["prestations", "Plus de prestations"],
              ["rdv", "📅 RDV à venir"],
              ["recents", "Activité récente"],
              ["nouveaux", "Nouveaux clients"],
              ["sans", `Sans prestation réalisée (${nbSans})`],
            ] as [Tri, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTri(val)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tri === val ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Bandeau doublons détectés */}
        {doublons.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            {/* Replié par défaut : la liste peut être longue et repousser les clients */}
            <button type="button" onClick={() => setShowDoublons(v => !v)} className="w-full flex items-center gap-2 text-left">
              <AlertTriangle size={16} className="text-amber-600" />
              <p className="flex-1 text-sm font-semibold text-amber-800">
                {doublons.length} client{doublons.length > 1 ? "s" : ""} en double détecté{doublons.length > 1 ? "s" : ""}
              </p>
              <span className="text-xs font-medium text-amber-700 underline">{showDoublons ? "Masquer" : "Voir"}</span>
            </button>
            {showDoublons && <>
            <p className="text-xs text-amber-700">
              Plusieurs fiches existent pour la même personne (souvent après une reprogrammation de RDV).
              Fusionner rassemble tout l&apos;historique dans une seule fiche.
            </p>
            <div className="space-y-1.5">
              {doublons.map((g, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-2 border border-amber-100">
                  <span className="text-sm text-gray-700 truncate">
                    <strong>{g[0].prenom} {g[0].nom}</strong>
                    <span className="text-gray-400"> · {g.length} fiches ({g.reduce((s, c) => s + c.prestations.length, 0)} prestations)</span>
                  </span>
                  <button
                    onClick={() => mergeGroup(g)}
                    disabled={merging}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
                  >
                    {merging ? "Fusion…" : "Fusionner"}
                  </button>
                </div>
              ))}
            </div>
            </>}
          </div>
        )}

        {loading && data.length === 0 ? (
          <SkeletonCards count={6} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.slice(0, nbVisibles).map((c) => {
              const key = c.clientId || c.email || `${c.nom}-${c.prenom}-${c.tel}`;
              const isExpanded = expanded.has(key);
              const isConfirmingDel = confirmClientDel === key;
              const actives = c.prestations.filter((p) => !p.archived);
              const nbArchivees = c.prestations.length - actives.length;
              const unassigned = actives.filter((p) => !p.prestataire).length;
              const hasDevis = c.prestations.some((p) => p.devisPDF || p.genDevis === "FAIT");
              const lastPrestataire = [...c.prestations].reverse().find((p) => p.prestataire)?.prestataire;

              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* En-tête carte */}
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <button
                          onClick={() => c.clientId && setFicheById(c.clientId)}
                          className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-left"
                          title="Ouvrir la fiche complète"
                        >
                          {c.prenom} {c.nom}
                        </button>
                        <span className="ml-1.5 align-middle"><AvanceBadge tel={c.tel} email={c.email} prenom={c.prenom} nom={c.nom} /></span>
                        {c.prixManquant && <span className="ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200" title="Une prestation n'a pas de prix">Prix manquant</span>}
                        {!c.reel && <span className="ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500" title="Aucune prestation réalisée (vide ou annulée)">Sans prestation réalisée</span>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.prestations.length} prestation{c.prestations.length > 1 ? "s" : ""}
                          {nbArchivees > 0 ? ` · dont ${nbArchivees} archivée${nbArchivees > 1 ? "s" : ""}` : ""}
                        </p>
                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(c.tags ?? []).map(tag => (
                            <span
                              key={tag}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}
                            >
                              {tag}
                            </span>
                          ))}
                          <button
                            onClick={(e) => { e.stopPropagation(); setTagEditKey(tagEditKey === key ? null : key); }}
                            className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors"
                            title="Gérer les tags"
                          >
                            {tagEditKey === key ? "✕" : "+"}
                          </button>
                        </div>
                        {tagEditKey === key && (
                          <div className="flex flex-wrap gap-1 mt-1.5 p-2 bg-gray-50 rounded-xl border border-gray-100">
                            {TAGS_PRESET.map(tag => (
                              <button
                                key={tag}
                                onClick={(e) => { e.stopPropagation(); handleToggleTag(c, tag); }}
                                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                                  (c.tags ?? []).includes(tag)
                                    ? (TAG_COLORS[tag] ?? "bg-gray-200 text-gray-700") + " font-semibold"
                                    : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"
                                }`}
                              >
                                {(c.tags ?? []).includes(tag) ? "✓ " : ""}{tag}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {c.clientId && (
                          <label className="flex items-center p-1 cursor-pointer" title="Sélectionner pour fusionner">
                            <input
                              type="checkbox"
                              checked={selectedMerge.has(c.clientId)}
                              onChange={() => toggleMergeSel(c.clientId)}
                              className="w-4 h-4 accent-amber-500"
                            />
                          </label>
                        )}
                        <span className="text-sm font-bold text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                          {formatMontant(c.totalCA)}
                        </span>
                        <button
                          onClick={() => setModal({ mode: "edit", client: c })}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Modifier ce client"
                        >
                          <Pencil size={14} />
                        </button>
                        {actives.length > 0 && (
                          <button
                            onClick={() => {
                              setArchiveModal({ prestations: actives, label: `${c.prenom} ${c.nom}` });
                            }}
                            className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-colors"
                            title="Archiver ce client"
                          >
                            <Archive size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmClientDel(isConfirmingDel ? null : key)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                          title="Supprimer ce client"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Confirmation suppression client */}
                    {isConfirmingDel && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2">
                        <p className="text-xs text-red-700 font-medium">
                          Supprimer ce client et toutes ses prestations ?
                        </p>
                        <ConfirmBtns
                          onConfirm={() => handleDeleteClient(c)}
                          onCancel={() => setConfirmClientDel(null)}
                        />
                      </div>
                    )}

                    {/* Coordonnées */}
                    <div className="space-y-1.5">
                      {c.tel && (
                        <div className="flex flex-wrap items-center gap-2">
                          <a href={`tel:${c.tel}`} className="flex items-center gap-2 min-h-[40px] text-sm text-gray-600 hover:text-gray-900">
                            <Phone size={13} className="text-gray-400" />{c.tel}
                          </a>
                          {waMobile(c.tel) && (
                            <a href={`https://wa.me/${waMobile(c.tel)}`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors">
                              <MessageCircle size={13} />WhatsApp
                            </a>
                          )}
                        </div>
                      )}
                      {c.email && (() => {
                        // Récap de RDV : le prochain RDV s'il y en a un, sinon la dernière prestation
                        const last = c.prochain ?? c.latest ?? c.prestations[c.prestations.length - 1];
                        const details = [
                          last?.typePresta ? `  • Prestation : ${last.typePresta}${last.quantite ? ` (x${last.quantite})` : ""}` : "",
                          last?.adresse    ? `  • Adresse    : ${last.adresse}` : "",
                          last?.date       ? `  • Date       : ${last.date}${last.heure ? ` à ${last.heure}` : ""}` : "",
                          last?.prix       ? `  • Montant    : ${last.prix} €` : "",
                        ].filter(Boolean).join("\n");
                        const body = [
                          `Bonjour ${c.prenom},`,
                          ``,
                          `Nous avons bien enregistré votre demande et vous remercions de votre confiance.`,
                          ``,
                          `Voici le récapitulatif de votre rendez-vous :`,
                          ``,
                          details,
                          ``,
                          `Pour toute question ou modification, n'hésitez pas à nous contacter — nous sommes à votre entière disposition.`,
                          ``,
                          `Nous nous réjouissons de vous accueillir prochainement et vous souhaitons une excellente journée.`,
                          ``,
                          `À très bientôt,`,
                          ``,
                          `L'équipe KinouClean`,
                        ].join("\n");
                        const subject = encodeURIComponent("Confirmation de votre rendez-vous – KinouClean");
                        return (
                          <div className="flex items-center gap-2">
                            <Mail size={13} className="text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-500 truncate flex-1">{c.email}</span>
                            <a
                              href={`mailto:${c.email}?subject=${subject}&body=${encodeURIComponent(body)}`}
                              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors whitespace-nowrap"
                              title="Ouvrir dans votre application mail"
                            >
                              <Send size={11} />
                              Envoyer un mail
                            </a>
                          </div>
                        );
                      })()}
                      {c.adresse && (
                        <p className="flex items-center gap-2 text-sm text-gray-500">
                          <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                          <span className="truncate">{c.adresse}</span>
                        </p>
                      )}
                    </div>

                    {/* Résumé rapide */}
                    <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
                      {c.prochain && (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                          <Calendar size={12} />
                          Prochain RDV : {c.prochain.date}{c.prochain.heure ? ` à ${c.prochain.heure}` : ""}
                          {c.prochain.typePresta ? ` · ${c.prochain.typePresta}` : ""}
                        </p>
                      )}
                      {lastPrestataire && (
                        <p className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Wrench size={12} className="text-gray-400" />
                          {lastPrestataire}
                        </p>
                      )}
                      {unassigned > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <Clock size={11} />
                          {unassigned} mission{unassigned > 1 ? "s" : ""} à affecter
                        </span>
                      )}
                      {hasDevis && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                          <FileText size={11} />
                          Devis disponible
                        </span>
                      )}
                      {(c.notes?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                          <MessageCircle size={11} />
                          {c.notes.length} suivi{c.notes.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {c.derniere && (
                        <p className="text-xs text-gray-400">
                          Dernière intervention : {c.derniere}
                        </p>
                      )}
                      {c.creeLe && (
                        <p className="text-xs text-gray-400">
                          Fiche créée le {new Date(c.creeLe).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Lien avis + WhatsApp fin de prestation */}
                  {c.clientId && (
                    <div className="mt-3 pt-3 border-t border-gray-50 flex flex-wrap items-center gap-2">
                      <CopyAvisLink
                        clientId={c.clientId}
                        clientName={`${c.prenom} ${c.nom}`}
                        prestation={c.latest?.typePresta}
                      />
                      {(() => {
                        const last = c.latest;
                        const avisUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/avis/${c.clientId}?nom=${encodeURIComponent(`${c.prenom} ${c.nom}`)}${last?.typePresta ? `&prestation=${encodeURIComponent(last.typePresta)}` : ""}`;
                        const msg = waTexteAvis({ prenom: c.prenom, prestation: last?.typePresta, lien: avisUrl });
                        const lien = waLien(c.tel, msg);
                        return (<>
                          {lien && (
                            <a href={lien} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 active:bg-green-800 transition-colors">
                              <MessageCircle size={13} />Demander un avis sur WhatsApp
                            </a>
                          )}
                          <CopyMsgBtn msg={msg} />
                        </>);
                      })()}
                    </div>
                  )}

                  {/* Bouton déplier */}
                  <button
                    onClick={() => toggleExpanded(key)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-xs text-gray-500 font-medium transition-colors border-t border-gray-100"
                  >
                    {isExpanded ? (
                      <><ChevronUp size={13} />Masquer les prestations</>
                    ) : (
                      <><ChevronDown size={13} />Voir toutes les prestations ({c.prestations.length})</>
                    )}
                  </button>

                  {/* Détail des prestations + journal */}
                  {isExpanded && (
                    <div className="p-4 space-y-3 border-t border-gray-100 bg-white">
                      {c.clientId && (
                        <ClientJournal
                          notes={c.notes ?? []}
                          onAdd={(texte, type) => handleAddNote(c, texte, type)}
                          onDelete={(noteId) => handleDeleteNote(c, noteId)}
                        />
                      )}
                      {c.prestations.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">Aucune prestation</p>
                      ) : (
                        c.prestations.map((p) => (
                          <PrestationRow
                            key={p.row}
                            p={p}
                            onDelete={handleDeletePrestation}
                            onDevisGenerated={load}
                            onArchive={(ids) => setArchiveModal({ prestations: c.prestations.filter(x => ids.includes(x.row)), label: `${c.prenom} ${c.nom}` })}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {filtered.length > nbVisibles && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setNbVisibles(n => n + PAGE_CLIENTS)}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Voir plus ({filtered.length - nbVisibles} restant{filtered.length - nbVisibles > 1 ? "s" : ""})
            </button>
          </div>
        )}
      </div>

      {/* Barre flottante de fusion manuelle */}
      {selectedMerge.size >= 2 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-amber-500 text-white rounded-full shadow-2xl pl-5 pr-2.5 py-2.5 flex items-center gap-3">
          <span className="text-sm font-medium">{selectedMerge.size} fiches sélectionnées</span>
          <button
            onClick={mergeSelected}
            disabled={merging}
            className="bg-white text-amber-700 rounded-full px-4 py-1.5 text-sm font-bold hover:bg-amber-50 transition-colors disabled:opacity-50"
          >
            {merging ? "Fusion…" : "Fusionner en une fiche"}
          </button>
          <button onClick={() => setSelectedMerge(new Set())} aria-label="Annuler la sélection" className="text-white/80 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {ficheById && (
        <ClientFicheById
          clientId={ficheById}
          onClose={closeFiche}
          onChanged={load}
        />
      )}

      {modal && modal.mode === "add" && (
        <NewClientModal
          prestataires={prestataires}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal && modal.mode === "edit" && (
        <ClientModal
          mode="edit"
          client={modal.client}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {/* Clôture / archivage — modale unique partagée */}
      {archiveModal && (
        <ClotureModal
          prestations={archiveModal.prestations}
          label={archiveModal.label}
          onClose={() => setArchiveModal(null)}
          onDone={() => load()}
        />
      )}
    </div>
  );
}
