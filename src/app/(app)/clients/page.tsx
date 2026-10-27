"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Search, Phone, Mail, UserPlus, Clock, MessageCircle, AlertTriangle, Calendar,
  Trash2, Archive, X, Star, Copy, MoreHorizontal,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { SkeletonCards } from "@/components/Skeleton";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import { ClientFicheById } from "@/components/ClientFiche";
import { useToast } from "@/components/Toast";
import NewClientModal from "@/components/NewClientModal";
import ClotureModal from "@/components/ClotureModal";
import AvanceBadge from "@/components/AvanceBadge";
import { formatMontant } from "@/lib/finance";
import { fetchJsonOk } from "@/lib/fetchOk";
import { waMobile, waLien, waTexteAvis } from "@/lib/waMessages";
import { Prestation, Prestataire, ClientNote, estAnnulation } from "@/lib/constants";
import UrlParamWatcher from "@/components/UrlParamWatcher";

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

function ConfirmBtns({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <button
        onClick={onConfirm}
        className="min-h-[36px] px-3 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
      >
        Supprimer
      </button>
      <button
        onClick={onCancel}
        className="min-h-[36px] px-3 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-gray-200 transition-colors"
      >
        Annuler
      </button>
    </span>
  );
}

// Mail de confirmation d'un RDV À VENIR (mailto) — proposé uniquement s'il y a un prochain RDV.
function mailConfirmationRdv(c: { prenom: string; email: string }, rdv: PrestaC): string {
  const details = [
    rdv.typePresta ? `  • Prestation : ${rdv.typePresta}${rdv.quantite ? ` (x${rdv.quantite})` : ""}` : "",
    rdv.adresse    ? `  • Adresse    : ${rdv.adresse}` : "",
    rdv.date       ? `  • Date       : ${rdv.date}${rdv.heure ? ` à ${rdv.heure}` : ""}` : "",
    rdv.prix       ? `  • Montant    : ${rdv.prix} €` : "",
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
  return `mailto:${c.email}?subject=${subject}&body=${encodeURIComponent(body)}`;
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
  const [modal, setModal]             = useState<"add" | null>(null);
  // Fiche client : TOUJOURS la version complète (ClientFicheById), quelle que soit l'entrée.
  // Ouverture directe d'une fiche depuis la recherche globale (?fiche=<clientId>).
  // Suivi par UrlParamWatcher (rendu plus bas) : la fiche s'ouvre aussi quand on
  // choisit un client dans la recherche alors qu'on est déjà sur /clients.
  const [ficheById, setFicheById] = useState<string | null>(null);
  // Fermeture : on retire ?fiche= de l'URL (sinon la fiche se rouvre au rechargement).
  const closeFiche = useCallback(() => {
    setFicheById(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("fiche")) {
      url.searchParams.delete("fiche");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);
  // Menu « ⋯ » ouvert (une carte à la fois) : tags, avis, fusion, archivage, suppressions.
  const [menuKey, setMenuKey]         = useState<string | null>(null);
  const [confirmClientDel, setConfirmClientDel] = useState<string | null>(null);
  // Clôture (archivage) d'une prestation ou de toutes celles d'un client → ClotureModal
  const [archiveModal, setArchiveModal] = useState<{ prestations: PrestaC[]; label: string } | null>(null);
  const [confirmPrestaDel, setConfirmPrestaDel] = useState<string | null>(null);

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
              onClick={() => setModal("add")}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {filtered.slice(0, nbVisibles).map((c) => {
              const key = c.clientId || c.email || `${c.nom}-${c.prenom}-${c.tel}`;
              const menuOuvert = menuKey === key;
              const actives = c.prestations.filter((p) => !p.archived);
              const unassigned = actives.filter((p) => !p.prestataire).length;
              const wa = waMobile(c.tel);
              const selected = !!c.clientId && selectedMerge.has(c.clientId);
              const nbRdv = c.prestations.length;

              return (
                <div key={key} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${selected ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-100"}`}>
                  {/* Ligne compacte : tap = fiche unifiée */}
                  <div className="flex items-center gap-1.5 p-2.5 sm:p-3">
                    <button
                      type="button"
                      onClick={() => c.clientId && setFicheById(c.clientId)}
                      className="flex-1 min-w-0 min-h-[44px] text-left rounded-xl px-1.5 py-1 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      title="Ouvrir la fiche complète"
                    >
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate max-w-full">{c.prenom} {c.nom}</span>
                        <AvanceBadge tel={c.tel} email={c.email} prenom={c.prenom} nom={c.nom} />
                        {c.prixManquant && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200" title="Une prestation n'a pas de prix">Prix manquant</span>}
                        {!c.reel && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500" title="Aucune prestation réalisée (vide ou annulée)">Sans prestation réalisée</span>}
                        {unassigned > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">
                            <Clock size={10} />{unassigned} à affecter
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-0.5 text-xs">
                        <span className="font-bold text-green-700">{formatMontant(c.totalCA)}</span>
                        <span className="text-gray-400">{nbRdv} RDV</span>
                        {c.prochain ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                            <Calendar size={11} />{c.prochain.date}{c.prochain.heure ? ` ${c.prochain.heure}` : ""}
                          </span>
                        ) : c.derniere ? (
                          <span className="text-gray-400">Dernier : {c.derniere}</span>
                        ) : null}
                      </span>
                      {c.tags.length > 0 && (
                        <span className="flex flex-wrap gap-1 mt-1">
                          {c.tags.map(tag => (
                            <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TAG_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}>{tag}</span>
                          ))}
                        </span>
                      )}
                    </button>
                    {c.tel && (
                      <a href={`tel:${c.tel}`} aria-label={`Appeler ${c.prenom} ${c.nom}`} title="Appeler"
                        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200 transition-colors">
                        <Phone size={17} />
                      </a>
                    )}
                    {wa && (
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${c.prenom} ${c.nom}`} title="WhatsApp"
                        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-green-50 text-green-600 hover:bg-green-100 active:bg-green-200 transition-colors">
                        <MessageCircle size={17} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => { setMenuKey(menuOuvert ? null : key); setConfirmClientDel(null); setConfirmPrestaDel(null); }}
                      aria-label="Plus d'actions" aria-expanded={menuOuvert} title="Plus d'actions"
                      className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-xl transition-colors ${menuOuvert ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:bg-gray-100"}`}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>

                  {/* Menu « ⋯ » : actions absentes de la fiche unifiée (tags, avis WhatsApp,
                      mail de confirmation, fusion, archivage, suppressions). */}
                  {menuOuvert && (
                    <div className="border-t border-gray-100 bg-gray-50/60 p-3 space-y-3">
                      {/* Tags */}
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {TAGS_PRESET.map(tag => {
                            const on = c.tags.includes(tag);
                            return (
                              <button key={tag} type="button" onClick={() => handleToggleTag(c, tag)}
                                className={`min-h-[36px] text-xs px-3 rounded-full transition-colors ${
                                  on ? (TAG_COLORS[tag] ?? "bg-gray-200 text-gray-700") + " font-semibold" : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"
                                }`}>
                                {on ? "✓ " : ""}{tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {c.clientId && (() => {
                          const last = c.latest;
                          const avisUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/avis/${c.clientId}?nom=${encodeURIComponent(`${c.prenom} ${c.nom}`)}${last?.typePresta ? `&prestation=${encodeURIComponent(last.typePresta)}` : ""}`;
                          const msg = waTexteAvis({ prenom: c.prenom, prestation: last?.typePresta, lien: avisUrl });
                          const lien = waLien(c.tel, msg);
                          return (<>
                            {lien && (
                              <a href={lien} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 active:bg-green-800 transition-colors">
                                <Star size={13} />Demander un avis (WhatsApp)
                              </a>
                            )}
                            <button type="button"
                              onClick={() => navigator.clipboard.writeText(msg).then(() => toast.success("Message d'avis copié"))}
                              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors">
                              <Copy size={13} />Copier le message d&apos;avis
                            </button>
                          </>);
                        })()}
                        {c.email && c.prochain && (
                          <a href={mailConfirmationRdv(c, c.prochain)}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-medium hover:bg-blue-50 transition-colors"
                            title="Ouvrir dans votre application mail">
                            <Mail size={13} />Mail de confirmation du RDV
                          </a>
                        )}
                        {c.clientId && (
                          <label className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium cursor-pointer">
                            <input type="checkbox" checked={selected} onChange={() => toggleMergeSel(c.clientId)} className="w-4 h-4 accent-amber-500" />
                            Sélectionner pour fusion
                          </label>
                        )}
                        {actives.length > 0 && (
                          <button type="button"
                            onClick={() => setArchiveModal({ prestations: actives, label: `${c.prenom} ${c.nom}` })}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-white border border-amber-200 text-amber-700 text-xs font-medium hover:bg-amber-50 transition-colors">
                            <Archive size={13} />Archiver le client
                          </button>
                        )}
                      </div>

                      {/* Prestations : archivage / suppression unitaire (absents de la fiche) */}
                      {c.prestations.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Gérer les prestations</p>
                          <div className="space-y-1">
                            {c.prestations.map(p => (
                              <div key={p.row} className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-100 pl-2.5 pr-1 py-1">
                                <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">
                                  {p.typePresta || "Prestation"} · {p.date || "?"}{p.prix ? ` · ${p.prix} €` : ""}
                                  {p.archived ? " · 📦" : p.statut === "ANNULÉ" ? " · annulé" : ""}
                                </span>
                                {confirmPrestaDel === p.row ? (
                                  <ConfirmBtns onConfirm={() => { setConfirmPrestaDel(null); handleDeletePrestation(p.row); }} onCancel={() => setConfirmPrestaDel(null)} />
                                ) : (<>
                                  {!p.archived && (
                                    <button type="button" onClick={() => setArchiveModal({ prestations: [p], label: `${c.prenom} ${c.nom}` })}
                                      aria-label="Archiver cette prestation" title="Archiver cette prestation"
                                      className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                                      <Archive size={14} />
                                    </button>
                                  )}
                                  <button type="button" onClick={() => setConfirmPrestaDel(p.row)}
                                    aria-label="Supprimer cette prestation" title="Supprimer cette prestation"
                                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                    <Trash2 size={14} />
                                  </button>
                                </>)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suppression client */}
                      {confirmClientDel === key ? (
                        <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2">
                          <p className="text-xs text-red-700 font-medium">Supprimer ce client et toutes ses prestations ?</p>
                          <ConfirmBtns onConfirm={() => handleDeleteClient(c)} onCancel={() => setConfirmClientDel(null)} />
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmClientDel(key)}
                          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-red-600 text-xs font-medium hover:bg-red-50 transition-colors">
                          <Trash2 size={13} />Supprimer le client
                        </button>
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
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-5 left-1/2 -translate-x-1/2 z-40 bg-amber-500 text-white rounded-full shadow-2xl pl-5 pr-2.5 py-2.5 flex items-center gap-3">
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

      <UrlParamWatcher name="fiche" onChange={v => { if (v) setFicheById(v); }} />
      {ficheById && (
        <ClientFicheById
          clientId={ficheById}
          onClose={closeFiche}
          onChanged={load}
        />
      )}

      {modal === "add" && (
        <NewClientModal
          prestataires={prestataires}
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
