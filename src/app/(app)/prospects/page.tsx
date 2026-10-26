"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Plus, X, Search, Phone, Mail, MapPin, Calendar, MessageSquare,
  ChevronRight, UserCheck, Loader2, Trash2, Star, ArrowRight, Bell,
  Users, TrendingUp, Clock, CheckCircle2, Pencil, Check, FileText,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { useToast } from "@/components/Toast";
import { SkeletonList } from "@/components/Skeleton";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import NewClientModal from "@/components/NewClientModal";
import AddProspectModal, { NbStepper, toNum, nbOf, fmtEur } from "@/components/AddProspectModal";
import PrestationFields from "@/components/PrestationFields";
import { getSchema } from "@/lib/prestationSchema";
import { Prestataire, ClientNote, TYPES_PRESTATION } from "@/lib/constants";
import { ClientFicheById } from "@/components/ClientFiche";
import DevisExternes, { DevisExterne, fmtDevisDate } from "@/components/DevisExternes";
import { isoParis } from "@/lib/dateParis";
import { etatAuto, libelleEtatAuto, jjmmIso, prochainPassage, EtatAuto } from "@/lib/prospectRelanceCadence";
import { waAEnvoyer, waMessage, waLien, waLibelle, waDonneesProspect, WaEtape } from "@/lib/waMessages";
import { montantRemise, type DevisRemise } from "@/lib/devisKinou";

// Formatage FR compact pour le pense-bête d'import.
function fmtImportDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function fmtImportDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ─── Conversion prospect → client ───────────────────────────────────────────
// Adresse « 12 rue X, 75001 Paris » → rue / CP / ville (champs du formulaire client).
function splitAdresse(a: string): { adresse: string; codePostal: string; ville: string } {
  const m = (a || "").trim().match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  return m ? { adresse: m[1].trim(), codePostal: m[2], ville: m[3].trim() } : { adresse: a || "", codePostal: "", ville: "" };
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Commentaire {
  id: string;
  date: string;
  texte: string;
}
interface Prospect {
  id: string;
  createdAt: string;
  updatedAt: string;
  genre: string;
  prenom: string;
  nom: string;
  tel: string;
  email: string;
  source: string;
  typePresta: string;
  adresse: string;
  budget: string;
  statut: string;
  dateRelance: string;
  relanceSteps: string[]; // étapes cochées : "j1", "j3", "j7"
  notes: string;
  commentaires: Commentaire[];
  besoins?: Besoin[]; // prestations souhaitées (type + détails + prix), pré-remplit la conversion
  suivi?: Suivi;      // suivi commercial : devis envoyé + relances
  dejaClient?: { id: string; nom: string } | null; // fiche client existante (même email / tél.), calculé côté serveur
  autoGlobal?: boolean; // interrupteur global « Relances automatiques » (Configuration)
}

// Suivi commercial d'un prospect (stocké dans settings/prospects_suivi).
interface Suivi { devisEnvoye?: boolean; devisDate?: string; devisNum?: string; relanceNiveau?: number; relanceDate?: string; relanceDates?: string[]; avanceImmediate?: boolean; infosEnvoye?: boolean; infosDate?: string; infoRelanceNiveau?: number; infoRelanceDates?: string[]; autoRelance?: boolean; autoStop?: string; reponduLe?: string; dernierEnvoiIso?: string; waEnvois?: Record<string, string>; remise?: DevisRemise }

// État des relances automatiques d'un prospect (même calcul que le cron).
const etatAutoDe = (p: Prospect): EtatAuto => etatAuto(p, p.suivi, { global: p.autoGlobal !== false, today: isoParis(0) });

// Une prestation souhaitée notée sur le prospect (même forme que les articles client).
// `details` = valeurs structurées des champs intelligents (tissu, places…), pour
// les reporter tels quels à la conversion en client.
// quantite = description (taille, places…) ; nombre = articles identiques ; prix = TOTAL de la ligne.
interface Besoin { typePresta: string; quantite: string; prix: string; details?: Record<string, string>; nombre?: string }

// ─── Constantes ───────────────────────────────────────────────────────────────
const STATUTS = ["NOUVEAU", "CONTACTÉ", "RELANCÉ", "CONVERTI", "PERDU"] as const;

const STATUT_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  NOUVEAU  : { label: "Nouveau",   color: "text-blue-700",  bg: "bg-blue-100",   icon: "🆕" },
  CONTACTÉ : { label: "Contacté",  color: "text-amber-700", bg: "bg-amber-100",  icon: "📞" },
  RELANCÉ  : { label: "Relancé",   color: "text-orange-700",bg: "bg-orange-100", icon: "🔄" },
  CONVERTI : { label: "Converti",  color: "text-green-700", bg: "bg-green-100",  icon: "✅" },
  PERDU    : { label: "Perdu",     color: "text-gray-500",  bg: "bg-gray-100",   icon: "❌" },
};

const TYPES_PRESTA = TYPES_PRESTATION; // liste commune (constants.ts)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}
// Dernier email envoyé au prospect (devis, relances R1-R3, demande d'infos et ses
// relances, devis externe). Les dates du suivi sont en "dd/mm/yyyy" (relanceDate en ISO).
function parseAnyDate(s?: string): Date | null {
  if (!s) return null;
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const d = fr ? new Date(+fr[3], +fr[2] - 1, +fr[1]) : new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dernierEmail(suivi: Suivi | undefined, externes: DevisExterne[]): { label: string; date: Date } | null {
  const c: { label: string; date: Date | null; seq: number }[] = [];
  const s = suivi || {};
  if (s.devisEnvoye || s.devisDate) c.push({ label: "Devis", date: parseAnyDate(s.devisDate), seq: 1 });
  const niv = s.relanceNiveau || 0;
  for (let i = 0; i < Math.min(niv, 3); i++) {
    // relanceDate (ISO) est partagée entre les 2 parcours → repli seulement s'il n'y a qu'un parcours.
    const fallback = i === niv - 1 && !s.infoRelanceNiveau ? s.relanceDate : undefined;
    c.push({ label: `Relance R${i + 1} (devis)`, date: parseAnyDate(s.relanceDates?.[i] || fallback), seq: 2 + i });
  }
  if (s.infosEnvoye || s.infosDate) c.push({ label: "Demande d'infos", date: parseAnyDate(s.infosDate), seq: 5 });
  const nivI = s.infoRelanceNiveau || 0;
  for (let i = 0; i < Math.min(nivI, 3); i++) {
    const fallback = i === nivI - 1 && !niv ? s.relanceDate : undefined;
    c.push({ label: `Relance R${i + 1} (demande d'infos)`, date: parseAnyDate(s.infoRelanceDates?.[i] || fallback), seq: 6 + i });
  }
  for (const d of externes) c.push({ label: `Devis externe${d.intitule ? ` · ${d.intitule}` : ""}`, date: parseAnyDate(d.date), seq: 0 });
  const dated = c.filter((x): x is { label: string; date: Date; seq: number } => !!x.date)
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.seq - a.seq);
  return dated[0] ?? null;
}
function ilYA(d: Date): string {
  const t = new Date(); const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const n = Math.round((t0.getTime() - d.getTime()) / 86400000);
  return n <= 0 ? "aujourd'hui" : n === 1 ? "hier" : `il y a ${n} jours`;
}

// ─── Onglets de relance : « seaux » calculés en dates calendrier de Paris ─────
// Aujourd'hui = en retard + du jour + leads « Nouveau » sans date (à contacter
// le jour même). Les autres onglets sont disjoints : demain, J+2→J+3, J+4→J+7.
type Bucket = "urgent" | "demain" | "j3" | "j7" | "plus_tard" | "sans_date" | "inactif";
type Onglet = "urgent" | "demain" | "j3" | "j7" | "ACTIFS" | "TOUS";
const ONGLETS: Onglet[] = ["urgent", "demain", "j3", "j7", "ACTIFS", "TOUS"];
const ONGLET_KEY = "prospects.onglet"; // dernier onglet choisi (localStorage)
const ONGLET_LABEL: Record<Onglet, string> = {
  urgent: "Aujourd'hui", demain: "Demain", j3: "Dans 3 jours", j7: "Cette semaine", ACTIFS: "Tous les actifs", TOUS: "Tous",
};
interface RefDates { t0: string; t1: string; t3: string; t7: string }
const refDates = (): RefDates => ({ t0: isoParis(0), t1: isoParis(1), t3: isoParis(3), t7: isoParis(7) });
const estActif = (p: { statut: string }) => p.statut !== "CONVERTI" && p.statut !== "PERDU";
const jourIso = (d?: string) => (d || "").slice(0, 10);
// Écart en jours entre deux dates "YYYY-MM-DD" (b − a).
const ecartJours = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function bucketOf(p: { statut: string; dateRelance: string }, r: RefDates = refDates()): Bucket {
  if (!estActif(p)) return "inactif";
  const d = jourIso(p.dateRelance);
  if (!d) return p.statut === "NOUVEAU" ? "urgent" : "sans_date";
  if (d <= r.t0) return "urgent";
  if (d === r.t1) return "demain";
  if (d <= r.t3) return "j3";
  if (d <= r.t7) return "j7";
  return "plus_tard";
}
const ongletDe = (b: Bucket): Onglet => b === "inactif" ? "TOUS" : (b === "plus_tard" || b === "sans_date") ? "ACTIFS" : b;
// Libellé de destination pour les toasts (« Demain », « Tous les actifs (relance le 12/11) »…).
function destinationLabel(p: { statut: string; dateRelance: string }): string {
  const b = bucketOf(p);
  if (b === "plus_tard") return `Tous les actifs (relance le ${jjmm(jourIso(p.dateRelance))})`;
  if (b === "sans_date") return "Tous les actifs (sans date)";
  return ONGLET_LABEL[ongletDe(b)];
}
// Rang de tri : en retard → aujourd'hui → nouveaux leads → à venir → sans date → archivés.
function rangRelance(p: Prospect, r: RefDates): number {
  if (!estActif(p)) return 5;
  const d = jourIso(p.dateRelance);
  if (!d) return p.statut === "NOUVEAU" ? 2 : 4;
  return d < r.t0 ? 0 : d === r.t0 ? 1 : 3;
}
const SECTIONS_URGENT: Record<number, string> = { 0: "En retard", 1: "Aujourd'hui", 2: "Nouveaux leads" };

// Pastille « prochaine relance » d'une ligne de liste : dit quoi faire et quand.
function relanceChip(p: Prospect, r: RefDates): { text: string; cls: string } | null {
  if (!estActif(p)) return null;
  const d = jourIso(p.dateRelance);
  if (!d) return p.statut === "NOUVEAU" ? { text: "À contacter", cls: "bg-red-50 text-red-600 border-red-200" } : null;
  const n = ecartJours(r.t0, d);
  if (n < 0)  return { text: `En retard ${-n} j`, cls: "bg-red-100 text-red-700 border-red-200" };
  if (n === 0) return { text: "Aujourd'hui", cls: "bg-orange-50 text-orange-700 border-orange-200" };
  if (n === 1) return { text: "Demain", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  if (n <= 7)  return { text: `Dans ${n} j`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { text: `Le ${jjmm(d)}`, cls: "bg-gray-50 text-gray-500 border-gray-200" };
}

// ─── Journal : dates relatives (« aujourd'hui 14:05 », « hier », « il y a 3 j ») ─
const TZ_PARIS = "Europe/Paris";
const jourParisDe = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ_PARIS });
function quandRelatif(jour: string, heure?: string): string {
  const n = ecartJours(jour, isoParis(0));
  if (n <= 0) return heure ? `aujourd'hui ${heure}` : "aujourd'hui";
  if (n === 1) return heure ? `hier ${heure}` : "hier";
  if (n < 30) return `il y a ${n} j`;
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: n > 300 ? "numeric" : undefined });
}
// Date du suivi ("dd/mm/yyyy", ISO ou "YYYY-MM-DD") → jour "YYYY-MM-DD".
function jourDeSuivi(s?: string): string | null {
  if (!s) return null;
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : jourParisDe(d);
}

interface EvtJournal { key: string; auto: boolean; icon: string; texte: string; tri: number; quand: string; titre: string; note?: Commentaire; pending?: boolean }

// Événements automatiques tirés du suivi (emails envoyés depuis la fiche) — non modifiables.
// Les devis externes ne sont pas repris ici : leur ajout / envoi écrit déjà une ligne dans le journal.
function evenementsAuto(s: Suivi | undefined): EvtJournal[] {
  const out: EvtJournal[] = [];
  const v = s || {};
  const add = (jour: string | null, icon: string, texte: string, seq: number) => {
    if (!jour) return;
    out.push({ key: `auto-${seq}`, auto: true, icon, texte, tri: Date.parse(`${jour}T12:00:00Z`) + seq, quand: quandRelatif(jour), titre: `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` });
  };
  const niv = v.relanceNiveau || 0, nivI = v.infoRelanceNiveau || 0;
  if (v.devisEnvoye || v.devisDate) add(jourDeSuivi(v.devisDate), "📄", `Devis${v.devisNum ? ` n° ${v.devisNum}` : ""} envoyé par email`, 1);
  for (let i = 0; i < Math.min(niv, 3); i++) {
    const fallback = i === niv - 1 && !nivI ? v.relanceDate : undefined;
    add(jourDeSuivi(v.relanceDates?.[i] || fallback), "🔁", `Relance R${i + 1} du devis envoyée`, 2 + i);
  }
  if (v.infosEnvoye || v.infosDate) add(jourDeSuivi(v.infosDate), "❓", "Demande d'infos envoyée par email", 5);
  for (let i = 0; i < Math.min(nivI, 3); i++) {
    const fallback = i === nivI - 1 && !niv ? v.relanceDate : undefined;
    add(jourDeSuivi(v.infoRelanceDates?.[i] || fallback), "🔁", `Relance R${i + 1} (demande d'infos) envoyée`, 6 + i);
  }
  return out;
}
function evenementNote(c: Commentaire, pending = false): EvtJournal {
  const d = new Date(c.date);
  const ok = !isNaN(d.getTime());
  const heure = ok ? d.toLocaleTimeString("fr-FR", { timeZone: TZ_PARIS, hour: "2-digit", minute: "2-digit" }) : "";
  const first = Array.from(c.texte)[0] || "";
  return {
    key: c.id, auto: false, note: c, pending,
    icon: (first.codePointAt(0) ?? 0) > 127 ? first : "💬",
    texte: c.texte, tri: ok ? d.getTime() : 0,
    quand: ok ? quandRelatif(jourParisDe(d), heure) : "",
    titre: ok ? d.toLocaleString("fr-FR", { timeZone: TZ_PARIS }) : "",
  };
}

// Tags rapides du journal : un tap = note ajoutée + proposition de reprogrammation
// (reco en jours : 0 = à garder aujourd'hui, 1 = demain, 3, 7…).
const CHIPS_JOURNAL = [
  { emoji: "📞", label: "Appel passé",    reco: 3 },
  { emoji: "💬", label: "DM envoyé",      reco: 1 },
  { emoji: "📧", label: "Email envoyé",   reco: 1 },
  { emoji: "🎯", label: "Très intéressé", reco: 0 },
  { emoji: "💤", label: "Pas disponible", reco: 7 },
  { emoji: "💶", label: "Devis demandé",  reco: 0 },
  { emoji: "❌", label: "Pas de réponse", reco: 1 },
];
const REPROG = [
  { jours: 0, label: "Aujourd'hui" },
  { jours: 1, label: "Demain" },
  { jours: 3, label: "+3 j" },
  { jours: 7, label: "+1 sem" },
];

// ─── Composant : Badge statut ─────────────────────────────────────────────────
function StatutBadge({ statut, small }: { statut: string; small?: boolean }) {
  const m = STATUT_META[statut] ?? { label: statut, color: "text-gray-600", bg: "bg-gray-100", icon: "" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${m.bg} ${m.color} ${small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`}>
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}

// ─── Prestations souhaitées : helpers (toNum / nbOf / fmtEur : @/components/AddProspectModal) ──
// Montant FR pour l'affichage : 370 → « 370 € », 33.3 → « 33,30 € ».
const eurFr = (n: number) => {
  const r = Math.round(n * 100) / 100;
  const dec = Number.isInteger(r) ? 0 : 2;
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(r) + " €";
};
// Badge court d'une réduction : « −10 % » / « −30 € ».
const remiseCourte = (r: DevisRemise) => r.type === "pct" ? `−${String(r.valeur).replace(".", ",")} %` : `−${eurFr(r.valeur)}`;

// ─── Composant : Prochaine relance (date + reprogrammation en 1 tap) ─────────
function RelanceRapide({ dateRelance, statut, saving, onSet }: {
  dateRelance: string; statut: string; saving: boolean;
  onSet: (date: string, msg: string) => void;
}) {
  const d = jourIso(dateRelance);
  const chip = relanceChip({ dateRelance, statut } as Prospect, refDates());
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1"><Calendar size={13} /> Prochaine relance</p>
        {chip ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${chip.cls}`}>{chip.text}</span>
          : <span className="text-[11px] text-gray-400">aucune date</span>}
        {saving && <Loader2 size={12} className="animate-spin text-gray-400" />}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {REPROG.map(r => {
          const iso = isoParis(r.jours);
          const actif = d === iso;
          return (
            <button key={r.label} type="button" disabled={saving}
              onClick={() => onSet(iso, r.jours === 0 ? "À rappeler aujourd'hui" : `Relance ${r.label === "Demain" ? "demain" : r.label}`)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                actif ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700"
              }`}>
              {r.label}
            </button>
          );
        })}
        {d && (
          <button type="button" disabled={saving} onClick={() => onSet("", "Relance retirée")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 disabled:opacity-50">
            Retirer
          </button>
        )}
        {/* Date précise (ex. « rappelez-moi le 15 ») */}
        <input type="date" value={d} aria-label="Date de relance précise"
          onChange={e => onSet(e.target.value, e.target.value ? `Relance le ${jjmm(e.target.value)}` : "Relance retirée")}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
    </div>
  );
}

// ─── Composant : Journal des échanges (notes + emails envoyés, plus récent en haut) ─
function JournalEchanges({ commentaires, pending, suivi, onAdd, onDelete, onReprogrammer }: {
  commentaires: Commentaire[];
  pending: Commentaire[];
  suivi?: Suivi;
  onAdd: (texte: string) => void;
  onDelete: (c: Commentaire) => void;
  onReprogrammer: (jours: number) => void;
}) {
  const [texte, setTexte] = useState("");
  const [suggestion, setSuggestion] = useState<{ label: string; reco: number } | null>(null);
  const [toutVoir, setToutVoir] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const evts = useMemo(() => {
    // Une relance envoyée par le cron a déjà sa note « 🤖 Relance R2 envoyée
    // automatiquement » : on n'affiche pas en double la ligne tirée du suivi.
    const dejaNotees = new Set<string>();
    for (const c of commentaires) {
      const m = c.texte.match(/^🤖 Relance R(\d) envoyée automatiquement( \(demande d'infos\))?/);
      if (m) dejaNotees.add(`auto-${(m[2] ? 5 : 1) + Number(m[1])}`);
    }
    return [
      ...commentaires.map(c => evenementNote(c)),
      ...pending.map(c => evenementNote(c, true)),
      ...evenementsAuto(suivi).filter(e => !dejaNotees.has(e.key)),
    ].sort((a, b) => b.tri - a.tri);
  }, [commentaires, pending, suivi]);
  const LIMITE = 6;
  const visibles = toutVoir ? evts : evts.slice(0, LIMITE);

  // Saisie libre : Entrée envoie, le champ garde le focus (on enchaîne les notes).
  function envoyer() {
    const t = texte.trim();
    if (!t) return;
    onAdd(t);
    setTexte("");
    setSuggestion(null);
    inputRef.current?.focus();
  }
  // Tag rapide : ajoute la note en UN tap (avec le texte déjà tapé s'il y en a).
  function tag(emoji: string, label: string, reco: number) {
    const t = texte.trim();
    onAdd(t ? `${emoji} ${label} — ${t}` : `${emoji} ${label}`);
    setTexte("");
    setSuggestion({ label, reco });
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <MessageSquare size={12} />
        Journal des échanges {evts.length > 0 && <span className="text-gray-400 font-normal normal-case">({evts.length})</span>}
      </p>

      {/* Tags rapides — défilement horizontal sur mobile */}
      <div className="flex gap-1.5 mb-2 overflow-x-auto sm:flex-wrap -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CHIPS_JOURNAL.map(({ emoji, label, reco }) => (
          <button key={label} type="button" onClick={() => tag(emoji, label, reco)}
            className="shrink-0 whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 text-xs text-gray-600 border border-gray-200 hover:border-blue-200 transition-colors">
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* Suggestion de reprogrammation après un tag */}
      {suggestion && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
          <span className="font-medium">{suggestion.reco === 0 ? "👍 À garder aujourd'hui · ou reprogrammer :" : "Reprogrammer :"}</span>
          {REPROG.filter(r => r.jours > 0).map(r => (
            <button key={r.jours} type="button"
              onClick={() => { onReprogrammer(r.jours); setSuggestion(null); }}
              className={`px-2.5 py-1 rounded-lg font-semibold border transition-colors ${
                r.jours === suggestion.reco ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-700 border-blue-200 hover:bg-blue-100"
              }`}>
              {r.label}
            </button>
          ))}
          <button type="button" onClick={() => setSuggestion(null)} aria-label="Ignorer" className="ml-auto text-blue-300 hover:text-blue-600 p-0.5"><X size={13} /></button>
        </div>
      )}

      {/* Saisie libre */}
      <div className="flex gap-2 mb-3">
        <input ref={inputRef} type="text" value={texte} enterKeyHint="send"
          onChange={e => setTexte(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
          placeholder="Ajouter une note… (Entrée pour valider)"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <button type="button" onClick={envoyer} disabled={!texte.trim()} aria-label="Ajouter la note"
          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Timeline unique : notes manuelles + emails envoyés (gris, non modifiables) */}
      <div className="space-y-1.5">
        {evts.length === 0 && <p className="text-xs text-gray-400 italic text-center py-3">Aucun échange pour le moment</p>}
        {visibles.map(e => e.auto ? (
          <div key={e.key} className="flex gap-2.5 items-center px-1" title={e.titre}>
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[11px] shrink-0 grayscale">{e.icon}</div>
            <p className="flex-1 text-xs text-gray-500 leading-snug">
              <Mail size={10} className="inline -mt-0.5 mr-1 text-gray-400" />{e.texte}
            </p>
            <span className="text-[10px] text-gray-400 shrink-0">{e.quand}</span>
          </div>
        ) : (
          <div key={e.key} className={`flex gap-2.5 items-start group ${e.pending ? "opacity-60" : ""}`}>
            <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-xs shrink-0 mt-0.5">{e.icon}</div>
            <div className="flex-1 min-w-0 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
              <p className="text-[10px] text-gray-400 mb-0.5" title={e.titre}>{e.pending ? "enregistrement…" : e.quand}</p>
              <p className="text-sm text-gray-800 leading-snug break-words">{e.texte}</p>
            </div>
            {!e.pending && e.note && (
              <button type="button" onClick={() => onDelete(e.note!)} title="Supprimer cette note" aria-label="Supprimer cette note"
                className="sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 transition-all shrink-0 mt-0.5">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {evts.length > LIMITE && (
          <button type="button" onClick={() => setToutVoir(v => !v)} className="w-full text-xs text-blue-600 font-medium py-1.5 hover:underline">
            {toutVoir ? "Réduire" : `Voir tout (${evts.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Composant : Modal détail / édition ───────────────────────────────────────
// Navigation « Suivant » dans la liste de l'onglet d'où la fiche a été ouverte.
interface FicheNav { pos: number; total: number; nextName?: string; onNext?: () => void }

function ProspectModal({
  prospect, prestataires, onClose, onUpdated, onDeleted, onConverted, nav,
}: {
  prospect: Prospect;
  prestataires: Prestataire[];
  onClose: () => void;
  // `msg` (facultatif) : action explicite → la page affiche le toast « → déplacé dans … ».
  onUpdated: (p: Partial<Prospect> & { id: string }, msg?: string) => void;
  onDeleted: (id: string) => void;
  onConverted: (id: string) => void;
  nav?: FicheNav;
}) {
  const [p, setP] = useState<Prospect>({ ...prospect, genre: prospect.genre ?? "", relanceSteps: prospect.relanceSteps ?? [] });
  const [pendingNotes, setPendingNotes] = useState<Commentaire[]>([]); // notes en cours d'enregistrement (affichage optimiste)
  const [doneMsg, setDoneMsg] = useState("");                          // dernière action faite (bandeau « Suivant »)
  const [saving, setSaving]         = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [convertedClientId, setConvertedClientId] = useState<string>(""); // fiche créée par la conversion
  const [ficheClientId, setFicheClientId] = useState<string>("");         // fiche client ouverte par-dessus
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameForm, setNameForm] = useState({ prenom: prospect.prenom, nom: prospect.nom });
  const [editingCoord, setEditingCoord] = useState(false);
  const [coordForm, setCoordForm] = useState({ tel: prospect.tel, email: prospect.email, adresse: prospect.adresse, budget: prospect.budget });
  const [draft, setDraft] = useState<Besoin>({ typePresta: "", quantite: "1", prix: "" }); // saisie d'une prestation souhaitée
  // Multiplicateur prix unitaire × nombre pour le besoin en cours (ex. 4 tapis identiques).
  const [besoinUnit, setBesoinUnit] = useState("");
  const [besoinNb,   setBesoinNb]   = useState("1");
  const applyBesoinPrix = (unit: string, nb: string) => {
    setBesoinUnit(unit); setBesoinNb(nb);
    const u = parseFloat(unit.replace(",", ".")) || 0; const n = Math.max(1, parseInt(nb) || 1);
    setDraft(x => ({ ...x, prix: u > 0 ? String(Number((u * n).toFixed(2))) : "" }));
  };
  const [draftStatut, setDraftStatut] = useState<string>(prospect.statut); // statut choisi, en attente de validation
  const [actionBusy, setActionBusy] = useState<"" | "devis" | "relance" | "avance" | "infos" | "relance_infos" | "auto" | "remise">("");
  // Panneau « Appliquer une réduction » (devis) : saisie locale avant enregistrement.
  const [remiseOpen, setRemiseOpen] = useState(false);
  const [remiseType, setRemiseType] = useState<"pct" | "eur">("pct");
  const [remiseVal, setRemiseVal] = useState("10");
  const toast = useToast();
  const [devisExt, setDevisExt] = useState<DevisExterne[]>([]); // devis externes (pour « dernier email »)
  // Dernier état connu (pour les écritures asynchrones enchaînées du journal).
  const pRef = useRef(p);
  pRef.current = p;
  // File d'écritures du journal : les notes partent une par une (le serveur fait
  // lecture → ajout → écriture, deux envois simultanés pourraient s'écraser).
  const noteQueue = useRef<Promise<void>>(Promise.resolve());

  async function patch(updates: Record<string, unknown>, msg?: string): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/prospects/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const msg = String(d.error || "");
        toast.error("besoins" in updates && /besoins/i.test(msg)
          ? "Colonne « besoins » manquante — lance le SQL (une seule fois)."
          : (d.error || "Échec de l'enregistrement"));
        return false;
      }
      setP(prev => ({ ...prev, ...updates } as Prospect));
      onUpdated({ id: p.id, ...updates } as Partial<Prospect> & { id: string }, msg);
      return true;
    } catch {
      toast.error("Échec de l'enregistrement");
      return false;
    } finally { setSaving(false); }
  }

  // Reprogrammation rapide (chips Aujourd'hui / Demain / +3 j / +1 sem / Retirer).
  // Passe dans la file du journal : une note encore en cours d'envoi (qui remet la
  // relance à aujourd'hui côté serveur) ne peut pas écraser la nouvelle date.
  function reprogrammer(date: string, msg: string) {
    noteQueue.current = noteQueue.current.then(async () => {
      if (await patch({ dateRelance: date }, msg)) setDoneMsg(msg);
    });
  }

  // Sélection d'un statut. Choisir « Relancé » pose une date de relance par
  // défaut au lendemain (si aucune n'est encore fixée) — modifiable juste en dessous.
  function chooseStatut(s: string) {
    setDraftStatut(s);
    if (s === "RELANCÉ" && !p.dateRelance) {
      patch({ dateRelance: isoParis(1) });
    }
  }

  // Prestations souhaitées (besoins) — mêmes champs que la fiche client.
  function addBesoin() {
    if (!draft.typePresta) return;
    const updates: Record<string, unknown> = {
      besoins: [...(p.besoins || []), { typePresta: draft.typePresta, quantite: draft.quantite || "1", prix: draft.prix || "", details: draft.details, nombre: String(Math.max(1, parseInt(besoinNb) || 1)) }],
    };
    // Dès qu'on note un besoin, le prospect n'est plus « Nouveau ».
    if (p.statut === "NOUVEAU") { updates.statut = "CONTACTÉ"; setDraftStatut("CONTACTÉ"); }
    patch(updates);
    setDraft({ typePresta: "", quantite: "1", prix: "" });
    setBesoinUnit(""); setBesoinNb("1");
  }
  function removeBesoin(i: number) {
    patch({ besoins: (p.besoins || []).filter((_, j) => j !== i) });
  }
  // Modification d'une ligne existante : nombre (stepper) et prix unitaire.
  // prix = TOTAL de la ligne ; par défaut on garde le prix unitaire.
  const [nbChoix,  setNbChoix]  = useState<{ i: number; nb: number } | null>(null); // ancienne ligne sans `nombre`
  const [prixEdit, setPrixEdit] = useState<{ i: number; val: string } | null>(null);
  function majBesoin(i: number, upd: Partial<Besoin>) {
    const list = [...(p.besoins || [])];
    if (!list[i]) return;
    list[i] = { ...list[i], ...upd };
    patch({ besoins: list });
  }
  function appliquerNombre(i: number, nb: number, garderTotal: boolean) {
    const b = (p.besoins || [])[i]; if (!b) return;
    const prix = toNum(b.prix);
    const nouveauPrix = prix > 0 && !garderTotal ? fmtEur(prix / nbOf(b.nombre) * nb) : b.prix;
    setNbChoix(null);
    majBesoin(i, { nombre: String(nb), prix: nouveauPrix });
  }
  function changerNombre(i: number, nb: number) {
    const b = (p.besoins || [])[i]; if (!b || nb < 1) return;
    // Ancienne ligne (pas de `nombre`) avec un prix : on demande si le prix était déjà le total.
    if (!b.nombre && toNum(b.prix) > 0 && nb > 1) { setNbChoix({ i, nb }); return; }
    appliquerNombre(i, nb, false);
  }
  function validerPrixUnit() {
    if (!prixEdit) return;
    const b = (p.besoins || [])[prixEdit.i];
    const u = toNum(prixEdit.val);
    setPrixEdit(null);
    if (!b) return;
    const nouveau = u > 0 ? fmtEur(u * nbOf(b.nombre)) : "";
    if (nouveau !== (b.prix || "")) majBesoin(prixEdit.i, { prix: nouveau });
  }

  // ── Suivi commercial : envoi du devis + relances (mails manuels) ──
  // Avance immédiate activée par défaut (suivi.avanceImmediate !== false).
  const avanceActive = p.suivi?.avanceImmediate !== false;

  // ── Réduction sur le devis (suivi.remise) — même calcul que le devis HTML/PDF ──
  const remiseActive = p.suivi?.remise && p.suivi.remise.valeur > 0 ? p.suivi.remise : null;
  const sousTotalDevis = (() => {
    const t = (p.besoins || []).reduce((acc, b) => acc + toNum(b.prix), 0);
    return t > 0 ? t : toNum(p.budget);
  })();
  const remiseSaisie: DevisRemise | null = (() => {
    const v = parseFloat(remiseVal.replace(",", "."));
    return v > 0 ? { type: remiseType, valeur: Math.round(v * 100) / 100 } : null;
  })();
  const remiseSaisieErreur = !remiseSaisie ? "Indique une valeur."
    : remiseSaisie.type === "pct" && (remiseSaisie.valeur < 1 || remiseSaisie.valeur > 50) ? "Entre 1 % et 50 %."
    : remiseSaisie.type === "eur" && remiseSaisie.valeur >= sousTotalDevis ? `Doit être inférieure à ${eurFr(sousTotalDevis)}.`
    : "";
  function ouvrirRemise() {
    if (remiseActive) { setRemiseType(remiseActive.type); setRemiseVal(String(remiseActive.valeur).replace(".", ",")); }
    else { setRemiseType("pct"); setRemiseVal("10"); }
    setRemiseOpen(o => !o);
  }
  async function enregistrerRemise(remise: DevisRemise | null) {
    setActionBusy("remise");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_remise", remise }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi }));
      onUpdated({ id: p.id, suivi: d.suivi });
      setRemiseOpen(false);
      toast.success(remise ? `Réduction ${remiseCourte(remise)} appliquée au devis` : "Réduction retirée du devis");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionBusy(""); }
  }

  async function setAvance(value: boolean) {
    setActionBusy("avance");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_avance", value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi }));
      onUpdated({ id: p.id, suivi: d.suivi });
      toast.success(value ? "Avance immédiate activée" : "Avance immédiate retirée");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionBusy(""); }
  }

  // WhatsApp du jour (gratuit, lien wa.me prérempli) : même étape que l'email parti
  // aujourd'hui. Au clic, le lien s'ouvre ET l'envoi est noté (suivi + journal).
  const waEtape = waAEnvoyer(p, isoParis(0));
  function noterWa(etape: WaEtape) {
    // Optimiste : le bouton disparaît tout de suite.
    const optimiste: Suivi = { ...(p.suivi || {}), waEnvois: { ...(p.suivi?.waEnvois || {}), [etape]: isoParis(0) } };
    setP(prev => ({ ...prev, suivi: optimiste }));
    fetch(`/api/prospects/${p.id}/relance`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "wa_envoye", etape }),
    }).then(async res => {
      const d = await res.json().catch(() => ({}));
      if (!res.ok && !d.suivi) throw new Error(d.error || "Erreur");
      const commentaires = d.commentaire ? [...(pRef.current.commentaires || []), d.commentaire] : pRef.current.commentaires;
      setP(prev => ({ ...prev, suivi: d.suivi, commentaires }));
      onUpdated({ id: p.id, suivi: d.suivi, commentaires });
      if (d.error) toast.error(d.error); else toast.success(`${waLibelle(etape)} notée comme envoyée par WhatsApp`);
    }).catch(e => toast.error(e instanceof Error ? e.message : "WhatsApp envoyé, mais non noté dans le suivi"));
  }

  // Relances automatiques (activées par défaut, suivi.autoRelance !== false) — aucun email envoyé.
  async function setAuto(value: boolean) {
    setActionBusy("auto");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_auto", value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi }));
      onUpdated({ id: p.id, suivi: d.suivi });
      toast.success(value ? "Relances automatiques activées" : "Relances automatiques désactivées pour ce prospect");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionBusy(""); }
  }

  async function envoyerDevis() {
    const dest = p.email || "(aucun email)";
    if (!confirm(`Envoyer le DEVIS par email à ${p.prenom} ${p.nom} (${dest}) ?\n\nLe devis sera joint au message${avanceActive ? ", avec l'explication de l'avance immédiate (−50 %)" : ""}${remiseActive ? `, réduction ${remiseCourte(remiseActive)} incluse` : ""}.`)) return;
    setActionBusy("devis");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "devis_envoye" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      const statut = p.statut === "NOUVEAU" ? "CONTACTÉ" : p.statut;
      setP(prev => ({ ...prev, suivi: d.suivi, statut, dateRelance: d.dateRelance ?? prev.dateRelance }));
      setDraftStatut(statut);
      onUpdated({ id: p.id, suivi: d.suivi, statut, dateRelance: d.dateRelance }, d.pdf ? "Devis (PDF) envoyé 📧" : "Devis envoyé 📧");
      setDoneMsg("Devis envoyé");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionBusy(""); }
  }

  async function retirerDevis() {
    setActionBusy("devis");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "devis_envoye", unmark: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi }));
      onUpdated({ id: p.id, suivi: d.suivi });
      toast.success("Marque « devis envoyé » retirée");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionBusy(""); }
  }
  async function envoyerRelance() {
    const niveau = Math.min((p.suivi?.relanceNiveau || 0) + 1, 3);
    if (!confirm(`Envoyer la RELANCE ${niveau} par email à ${p.prenom} ${p.nom} ?\n\n(À ne faire que si le prospect n'a pas répondu.)`)) return;
    setActionBusy("relance");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "relance" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi, statut: "RELANCÉ", dateRelance: d.dateRelance ?? prev.dateRelance }));
      setDraftStatut("RELANCÉ");
      onUpdated({ id: p.id, suivi: d.suivi, statut: "RELANCÉ", dateRelance: d.dateRelance }, `Relance ${d.niveau} envoyée 📧`);
      setDoneMsg(`Relance ${d.niveau} envoyée`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur d'envoi"); }
    finally { setActionBusy(""); }
  }

  // ── Parcours « demande d'informations » (prospect injoignable) ──
  async function envoyerDemandeInfos() {
    const dest = p.email || "(aucun email)";
    if (!confirm(`Envoyer une DEMANDE D'INFORMATIONS par email à ${p.prenom} ${p.nom} (${dest}) ?`)) return;
    setActionBusy("infos");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demande_infos" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      const statut = p.statut === "NOUVEAU" ? "CONTACTÉ" : p.statut;
      setP(prev => ({ ...prev, suivi: d.suivi, statut, dateRelance: d.dateRelance ?? prev.dateRelance }));
      setDraftStatut(statut);
      onUpdated({ id: p.id, suivi: d.suivi, statut, dateRelance: d.dateRelance }, "Demande d'infos envoyée 📧");
      setDoneMsg("Demande d'infos envoyée");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur d'envoi"); }
    finally { setActionBusy(""); }
  }

  async function envoyerRelanceInfos() {
    const niveau = Math.min((p.suivi?.infoRelanceNiveau || 0) + 1, 3);
    if (!confirm(`Envoyer la RELANCE ${niveau} (demande d'infos) par email à ${p.prenom} ${p.nom} ?\n\n(À ne faire que si le prospect n'a pas répondu.)`)) return;
    setActionBusy("relance_infos");
    try {
      const res = await fetch(`/api/prospects/${p.id}/relance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "relance_infos" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setP(prev => ({ ...prev, suivi: d.suivi, statut: "RELANCÉ", dateRelance: d.dateRelance ?? prev.dateRelance }));
      setDraftStatut("RELANCÉ");
      onUpdated({ id: p.id, suivi: d.suivi, statut: "RELANCÉ", dateRelance: d.dateRelance }, `Relance ${d.niveau} (infos) envoyée 📧`);
      setDoneMsg(`Relance ${d.niveau} (infos) envoyée`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur d'envoi"); }
    finally { setActionBusy(""); }
  }

  // Journal : ajout optimiste (la note s'affiche tout de suite, grisée jusqu'à la
  // confirmation serveur). Ajouter une note = action faite → « à recontacter »
  // aujourd'hui (sauf relance future déjà posée) + sortie de « Nouveau ».
  function addNote(texte: string) {
    const temp: Commentaire = { id: `tmp-${crypto.randomUUID()}`, date: new Date().toISOString(), texte };
    setPendingNotes(prev => [...prev, temp]);
    noteQueue.current = noteQueue.current.then(async () => {
      try {
        const res = await fetch(`/api/prospects/${p.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addComment: texte }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.comment) throw new Error(d.error || "Note non enregistrée");
        const cur = pRef.current;
        const next = {
          ...cur,
          commentaires: [...cur.commentaires, d.comment as Commentaire],
          dateRelance : d.dateRelance ?? cur.dateRelance,
          statut      : d.statut ?? cur.statut,
        };
        pRef.current = next;
        setP(next);
        setDraftStatut(prev => prev === cur.statut ? next.statut : prev);
        onUpdated({ id: cur.id, commentaires: next.commentaires, dateRelance: next.dateRelance, statut: next.statut });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Note non enregistrée");
      } finally {
        setPendingNotes(prev => prev.filter(x => x.id !== temp.id));
      }
    });
  }

  // Suppression d'une note manuelle (liste complète renvoyée en PATCH).
  function deleteNote(c: Commentaire) {
    if (!confirm(`Supprimer cette note du journal ?\n\n« ${c.texte} »`)) return;
    noteQueue.current = noteQueue.current.then(async () => {
      const before = pRef.current.commentaires;
      const updated = before.filter(x => x.id !== c.id);
      setP(prev => ({ ...prev, commentaires: updated }));
      try {
        const res = await fetch(`/api/prospects/${p.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentaires: updated }),
        });
        if (!res.ok) throw new Error();
        onUpdated({ id: p.id, commentaires: updated });
      } catch {
        setP(prev => ({ ...prev, commentaires: before }));
        toast.error("Suppression impossible");
      }
    });
  }

  // « Suivant » : on enregistre d'abord un statut choisi mais pas encore validé.
  async function suivant() {
    if (draftStatut !== p.statut) await patch({ statut: draftStatut });
    nav?.onNext?.();
  }

  // Devis externe ajouté → trace dans le journal des échanges (sans toucher statut/relance).
  async function journaliserDevis(d: DevisExterne) {
    const montant = d.montant ? ` · ${d.montant} € TTC` : "";
    const c: Commentaire = {
      id: crypto.randomUUID(), date: new Date().toISOString(),
      texte: `📄 Devis externe envoyé le ${fmtDevisDate(d.date)} : ${d.intitule || d.fichier?.nom || "devis"}${montant}`,
    };
    const updated = [...pRef.current.commentaires, c];
    try {
      const res = await fetch(`/api/prospects/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentaires: updated }),
      });
      if (!res.ok) throw new Error();
      setP(prev => ({ ...prev, commentaires: updated }));
      onUpdated({ id: p.id, commentaires: updated });
    } catch { toast.error("Devis enregistré, mais pas la ligne du journal"); }
  }

  async function handleDelete() {
    await fetch(`/api/prospects/${p.id}`, { method: "DELETE" });
    onDeleted(p.id);
    onClose();
  }

  // Après création du client via NewClientModal : on marque le prospect converti.
  // ⚠️ On NE ferme PAS ici : la modale affiche ensuite son écran de succès
  // (récap client, WhatsApp, « Voir la fiche client ») ; la fermeture se fait via onClose.
  async function handleConvertedSaved(info?: { clientId: string; prestationId: string }) {
    const clientId = info?.clientId || "";
    if (clientId) setConvertedClientId(clientId);
    try {
      const res = await fetch(`/api/prospects/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: "CONVERTI", clientId: clientId || undefined }),
      });
      // Les devis externes du prospect sont copiés sur la fiche du nouveau client (côté serveur).
      const d = await res.json().catch(() => ({}));
      if (d.devisTransferes > 0) toast.success(`${d.devisTransferes} devis externe${d.devisTransferes > 1 ? "s" : ""} repris sur la fiche client`);
    } catch { /* le client est créé ; le statut prospect suivra au prochain refresh */ }
    setP(prev => ({ ...prev, statut: "CONVERTI" }));
    setDraftStatut("CONVERTI");
    onConverted(p.id);
  }

  // Données reprises à la conversion : journal (commentaires + notes) → notes client.
  function notesPourClient(): ClientNote[] {
    const notes: ClientNote[] = (p.commentaires || []).map(c => ({ id: c.id, date: c.date, texte: c.texte, type: "📌" }));
    if (p.notes?.trim()) notes.push({ id: `prospect-notes-${p.id}`, date: p.createdAt, texte: `Note prospect : ${p.notes.trim()}`, type: "📌" });
    notes.push({
      id: `prospect-conv-${p.id}`, date: new Date().toISOString(), type: "🤝",
      texte: `Converti depuis prospect (créé le ${formatDate(p.createdAt)}${p.source ? `, source : ${p.source}` : ""})`,
    });
    // Journal client = plus récent en premier.
    return notes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  async function saveName() {
    if (!nameForm.prenom.trim()) return;
    await patch({ prenom: nameForm.prenom.trim(), nom: nameForm.nom.trim() });
    setEditingName(false);
  }

  async function saveCoord() {
    await patch({
      tel: coordForm.tel.trim(), email: coordForm.email.trim(),
      adresse: coordForm.adresse.trim(), budget: coordForm.budget.trim(),
    });
    setEditingCoord(false);
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const isActive = p.statut !== "CONVERTI" && p.statut !== "PERDU";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0">
              {p.prenom[0]?.toUpperCase()}{p.nom[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={nameForm.prenom}
                    onChange={e => setNameForm(f => ({ ...f, prenom: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="border border-gray-300 rounded px-2 py-0.5 text-sm font-bold w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Prénom"
                  />
                  <input
                    value={nameForm.nom}
                    onChange={e => setNameForm(f => ({ ...f, nom: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="border border-gray-300 rounded px-2 py-0.5 text-sm font-bold w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Nom"
                  />
                  <button onClick={saveName} className="text-green-500 hover:text-green-700 p-0.5" title="Sauvegarder"><Check size={14} /></button>
                  <button onClick={() => setEditingName(false)} className="text-gray-300 hover:text-gray-500 p-0.5" title="Annuler"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group min-w-0">
                  <h2 className="font-bold text-gray-900 truncate">{p.prenom} {p.nom}</h2>
                  <button
                    onClick={() => { setNameForm({ prenom: p.prenom, nom: p.nom }); setEditingName(true); }}
                    className="text-gray-300 hover:text-gray-500 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-0.5"
                    title="Modifier le nom"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400">{formatDate(p.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {saving && <Loader2 size={14} className="animate-spin text-gray-400" />}
            {nav && <span className="text-[11px] text-gray-400 tabular-nums">{nav.pos}/{nav.total}</span>}
            {nav?.onNext && (
              <button onClick={suivant} title={nav.nextName ? `Suivant : ${nav.nextName}` : "Prospect suivant"}
                className="flex items-center gap-0.5 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700">
                Suivant <ChevronRight size={14} />
              </button>
            )}
            <button onClick={onClose} aria-label="Fermer" className="p-1.5 hover:bg-gray-100 rounded-full"><X size={18} className="text-gray-400" /></button>
          </div>
        </div>

        {/* ── Action faite → bandeau « Suivant » (traiter la file du jour sans fermer la fiche) ── */}
        {doneMsg && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 shrink-0">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <p className="flex-1 min-w-0 text-xs text-emerald-800 leading-snug">
              <strong>{doneMsg}</strong> — {isActive ? <>maintenant dans « {destinationLabel(p)} »</> : "prospect archivé"}
            </p>
            {nav?.onNext ? (
              <button onClick={suivant}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm">
                Suivant{nav.nextName ? ` · ${nav.nextName.split(" ")[0]}` : ""} <ChevronRight size={15} />
              </button>
            ) : (
              <button onClick={async () => { if (draftStatut !== p.statut) await patch({ statut: draftStatut }); onClose(); }}
                className="shrink-0 px-3 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-700 text-sm font-semibold hover:bg-emerald-100">
                {nav ? "Fin de la liste ✓" : "Fermer"}
              </button>
            )}
          </div>
        )}

        {/* ── Actions rapides (fixes en haut de la fiche, hors zone scrollable) ── */}
        {(p.tel || p.email) && (
          <div className="flex gap-2 px-5 py-2 border-b border-gray-100 bg-white shrink-0">
            {p.tel && (
              <a
                href={`tel:${p.tel}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 active:bg-blue-100 transition-colors"
              >
                <Phone size={15} />
                Appeler
              </a>
            )}
            {p.tel && (
              <a
                href={`https://wa.me/${p.tel.replace(/\D/g, "").replace(/^0/, "33")}`}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 active:bg-green-600 transition-colors"
              >
                <MessageSquare size={15} />
                WhatsApp
              </a>
            )}
            {p.email && (
              <a
                href={`mailto:${p.email}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Mail size={15} />
                Mail
              </a>
            )}
          </div>
        )}

        {/* ── WhatsApp du jour : même relance que l'email parti aujourd'hui ── */}
        {waEtape && (() => {
          const lien = waLien(p.tel, waMessage(waEtape, waDonneesProspect(p)));
          return lien && (
            <div className="px-5 py-2 border-b border-gray-100 bg-white shrink-0">
              <a href={lien} target="_blank" rel="noopener noreferrer" onClick={() => noterWa(waEtape)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:brightness-95 active:brightness-90 shadow-sm">
                💬 Envoyer {waEtape.endsWith("-0") ? (waEtape === "devis-0" ? "l'annonce du devis" : "la demande d'infos") : `la relance ${waEtape.slice(-2)}`} sur WhatsApp
              </a>
            </div>
          );
        })()}

        {/* ── Body scrollable ── */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Dernier email envoyé (devis / relance / demande d'infos / devis externe) */}
          {(() => {
            const last = dernierEmail(p.suivi, devisExt);
            return last ? (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
                <Mail size={16} className="text-blue-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wide">Dernier email envoyé</p>
                  <p className="text-sm text-blue-900 truncate"><strong>{last.label}</strong></p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-blue-900">{last.date.toLocaleDateString("fr-FR")}</p>
                  <p className="text-[11px] text-blue-500">{ilYA(last.date)}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500">
                <Mail size={14} className="text-gray-400 shrink-0" /> Aucun email envoyé pour l&apos;instant
              </div>
            );
          })()}

          {/* Prochaine relance : reprogrammation en 1 tap (le prospect change d'onglet) */}
          {isActive && (
            <RelanceRapide dateRelance={p.dateRelance} statut={p.statut} saving={saving} onSet={reprogrammer} />
          )}

          {/* Relances automatiques (cron du matin) : interrupteur + prochaine échéance */}
          {(() => {
            const autoOn = p.suivi?.autoRelance !== false;
            const etat = etatAutoDe(p);
            const repondu = etat.etat === "reponse";
            return (
              <div className={`rounded-xl border p-3 flex items-center gap-3 ${repondu ? "bg-emerald-50 border-emerald-200" : "border-gray-200"}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">🤖 Relances automatiques</p>
                  <p className={`text-xs mt-0.5 ${repondu ? "text-emerald-700 font-medium" : etat.etat === "programmee" ? "text-blue-700" : "text-gray-500"}`}>
                    Prochaine relance auto : {libelleEtatAuto(etat)}
                  </p>
                </div>
                <button type="button" role="switch" aria-checked={autoOn} aria-label="Relances automatiques"
                  disabled={actionBusy !== ""} onClick={() => setAuto(!autoOn)}
                  className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${autoOn ? "bg-emerald-500" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoOn ? "translate-x-5" : ""}`} />
                </button>
              </div>
            );
          })()}

          {/* Journal des échanges — remonté juste sous la relance (accès sans scroller) */}
          <JournalEchanges
            commentaires={p.commentaires}
            pending={pendingNotes}
            suivi={p.suivi}
            onAdd={addNote}
            onDelete={deleteNote}
            onReprogrammer={jours => reprogrammer(isoParis(jours), jours === 1 ? "Relance demain" : `Relance ${jours === 7 ? "+1 sem" : `+${jours} j`}`)}
          />

          {/* Suivi commercial : devis envoyé + relances email (100% manuel) */}
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Bell size={12} className="text-blue-500" /> Suivi commercial
            </p>

            {/* Avance immédiate (−50 %) — activée par défaut, décocher si le client n'en veut pas */}
            <button type="button" onClick={() => setAvance(!avanceActive)} disabled={actionBusy !== ""}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm transition-all disabled:opacity-60 ${
                avanceActive ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-200"
              }`}>
              <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${avanceActive ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${avanceActive ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
              <span className="flex-1 text-left">
                <span className={`font-semibold ${avanceActive ? "text-emerald-800" : "text-gray-600"}`}>Avance immédiate (−50 %)</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  {avanceActive ? "Le client ne paie que la moitié — mis en avant dans le devis + le mail." : "Devis au tarif plein (crédit d'impôt classique)."}
                </span>
              </span>
              {actionBusy === "avance" && <Loader2 size={14} className="animate-spin text-emerald-600" />}
            </button>

            {/* Réduction sur le devis (ligne globale dans les totaux, le client voit son économie) */}
            <button type="button" onClick={ouvrirRemise} disabled={actionBusy !== "" || !(sousTotalDevis > 0)}
              title={sousTotalDevis > 0 ? "Appliquer une réduction sur le devis" : "Ajoute d'abord une prestation souhaitée avec son prix"}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm transition-all disabled:opacity-50 ${
                remiseActive ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200 hover:bg-gray-50"
              }`}>
              <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${remiseActive ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"}`}>%</span>
              <span className="flex-1 text-left">
                {remiseActive ? (
                  <>
                    <span className="font-semibold text-emerald-800">Réduction {remiseCourte(remiseActive)} appliquée</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {eurFr(sousTotalDevis)} → {eurFr(sousTotalDevis - montantRemise(sousTotalDevis, remiseActive))} · le client économise {eurFr(montantRemise(sousTotalDevis, remiseActive))}
                    </span>
                  </>
                ) : <span className="font-semibold text-gray-700">Appliquer une réduction</span>}
              </span>
              {actionBusy === "remise" ? <Loader2 size={14} className="animate-spin text-emerald-600" /> : <span className="text-[11px] text-gray-400">{remiseOpen ? "fermer" : remiseActive ? "modifier" : ""}</span>}
            </button>

            {remiseOpen && (() => {
              const m = remiseSaisie && !remiseSaisieErreur ? montantRemise(sousTotalDevis, remiseSaisie) : 0;
              const chipCls = (on: boolean) => `min-h-[40px] px-3 rounded-lg border text-sm font-semibold transition-colors ${on ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`;
              return (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2.5">
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 10, 15, 20].map(v => (
                      <button key={v} type="button" onClick={() => { setRemiseType("pct"); setRemiseVal(String(v)); }}
                        className={chipCls(remiseType === "pct" && parseFloat(remiseVal.replace(",", ".")) === v)}>−{v} %</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" inputMode="decimal" value={remiseVal} onChange={e => setRemiseVal(e.target.value)}
                      placeholder={remiseType === "pct" ? "ex. 12" : "ex. 30"} aria-label="Valeur de la réduction"
                      className="flex-1 min-w-0 h-10 bg-white border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                      {(["pct", "eur"] as const).map(t => (
                        <button key={t} type="button" onClick={() => setRemiseType(t)}
                          className={`w-11 h-10 text-sm font-semibold ${remiseType === t ? "bg-emerald-600 text-white" : "bg-white text-gray-600"}`}>{t === "pct" ? "%" : "€"}</button>
                      ))}
                    </div>
                  </div>
                  <p className={`text-sm ${remiseSaisieErreur ? "text-amber-700" : "text-gray-700"}`}>
                    {remiseSaisieErreur ? `⚠️ ${remiseSaisieErreur}` : (
                      <>Sous-total {eurFr(sousTotalDevis)} → <span className="text-emerald-700 font-semibold">−{eurFr(m)}</span> → <strong>{eurFr(sousTotalDevis - m)}</strong></>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => remiseSaisie && enregistrerRemise(remiseSaisie)} disabled={actionBusy !== "" || !!remiseSaisieErreur}
                      className="flex-1 min-h-[40px] rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">Appliquer</button>
                    {remiseActive && (
                      <button type="button" onClick={() => enregistrerRemise(null)} disabled={actionBusy !== ""}
                        className="min-h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">Retirer la réduction</button>
                    )}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const hasPrice = !!(p.besoins && p.besoins.some(b => parseFloat(String(b.prix || "").replace(",", ".")) > 0)) || parseFloat(String(p.budget || "").replace(",", ".")) > 0;
              const canSend = hasPrice && !!p.email;
              const title = !hasPrice ? "Ajoute une prestation souhaitée AVEC son prix" : !p.email ? "Ce prospect n'a pas d'email — ajoute-le dans Coordonnées" : "Envoie le devis en pièce jointe par email";
              return (
                <>
                  {/* Envoi du devis par email (devis joint) */}
                  <button type="button" onClick={envoyerDevis} disabled={actionBusy !== "" || !canSend} title={title}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-blue-300 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-300 disabled:border-gray-200 transition-colors">
                    {actionBusy === "devis" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                    <span className="flex-1 text-left">{p.suivi?.devisEnvoye ? "Renvoyer le devis par email" : "Envoyer le devis par email"}</span>
                  </button>
                  {!canSend && (
                    <p className="text-[11px] text-amber-600 -mt-1">{!hasPrice ? "⚠️ Ajoute une prestation avec un prix." : "⚠️ Ajoute une adresse email au prospect (bloc Coordonnées)."}</p>
                  )}

                  {/* État « devis envoyé » + retrait manuel */}
                  {p.suivi?.devisEnvoye && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                      <CheckCircle2 size={15} className="shrink-0" />
                      <span className="flex-1">Devis envoyé{p.suivi?.devisDate ? ` le ${p.suivi.devisDate}` : ""}</span>
                      <button onClick={retirerDevis} disabled={actionBusy !== ""} className="text-[11px] text-gray-400 hover:text-gray-600 underline">retirer</button>
                    </div>
                  )}

                  {/* Aperçu / impression du devis */}
                  <button type="button"
                    onClick={() => window.open(`/api/prospects/${p.id}/devis?pdf=1`, "_blank")}
                    disabled={!hasPrice}
                    title={hasPrice ? "Aperçu du devis en PDF (identique à la pièce jointe)" : "Ajoute d'abord une prestation souhaitée avec son prix"}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors">
                    <FileText size={15} /> <span className="flex-1 text-left">Aperçu du devis (PDF)</span>
                    {remiseActive && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Réduction {remiseCourte(remiseActive)} appliquée</span>}
                  </button>
                </>
              );
            })()}

            {/* Relances — visibles une fois le devis envoyé */}
            {p.suivi?.devisEnvoye && (() => {
              const niv = p.suivi?.relanceNiveau || 0;
              const labels: Record<number, string> = { 1: "Relance 1 · rappel", 2: "Relance 2 · relance", 3: "Relance 3 · offre −10 %" };
              return (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-gray-400">Sans réponse ? Relance par email (à faire à la main) :</p>
                  {[1, 2, 3].map(n => {
                    const done = niv >= n;
                    const isNext = niv + 1 === n;
                    const dateEnvoi = p.suivi?.relanceDates?.[n - 1] || (n === niv && p.suivi?.relanceDate ? formatDate(p.suivi.relanceDate) : "");
                    return (
                      <div key={n} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                        done ? "bg-green-50 border-green-200 text-green-700"
                        : isNext ? "bg-white border-blue-200 text-gray-700"
                        : "bg-gray-50 border-gray-100 text-gray-400"
                      }`}>
                        <span className="flex-1">{labels[n]}</span>
                        {done ? <span className="text-xs font-medium whitespace-nowrap">✓ {dateEnvoi ? `le ${dateEnvoi}` : "envoyée"}</span>
                          : isNext ? (
                            <button onClick={envoyerRelance} disabled={actionBusy !== ""}
                              className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                              {actionBusy === "relance" ? "Envoi…" : "Envoyer"}
                            </button>
                          ) : <span className="text-[11px]">en attente</span>}
                      </div>
                    );
                  })}
                  {niv >= 3 && <p className="text-[11px] text-gray-400">Les 3 relances ont été envoyées.</p>}
                </div>
              );
            })()}
          </div>

          {/* Demande d'information : prospect contacté mais injoignable (100% manuel) */}
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={12} className="text-indigo-500" /> Demande d&apos;information
            </p>
            <p className="text-[11px] text-gray-400 -mt-1">Pour un prospect qui vous a contacté mais reste injoignable : on lui demande les infos manquantes, puis 3 relances, puis clôture.</p>

            <button type="button" onClick={envoyerDemandeInfos} disabled={actionBusy !== "" || !p.email}
              title={!p.email ? "Ce prospect n'a pas d'email — ajoute-le dans Coordonnées" : "Envoie l'email de demande d'informations"}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-indigo-300 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:bg-gray-300 disabled:border-gray-200 transition-colors">
              {actionBusy === "infos" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              <span className="flex-1 text-left">{p.suivi?.infosEnvoye ? "Renvoyer la demande d'infos" : "Envoyer une demande d'infos"}</span>
            </button>
            {!p.email && <p className="text-[11px] text-amber-600 -mt-1">⚠️ Ajoute une adresse email au prospect (bloc Coordonnées).</p>}

            {p.suivi?.infosEnvoye && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm">
                <CheckCircle2 size={15} className="shrink-0" />
                <span className="flex-1">Demande d&apos;infos envoyée{p.suivi?.infosDate ? ` le ${p.suivi.infosDate}` : ""}</span>
              </div>
            )}

            {/* Relances « infos » — visibles une fois la demande envoyée */}
            {p.suivi?.infosEnvoye && (() => {
              const niv = p.suivi?.infoRelanceNiveau || 0;
              const labels: Record<number, string> = { 1: "Relance 1 · rappel", 2: "Relance 2 · relance", 3: "Relance 3 · dernière (avant clôture)" };
              return (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-gray-400">Sans réponse ? Relance par email (à faire à la main) :</p>
                  {[1, 2, 3].map(n => {
                    const done = niv >= n;
                    const isNext = niv + 1 === n;
                    const dateEnvoi = p.suivi?.infoRelanceDates?.[n - 1] || (n === niv && p.suivi?.relanceDate ? formatDate(p.suivi.relanceDate) : "");
                    return (
                      <div key={n} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                        done ? "bg-green-50 border-green-200 text-green-700"
                        : isNext ? "bg-white border-indigo-200 text-gray-700"
                        : "bg-gray-50 border-gray-100 text-gray-400"
                      }`}>
                        <span className="flex-1">{labels[n]}</span>
                        {done ? <span className="text-xs font-medium whitespace-nowrap">✓ {dateEnvoi ? `le ${dateEnvoi}` : "envoyée"}</span>
                          : isNext ? (
                            <button onClick={envoyerRelanceInfos} disabled={actionBusy !== ""}
                              className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                              {actionBusy === "relance_infos" ? "Envoi…" : "Envoyer"}
                            </button>
                          ) : <span className="text-[11px]">en attente</span>}
                      </div>
                    );
                  })}
                  {niv >= 3 && <p className="text-[11px] text-gray-400">Les 3 relances ont été envoyées — clôture automatique en « perdu » faute de réponse.</p>}
                </div>
              );
            })()}
          </div>

          {/* Prestations souhaitées — même formulaire que la fiche client (pré-remplit la conversion) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3.5 space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
              <Star size={14} className="text-blue-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Prestations souhaitées</span>
            </div>

            {/* Liste des prestations déjà notées */}
            {(p.besoins && p.besoins.length > 0) ? (
              <div className="space-y-1.5">
                {p.besoins.map((b, i) => {
                  const nb = nbOf(b.nombre);
                  const total = toNum(b.prix);
                  const unit = total > 0 ? fmtEur(total / nb) : "";
                  const choix = nbChoix?.i === i ? nbChoix : null;
                  return (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {nb} × {b.typePresta || "—"}
                            {b.quantite && b.quantite !== "1" && <span className="text-gray-500 font-normal"> — {b.quantite}</span>}
                            {b.prix && <span className="text-green-700 font-semibold"> — {b.prix} €</span>}
                          </p>
                        </div>
                        <button onClick={() => removeBesoin(i)} title="Retirer" aria-label="Retirer"
                          className="w-10 h-10 -my-2 -mr-2 flex items-center justify-center text-gray-300 hover:text-red-600 shrink-0"><Trash2 size={15} /></button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <NbStepper fixe value={String(choix ? choix.nb : nb)} disabled={saving || !!choix}
                          onChange={v => changerNombre(i, nbOf(v))} />
                        {prixEdit?.i === i ? (
                          <div className="flex items-center gap-1">
                            <input autoFocus type="number" inputMode="decimal" min={0} step="0.01" value={prixEdit.val}
                              onChange={e => setPrixEdit({ i, val: e.target.value })}
                              onBlur={validerPrixUnit}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); validerPrixUnit(); } if (e.key === "Escape") setPrixEdit(null); }}
                              className="w-24 h-10 bg-white border border-gray-200 rounded-lg px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                            <span className="text-xs text-gray-500">€ / unité</span>
                          </div>
                        ) : (
                          <button type="button" disabled={saving || !!choix} onClick={() => setPrixEdit({ i, val: unit })}
                            className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50">
                            <Pencil size={13} className="text-gray-400" />
                            {unit ? `${unit} € / unité` : "Prix unitaire"}
                          </button>
                        )}
                      </div>
                      {choix && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-2">
                          <p className="text-xs text-amber-900">Le prix {b.prix} € est-il le total pour {choix.nb} ?</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <button type="button" onClick={() => appliquerNombre(i, choix.nb, true)}
                              className="min-h-[40px] px-2 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                              Oui (garder {b.prix} € → {choix.nb} × {fmtEur(total / choix.nb)} €)
                            </button>
                            <button type="button" onClick={() => appliquerNombre(i, choix.nb, false)}
                              className="min-h-[40px] px-2 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                              Non (prix unitaire → {choix.nb} × {b.prix} € = {fmtEur(total * choix.nb)} €)
                            </button>
                          </div>
                          <button type="button" onClick={() => setNbChoix(null)} className="text-[11px] text-amber-700 underline">Annuler</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(p.besoins.length > 1 || remiseActive) && p.besoins.some(b => toNum(b.prix) > 0) && (() => {
                  const tot = p.besoins!.reduce((s, b) => s + toNum(b.prix), 0);
                  const m = remiseActive ? montantRemise(tot, remiseActive) : 0;
                  return (
                    <div className="flex items-center justify-between gap-2 text-sm px-1 pt-0.5 flex-wrap">
                      <span className="text-gray-500 flex items-center gap-1.5">Total
                        {m > 0 && remiseActive && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Réduction {remiseCourte(remiseActive)} appliquée</span>}
                      </span>
                      {m > 0
                        ? <span><span className="text-gray-400 line-through mr-1.5">{eurFr(tot)}</span><strong className="text-emerald-700">{eurFr(tot - m)}</strong></span>
                        : <strong className="text-gray-900">{fmtEur(tot)} €</strong>}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Aucune prestation notée. Ajoute ce que le prospect souhaite (canapé, matelas, chaises…), avec les détails et le prix.</p>
            )}

            {/* Ajout d'une prestation souhaitée */}
            <div className="space-y-2 border-t border-gray-100 pt-2.5">
              <select value={draft.typePresta}
                onChange={e => setDraft({ typePresta: e.target.value, quantite: "1", prix: draft.prix })}
                className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300">
                <option value="">— Type de prestation —</option>
                {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {draft.typePresta && getSchema(draft.typePresta).length > 0 && (
                <PrestationFields typePresta={draft.typePresta} initialValues={draft.details} onDetailChange={(d, v) => setDraft(x => ({ ...x, quantite: d, details: v }))} />
              )}
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prix unitaire (€)</label>
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={besoinUnit} placeholder="ex. 210"
                    onChange={e => applyBesoinPrix(e.target.value, besoinNb)}
                    className="w-28 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => applyBesoinPrix(besoinUnit, String(Math.max(1, (parseInt(besoinNb) || 1) - 1)))} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 text-lg leading-none hover:bg-gray-50">–</button>
                    <input type="number" min={1} value={besoinNb} onChange={e => applyBesoinPrix(besoinUnit, e.target.value)} className="w-12 text-center border border-gray-200 rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    <button type="button" onClick={() => applyBesoinPrix(besoinUnit, String((parseInt(besoinNb) || 1) + 1))} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 text-lg leading-none hover:bg-gray-50">+</button>
                  </div>
                </div>
                {(parseInt(besoinNb) || 1) > 1 && draft.prix && (
                  <div className="text-sm text-gray-700 pb-1.5">= <strong>{draft.prix} €</strong></div>
                )}
              </div>
              <button onClick={addBesoin} disabled={!draft.typePresta || saving}
                className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                + Ajouter la prestation
              </button>
            </div>
            <p className="text-[11px] text-gray-400">💡 Tout ce que tu notes ici sera pré-rempli automatiquement à la conversion en client.</p>
          </div>

          {/* Devis : devis du dashboard + devis externes (faits ailleurs, envoyés à la main).
              Copiés automatiquement sur la fiche client à la conversion. */}
          <DevisExternes
            kind="prospect" ownerId={p.id}
            standard={p.suivi?.devisEnvoye ? [{
              key: "kinou", label: "Devis KinouClean (dashboard)",
              sub: p.suivi?.devisDate ? `Envoyé le ${p.suivi.devisDate}` : undefined,
              href: `/api/prospects/${p.id}/devis?pdf=1`,
            }] : []}
            onAdded={journaliserDevis}
            onListChange={setDevisExt}
            // Après un envoi par mail : on reprend la ligne 📧 écrite côté serveur (sinon
            // le prochain ajout renverrait l'ancienne liste et l'effacerait), la relance
            // reprogrammée à demain et le passage Nouveau → Contacté.
            onSent={(_d, info) => {
              const next = {
                ...p,
                commentaires: info.journal ? [...p.commentaires, info.journal] : p.commentaires,
                dateRelance : info.dateRelance ?? p.dateRelance,
                statut      : p.statut === "NOUVEAU" ? "CONTACTÉ" as Prospect["statut"] : p.statut,
              };
              setP(next);
              // msg vide : DevisExternes a déjà affiché « Envoyé à … » → la page ajoute « déplacé dans … ».
              onUpdated({ id: p.id, commentaires: next.commentaires, dateRelance: next.dateRelance, statut: next.statut }, info.dateRelance ? "" : undefined);
              if (info.dateRelance) setDoneMsg("Devis externe envoyé");
            }}
          />

          {/* Genre */}
          <div className="flex gap-2">
            {["Monsieur", "Madame"].map(g => (
              <button key={g} type="button"
                onClick={() => patch({ genre: p.genre === g ? "" : g })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  p.genre === g
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                }`}>
                {g}
              </button>
            ))}
          </div>

          {/* Statut — on choisit (le bouton se met en avant), puis on valide en bas.
              « Converti » n'est pas un statut manuel : la conversion se fait via le
              bouton « Convertir en client » plus bas. */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Statut</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATUTS.filter(s => s !== "CONVERTI").map(s => {
                const sel = draftStatut === s;
                return (
                  <button key={s} type="button" onClick={() => chooseStatut(s)}
                    className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                      sel
                        ? `${STATUT_META[s].bg} ${STATUT_META[s].color} border-current shadow-sm scale-[1.03]`
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                    }`}>
                    <span className="text-lg leading-none">{STATUT_META[s].icon}</span>
                    <span>{STATUT_META[s].label}</span>
                  </button>
                );
              })}
            </div>
            {draftStatut !== p.statut && (
              <p className="text-[11px] text-amber-600 mt-1.5">Statut modifié — clique sur <strong>Valider</strong> en bas pour enregistrer.</p>
            )}

          </div>

          {/* Infos contact */}
          <div className="relative rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">Coordonnées</p>
              {!editingCoord ? (
                <button
                  onClick={() => { setCoordForm({ tel: p.tel, email: p.email, adresse: p.adresse, budget: p.budget }); setEditingCoord(true); }}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
                  <Pencil size={12} /> Modifier
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingCoord(false)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
                  <button onClick={saveCoord} disabled={saving}
                    className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-2.5 py-1 flex items-center gap-1 disabled:opacity-50 font-medium">
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />} Enregistrer
                  </button>
                </div>
              )}
            </div>

            {editingCoord ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Téléphone</label>
                    <input value={coordForm.tel} onChange={e => setCoordForm(f => ({ ...f, tel: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="06 00 00 00 00" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Email</label>
                    <input type="email" value={coordForm.email} onChange={e => setCoordForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="email@exemple.fr" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Adresse</label>
                  <AddressAutocomplete value={coordForm.adresse} onChange={v => setCoordForm(f => ({ ...f, adresse: v }))} onSelect={a => setCoordForm(f => ({ ...f, adresse: a }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Adresse" />
                </div>
                <div className="w-1/2">
                  <label className="text-xs text-gray-400 mb-1 block">Budget estimé (€)</label>
                  <input type="number" inputMode="decimal" value={coordForm.budget} onChange={e => setCoordForm(f => ({ ...f, budget: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="ex : 190" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: Phone,    label: "Téléphone", val: p.tel,    href: p.tel ? `tel:${p.tel}` : undefined },
                  { icon: Mail,     label: "Email",     val: p.email,  href: p.email ? `mailto:${p.email}` : undefined },
                  { icon: MapPin,   label: "Adresse",   val: p.adresse },
                ].map(({ icon: Icon, label, val, href }) => val ? (
                  <div key={label} className="flex items-start gap-2 text-sm">
                    <Icon size={14} className="text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-400">{label}</p>
                      {href
                        ? <a href={href} className="text-blue-600 hover:underline font-medium">{val}</a>
                        : <p className="text-gray-800 font-medium">{val}</p>}
                    </div>
                  </div>
                ) : null)}
                {p.budget && (
                  <div className="flex items-start gap-2 text-sm">
                    <TrendingUp size={14} className="text-gray-400 mt-0.5 shrink-0" />
                    <div><p className="text-xs text-gray-400">Budget estimé</p><p className="text-gray-800 font-medium">{p.budget} €</p></div>
                  </div>
                )}
                {!p.tel && !p.email && !p.adresse && !p.budget && (
                  <p className="text-xs text-gray-400 italic">Aucune coordonnée — clique sur <strong>Modifier</strong> pour en ajouter.</p>
                )}
              </div>
            )}
            {p.source && (
              <div className="flex items-start gap-2 text-sm">
                <Users size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div><p className="text-xs text-gray-400">Source</p><p className="text-gray-800 font-medium">{p.source}</p></div>
              </div>
            )}
          </div>

          {/* Note interne — juste sous les prestations souhaitées */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Note interne</p>
            <textarea
              rows={2}
              value={p.notes}
              onChange={e => setP(prev => ({ ...prev, notes: e.target.value }))}
              onBlur={e => patch({ notes: e.target.value })}
              placeholder="Tache de sang, accès, remarques… (infos clés du prospect)"
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* ── Convertir en client (formulaire intelligent complet) ── */}
          {isActive && (
            <button
              onClick={() => setShowConvert(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              <UserCheck size={16} />
              Convertir en client
            </button>
          )}
          {/* Déjà client (même email / téléphone) : on le signale avant de convertir. */}
          {isActive && p.dejaClient && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
              <UserCheck size={18} className="text-amber-600 shrink-0" />
              <p className="flex-1 text-sm text-amber-800">Déjà client : <strong>{p.dejaClient.nom}</strong></p>
              <button onClick={() => setFicheClientId(p.dejaClient!.id)}
                className="shrink-0 text-xs font-semibold text-amber-800 underline">Voir la fiche</button>
            </div>
          )}
          {p.statut === "CONVERTI" && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-800">Converti en client !</p>
                {(convertedClientId || p.dejaClient?.id) ? (
                  <button onClick={() => setFicheClientId(convertedClientId || p.dejaClient!.id)}
                    className="text-xs text-green-700 underline">Voir la fiche client →</button>
                ) : (
                  <a href="/prestations" className="text-xs text-green-700 underline">Voir dans Prestations →</a>
                )}
              </div>
            </div>
          )}

          {p.statut === "PERDU" && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">Prospect perdu (archivé)</p>
                <p className="text-xs text-gray-500">Le client revient vers toi ? Rouvre-le pour le remettre dans le suivi.</p>
              </div>
              <button
                onClick={async () => { if (await patch({ statut: "CONTACTÉ", dateRelance: isoParis() }, "Prospect rouvert")) setDraftStatut("CONTACTÉ"); }}
                disabled={saving}
                className="shrink-0 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                <ArrowRight size={15} /> Rouvrir
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors">
              <Trash2 size={13} />
              Supprimer
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 font-medium">Confirmer ?</span>
              <button onClick={handleDelete} className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600">Oui, supprimer</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">Annuler</button>
            </div>
          )}
          <button
            onClick={async () => { if (draftStatut !== p.statut) await patch({ statut: draftStatut }); onClose(); }}
            disabled={saving}
            className="px-5 py-1.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
            <CheckCircle2 size={15} /> Valider
          </button>
        </div>
      </div>

      {/* Conversion : même formulaire intelligent que « Nouveau client », prérempli */}
      {showConvert && (
        <NewClientModal
          prestataires={prestataires}
          initialValues={{
            prenom: p.prenom, nom: p.nom, tel: p.tel, email: p.email,
            ...splitAdresse(p.adresse),
            source    : p.source || "",
            // Avance immédiate du suivi prospect (active par défaut) → choix fiscal du client.
            fiscal    : avanceActive ? "avance" : "",
            typePresta: p.besoins?.[0]?.typePresta || p.typePresta,
            quantite  : p.besoins?.[0]?.quantite || "1",
            prix      : p.besoins?.[0]?.prix || "",
          }}
          initialDetails={p.besoins?.[0]?.details}
          initialArticles={(p.besoins || []).slice(1)}
          initialNotes={notesPourClient()}
          // Fermeture après succès → on ferme aussi la fiche prospect ; Annuler → retour à la fiche.
          onClose={() => { setShowConvert(false); if (convertedClientId || p.statut === "CONVERTI") onClose(); }}
          onSaved={handleConvertedSaved}
          onVoirFiche={id => { setShowConvert(false); setFicheClientId(id); }}
        />
      )}

      {/* Fiche client (après conversion ou « Déjà client ») */}
      {ficheClientId && (
        <ClientFicheById
          clientId={ficheClientId}
          onClose={() => { setFicheClientId(""); if (convertedClientId) onClose(); }}
        />
      )}
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>(() => cacheGet<Prospect[]>(CACHE_KEYS.prospects) ?? []);
  const [loading, setLoading]     = useState(() => !cacheHas(CACHE_KEYS.prospects));
  const [search, setSearch]       = useState("");
  // Onglet par défaut : « Aujourd'hui » (la file du jour) ; le dernier choisi est mémorisé.
  const [filterRelance, setFilterRelance] = useState<Onglet>("urgent");
  const [filterStatut,  setFilterStatut]  = useState<string>("ACTIFS");
  const [showAdd, setShowAdd]     = useState(false);
  const [selected, setSelected]   = useState<Prospect | null>(null);
  // File « Suivant » : ids de la liste de l'onglet au moment où la fiche a été ouverte.
  const [queue, setQueue]         = useState<string[] | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<{ at: string; created: number; skipped: number; lastLeadName?: string; lastLeadDate?: string } | null>(null);
  const [prestataires, setPrestataires] = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/prospects");
      if (res.ok) { const d = await res.json(); setProspects(d); cacheSet(CACHE_KEYS.prospects, d); }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Onglet mémorisé (localStorage peut être indisponible : navigation privée…).
  // Lien profond depuis l'accueil (?onglet=urgent…) : prioritaire, non mémorisé.
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get("onglet") as Onglet | null;
    if (u && ONGLETS.includes(u)) { setFilterRelance(u); return; }
    try {
      const t = localStorage.getItem(ONGLET_KEY) as Onglet | null;
      if (t && ONGLETS.includes(t)) setFilterRelance(t);
    } catch { /* ignore */ }
  }, []);
  function choisirOnglet(k: Onglet) {
    setFilterRelance(k);
    try { localStorage.setItem(ONGLET_KEY, k); } catch { /* ignore */ }
  }
  // Mobile : l'onglet actif reste visible dans la rangée défilante.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [filterRelance]);

  // Cache partagé toujours à jour (retour sur la page = dates fraîches, pas l'ancien état).
  useEffect(() => {
    if (!loading) cacheSet(CACHE_KEYS.prospects, prospects);
  }, [prospects, loading]);

  // Ouverture directe d'une fiche depuis la recherche globale (?fiche=<id>),
  // quel que soit le statut (y compris PERDU / converti).
  const ficheOpenedRef = useRef(false);
  useEffect(() => {
    if (ficheOpenedRef.current || prospects.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("fiche");
    if (!id) return;
    const p = prospects.find(x => x.id === id);
    if (p) { setSelected(p); ficheOpenedRef.current = true; }
  }, [prospects]);

  // Liste des prestataires (pour pouvoir en affecter un lors de la conversion en client).
  useEffect(() => {
    fetch("/api/prestataires")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) { setPrestataires(d); cacheSet(CACHE_KEYS.prestataires, d); } })
      .catch(() => {});
  }, []);

  // Pense-bête : récupère le récap du dernier import (persisté dans settings).
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s?.inbox_last_import) { try { setLastImport(JSON.parse(s.inbox_last_import)); } catch { /* ignore */ } } })
      .catch(() => {});
  }, []);

  // Relève MANUELLE des nouveaux leads reçus par email (formulaire du site) →
  // crée les prospects manquants. Uniquement au clic : aucun import automatique.
  async function importerLeads() {
    setImporting(true);
    try {
      const res = await fetch("/api/cron/inbox?days=30");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Import impossible");
      if (d.lastImport) setLastImport(d.lastImport);
      const n = d.crees ?? 0;
      if (n > 0) { toast.success(`${n} nouveau${n > 1 ? "x" : ""} lead${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""} 🎉`); await load(); }
      else toast.success("Aucun nouveau lead — tout est déjà à jour ✅");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'import");
    } finally {
      setImporting(false);
    }
  }

  // ── Dates de référence (Paris) ──
  const ref = useMemo(() => refDates(), []);

  // ── Compteurs pour badges (mêmes définitions que les onglets) ──
  const counts = useMemo(() => {
    const c = { urgent: 0, demain: 0, j3: 0, j7: 0, actifs: 0, total: prospects.length, convertis: 0 };
    for (const p of prospects) {
      const b = bucketOf(p, ref);
      if (b === "inactif") { if (p.statut === "CONVERTI") c.convertis++; continue; }
      c.actifs++;
      if (b === "urgent" || b === "demain" || b === "j3" || b === "j7") c[b]++;
    }
    return c;
  }, [prospects, ref]);

  // ── Filtrage + tri ──
  // Une recherche porte sur TOUS les prospects (on cherche un nom, pas un onglet).
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = prospects.filter(p => {
      // Filtre statut secondaire (« Actifs » ne s'applique ni à l'onglet « Tous » ni à une recherche)
      if (filterStatut === "ACTIFS" && !estActif(p) && filterRelance !== "TOUS" && !q) return false;
      if (filterStatut !== "ACTIFS" && filterStatut !== "TOUS" && p.statut !== filterStatut) return false;
      if (q) return `${p.prenom} ${p.nom} ${p.tel} ${p.email} ${p.typePresta}`.toLowerCase().includes(q);
      // Filtre relance principal
      if (filterRelance === "ACTIFS") return estActif(p);
      if (filterRelance === "TOUS") return true;
      return bucketOf(p, ref) === filterRelance;
    });
    // Tri : en retard → aujourd'hui → nouveaux leads → à venir (date croissante) → sans date ;
    // à égalité, le plus récent d'abord.
    return [...list].sort((a, b) =>
      rangRelance(a, ref) - rangRelance(b, ref)
      || jourIso(a.dateRelance).localeCompare(jourIso(b.dateRelance))
      || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [prospects, filterRelance, filterStatut, search, ref]);

  // ── Navigation « Suivant » : prochain prospect de la file encore présent dans l'onglet ──
  const nav = useMemo<FicheNav | undefined>(() => {
    if (!selected || !queue) return undefined;
    const idx = queue.indexOf(selected.id);
    if (idx < 0) return undefined;
    const encore = new Set(sorted.map(x => x.id));
    const nextId = queue.slice(idx + 1).find(id => encore.has(id));
    const next = nextId ? prospects.find(x => x.id === nextId) : undefined;
    return {
      pos: idx + 1, total: queue.length,
      nextName: next ? `${next.prenom} ${next.nom}`.trim() : undefined,
      onNext: next ? () => setSelected(next) : undefined,
    };
  }, [selected, queue, sorted, prospects]);
  function ouvrir(p: Prospect) {
    setQueue(sorted.map(x => x.id));
    setSelected(p);
  }
  function fermer() { setSelected(null); setQueue(null); }

  // ── Mutations ──
  // Refs : les envois de la fiche sont asynchrones → on lit l'état le plus récent.
  const prospectsRef = useRef(prospects);
  prospectsRef.current = prospects;
  const ongletRef = useRef(filterRelance);
  ongletRef.current = filterRelance;

  // Mise à jour locale (+ cache via l'effet ci-dessus). Avec `msg` (action explicite :
  // envoi, reprogrammation…), toast indiquant l'onglet où le prospect est parti.
  function handleUpdated(update: Partial<Prospect> & { id: string }, msg?: string) {
    const avant = prospectsRef.current.find(x => x.id === update.id);
    setProspects(prev => prev.map(p => p.id === update.id ? { ...p, ...update } : p));
    setSelected(prev => prev && prev.id === update.id ? { ...prev, ...update } : prev);
    if (msg === undefined) return;
    if (!avant || (!("dateRelance" in update) && !("statut" in update))) { if (msg) toast.success(msg); return; }
    const apres = { ...avant, ...update } as Prospect;
    if (!estActif(apres)) { if (msg) toast.success(msg); return; }
    const r = refDates();
    const bouge = bucketOf(avant, r) !== bucketOf(apres, r);
    const dest = destinationLabel(apres);
    const texte = bouge ? `déplacé dans « ${dest} »` : `toujours dans « ${dest} »`;
    const onglet = ongletDe(bucketOf(apres, r));
    const visibleIci = ongletRef.current === "TOUS" || ongletRef.current === "ACTIFS" || ongletRef.current === onglet;
    toast.success(msg ? `${msg} → ${texte}` : texte.charAt(0).toUpperCase() + texte.slice(1), visibleIci ? undefined : {
      action: { label: "Voir", onClick: () => { choisirOnglet(onglet); fermer(); } },
    });
  }
  function handleDeleted(id: string) {
    setProspects(prev => prev.filter(p => p.id !== id));
  }
  // Suppression rapide depuis la liste (bouton corbeille), avec confirmation.
  async function deleteProspect(p: Prospect, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Supprimer définitivement le prospect « ${p.prenom} ${p.nom} » ?`)) return;
    try {
      const res = await fetch(`/api/prospects/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      handleDeleted(p.id);
      toast.success("Prospect supprimé");
    } catch {
      toast.error("Suppression impossible");
    }
  }
  function handleConverted(id: string) {
    setProspects(prev => prev.map(p => p.id === id ? { ...p, statut: "CONVERTI" } : p));
  }

  const RELANCE_FILTERS: { key: Onglet; label: string; count: number; activeClass: string; inactiveClass: string }[] = [
    { key: "urgent", label: "🔴 Aujourd'hui",    count: counts.urgent,   activeClass: "bg-red-500 text-white",    inactiveClass: "bg-red-50 text-red-600 border-red-200"    },
    { key: "demain", label: "🔵 Demain",         count: counts.demain,   activeClass: "bg-blue-500 text-white",   inactiveClass: "bg-blue-50 text-blue-600 border-blue-200"  },
    { key: "j3",     label: "🟠 Dans 3 jours",   count: counts.j3,       activeClass: "bg-orange-500 text-white", inactiveClass: "bg-orange-50 text-orange-600 border-orange-200" },
    { key: "j7",     label: "🟡 Cette semaine",  count: counts.j7,       activeClass: "bg-amber-500 text-white",  inactiveClass: "bg-amber-50 text-amber-600 border-amber-200"  },
    { key: "ACTIFS", label: "📋 Tous les actifs",count: counts.actifs,   activeClass: "bg-blue-600 text-white",   inactiveClass: "bg-gray-100 text-gray-600 border-gray-200"    },
    { key: "TOUS",   label: "Tous",              count: counts.total,    activeClass: "bg-gray-700 text-white",   inactiveClass: "bg-gray-100 text-gray-600 border-gray-200"    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Topbar
        title="Prospects"
        subtitle="Suivi et relance des contacts entrants"
        onRefresh={load}
        loading={loading}
        alerts={counts.urgent}
        onAlertsClick={() => choisirOnglet("urgent")}
        alertsLabel="à contacter aujourd'hui"
        action={
          <div className="flex items-center gap-2">
            <button onClick={importerLeads} disabled={importing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-60"
              title="Relever les nouveaux leads reçus par email (formulaire du site)">
              {importing ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              <span className="hidden sm:inline">{importing ? "Import…" : "Importer les leads"}</span>
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
              <Plus size={15} />
              <span className="hidden sm:inline">Nouveau prospect</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 p-3 sm:p-6 space-y-4">

        {/* Pense-bête du dernier import (formulaires du site → prospects) */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-xs text-blue-800 flex items-start gap-2">
          <span className="mt-0.5">🕘</span>
          <div className="leading-relaxed">
            {lastImport ? (
              <>
                <span className="font-semibold">Dernier import :</span>{" "}
                {fmtImportDateTime(lastImport.at)} · <span className="font-semibold text-blue-900">{lastImport.created} nouveau{lastImport.created > 1 ? "x" : ""}</span>, {lastImport.skipped} déjà connu{lastImport.skipped > 1 ? "s" : ""}
                {lastImport.lastLeadName && (
                  <><br />📩 Dernier formulaire capté : <span className="font-semibold">{lastImport.lastLeadName}</span>{lastImport.lastLeadDate ? ` — reçu le ${fmtImportDate(lastImport.lastLeadDate)}` : ""}</>
                )}
              </>
            ) : (
              <>Aucun import effectué pour l&apos;instant. Clique sur <span className="font-semibold">« Importer les leads »</span> pour relever les formulaires reçus.</>
            )}
            <div className="text-blue-500/80 mt-0.5">Seuls les formulaires reçus à partir du 19/09 créent des prospects · zéro doublon garanti.</div>
          </div>
        </div>


        {/* ── Stat cards compactes ── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Actifs",    val: counts.actifs,    color: "text-blue-600",   bg: "bg-blue-50",   icon: Clock       },
            { label: "À rappeler",val: counts.urgent,    color: "text-red-600",    bg: "bg-red-50",    icon: Bell        },
            { label: "Convertis", val: counts.convertis, color: "text-green-600",  bg: "bg-green-50",  icon: TrendingUp  },
            { label: "Total",     val: counts.total,     color: "text-gray-600",   bg: "bg-gray-100",  icon: Users       },
          ].map(({ label, val, color, bg, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
              <p className="text-lg font-bold text-gray-900 leading-none">{val}</p>
              <p className="text-[10px] text-gray-400 text-center leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Filtres relance (principal) ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3">
          {/* Mobile : une seule rangée qui défile horizontalement (au lieu de 3 lignes) */}
          <div ref={tabsRef} className="flex gap-1.5 overflow-x-auto sm:flex-wrap -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {RELANCE_FILTERS.map(f => (
              <button key={f.key} onClick={() => choisirOnglet(f.key)} data-active={filterRelance === f.key}
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filterRelance === f.key ? f.activeClass : f.inactiveClass + " hover:opacity-80"
                }`}>
                {f.label}
                {f.count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    filterRelance === f.key ? "bg-white/30" : "bg-white border border-current"
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filtres statut secondaires + recherche */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto sm:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { key: "ACTIFS",   label: "Actifs"    },
                { key: "NOUVEAU",  label: "Nouveaux"  },
                { key: "CONTACTÉ", label: "Contactés" },
                { key: "RELANCÉ",  label: "Relancés"  },
                { key: "CONVERTI", label: "Convertis" },
                { key: "PERDU",    label: "Perdus"    },
                { key: "TOUS",     label: "Tous"      },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterStatut(f.key)}
                  className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filterStatut === f.key ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {search.trim() && <p className="text-[11px] text-gray-400">🔎 Recherche dans tous les prospects (tous onglets)</p>}
        </div>

        {/* ── Liste triée par urgence ── */}
        {loading ? (
          <SkeletonList count={6} />
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell size={24} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">
              {filterRelance === "urgent" && !search ? "Aucun prospect à rappeler aujourd'hui 🎉" : "Aucun prospect trouvé"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {filterRelance === "urgent" && !search ? "Tu es à jour !" : "Essaie un autre filtre."}
            </p>
            {filterRelance === "urgent" && !search && counts.demain > 0 && (
              <button onClick={() => choisirOnglet("demain")} className="mt-4 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100">
                Voir Demain ({counts.demain}) →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((p, i) => {
              const chip = relanceChip(p, ref);
              const rang = rangRelance(p, ref);
              const hasRelanceTomorrow = jourIso(p.dateRelance) === ref.t1;
              const last = dernierEmail(p.suivi, []);
              const auto = etatAutoDe(p);
              // En-têtes « En retard / Aujourd'hui / Nouveaux leads » dans l'onglet Aujourd'hui (si non vides).
              const enSections = filterRelance === "urgent" && !search.trim();
              const section = enSections && (i === 0 || rangRelance(sorted[i - 1], ref) !== rang) ? SECTIONS_URGENT[rang] : undefined;

              async function quickRelance() {
                const newDate = hasRelanceTomorrow ? "" : ref.t1;
                try {
                  const res = await fetch(`/api/prospects/${p.id}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dateRelance: newDate }),
                  });
                  if (!res.ok) throw new Error();
                  handleUpdated({ id: p.id, dateRelance: newDate }, hasRelanceTomorrow ? "Relance de demain retirée" : "À rappeler demain");
                } catch { toast.error("Échec de la mise à jour"); }
              }

              return (
                <div key={p.id}>
                {section && (
                  <p className={`px-1 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide ${rang === 0 ? "text-red-600" : rang === 1 ? "text-orange-600" : "text-blue-600"}`}>
                    {section}
                  </p>
                )}
                <div
                  className={`w-full bg-white rounded-2xl border shadow-sm p-3 sm:p-4 flex items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer
                    ${rang === 0 ? "border-red-200" : rang === 1 ? "border-orange-200" : "border-gray-100"}`}
                  onClick={() => ouvrir(p)}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {p.prenom[0]?.toUpperCase()}{p.nom[0]?.toUpperCase()}
                  </div>

                  {/* Infos principales */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{p.prenom} {p.nom}</p>
                      <StatutBadge statut={p.statut} small />
                      {p.dejaClient && p.statut !== "CONVERTI" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700" title={`Déjà client : ${p.dejaClient.nom}`}>Déjà client</span>
                      )}
                      {auto.etat === "reponse" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700" title="Réponse email détectée — relances automatiques arrêtées">📩 A répondu</span>
                      )}
                      {auto.etat === "programmee" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap" title={`Relance automatique : ${libelleEtatAuto(auto)}`}>
                          🤖 R{auto.niveau} le {jjmmIso(prochainPassage(auto.date, ref.t0))}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {p.tel && <a href={`tel:${p.tel}`} onClick={(e) => e.stopPropagation()} className="text-xs text-gray-500 flex items-center gap-1 hover:text-blue-600"><Phone size={11} />{p.tel}</a>}
                      {p.typePresta && <span className="text-xs text-gray-500">{p.typePresta}</span>}
                    </div>
                    {/* Dernier email envoyé : dit où en est l'échange */}
                    <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1 min-w-0">
                      <Mail size={10} className="shrink-0" />
                      {last ? <span className="truncate">{last.label} · {ilYA(last.date)}</span> : <span>aucun email envoyé</span>}
                    </p>
                  </div>

                  {/* Relance rapide + prochaine relance */}
                  <div className="shrink-0 flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                    {estActif(p) && (
                      <button
                        onClick={quickRelance}
                        title={hasRelanceTomorrow ? "Annuler la relance demain" : "Relance demain"}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                          hasRelanceTomorrow
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-white text-gray-400 border-gray-200 hover:text-orange-500 hover:border-orange-300"
                        }`}
                      >
                        <Bell size={11} />
                        {hasRelanceTomorrow ? "Demain ✓" : "Rappel"}
                      </button>
                    )}
                    {chip && !hasRelanceTomorrow && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${chip.cls}`}>
                        {chip.text}
                      </span>
                    )}
                  </div>

                  {/* Corbeille : suppression rapide (prospect créé par erreur) */}
                  <button
                    onClick={e => deleteProspect(p, e)}
                    title="Supprimer ce prospect"
                    aria-label="Supprimer ce prospect"
                    className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>

                  <ChevronRight size={16} className="text-gray-300 shrink-0 hidden sm:block" />
                </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showAdd && (
        <AddProspectModal
          onClose={() => setShowAdd(false)}
          onSaved={(p: Prospect) => {
            if (p.dejaClient) toast.info(`Déjà client : ${p.dejaClient.nom}`);
            setProspects(prev => [p, ...prev]);
            setShowAdd(false);
            setQueue(null);
            setSelected(p); // Ouvre directement la fiche du nouveau prospect
          }}
        />
      )}
      {selected && (
        <ProspectModal
          key={selected.id} // « Suivant » : nouvelle fiche = état neuf
          prospect={selected}
          prestataires={prestataires}
          onClose={fermer}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onConverted={handleConverted}
          nav={nav}
        />
      )}

    </div>
  );
}
