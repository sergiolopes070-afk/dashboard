"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, X, SlidersHorizontal, CheckCircle2, Loader2 } from "lucide-react";
import { Prestation, Prestataire, TYPES_PRESTATION } from "@/lib/constants";
import { useToast } from "@/components/Toast";
import dynamic from "next/dynamic";
import type { LightboxPhoto } from "@/components/PhotoLightbox";
import Topbar from "@/components/Topbar";
import { useAvanceInscrits } from "@/components/AvanceBadge";
import { matchInscrit } from "@/lib/avanceMatch";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";
import { fetchJsonOk } from "@/lib/fetchOk";
import { useRouter } from "next/navigation";
import { waLien, waMobile, waTexteAvis } from "@/lib/waMessages";
import { isoParis } from "@/lib/dateParis";

// Fenêtres / modales affichées à la demande (fiche RDV, clic) : chargées à part
// pour alléger le JS du 1er affichage de l'agenda (mobile).
const ClientFicheById = dynamic(() => import("@/components/ClientFiche").then(m => m.ClientFicheById), { ssr: false });
const EmailActions    = dynamic(() => import("@/components/EmailActions"),   { ssr: false });
const PhotoLightbox   = dynamic(() => import("@/components/PhotoLightbox"),  { ssr: false });
const NewClientModal  = dynamic(() => import("@/components/NewClientModal"), { ssr: false });
const ClotureModal    = dynamic(() => import("@/components/ClotureModal"),   { ssr: false });
const EditPrestationModal = dynamic(() => import("@/components/EditPrestationModal"), { ssr: false });

// ─── Palette ─────────────────────────────────────────────────────────────────
const PALETTE = [
  { bg: "#4285F4", light: "#DBEAFE", text: "#1E40AF" },
  { bg: "#EA4335", light: "#FEE2E2", text: "#991B1B" },
  { bg: "#34A853", light: "#DCFCE7", text: "#166534" },
  { bg: "#FBBC04", light: "#FEF9C3", text: "#854D0E" },
  { bg: "#8B5CF6", light: "#EDE9FE", text: "#5B21B6" },
  { bg: "#F97316", light: "#FFEDD5", text: "#9A3412" },
  { bg: "#06B6D4", light: "#CFFAFE", text: "#155E75" },
  { bg: "#EC4899", light: "#FCE7F3", text: "#9D174D" },
  { bg: "#10B981", light: "#D1FAE5", text: "#065F46" },
  { bg: "#6366F1", light: "#E0E7FF", text: "#3730A3" },
];

// ─── Config grille ────────────────────────────────────────────────────────────
const HOUR_START = 7;
const HOUR_END   = 22;
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const HOUR_PX    = 64;
const EVENT_DUR  = 60;

const JOURS_LONG  = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const JOURS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MOIS        = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
type ViewMode = "day" | "week" | "month";
const VIEW_KEY = "agenda:viewMode";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0);
  return mon;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
// Historique (archivés) chargé par fenêtre : au 1er affichage, seulement depuis
// le 1er du mois M-2 (couvre les vues jour / semaine / mois récentes). Dès qu'on
// affiche une date plus ancienne, tout l'historique est chargé (une fois).
function debutFenetreArchive(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 2);
  return toIsoDate(d);
}
function toFrDate(d: Date): string {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}
function frToDate(fr: string): Date | null {
  if (!fr) return null;
  const p = fr.split("/");
  return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])) : null;
}
// Champs natifs <input type="date"> : stockage "JJ/MM/AAAA" ⇄ valeur "AAAA-MM-JJ".
// Une valeur déjà ISO traverse telle quelle (sheets.frToIso l'accepte aussi).
function toInputDate(d: string): string {
  if (!d) return "";
  const p = d.split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}` : d;
}
function fromInputDate(d: string): string {
  if (!d) return "";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function timeToMinutes(h: string): number {
  if (!h) return -1;
  const [hh,mm] = h.split(":").map(Number);
  return hh * 60 + (mm || 0);
}
function topPx(heure: string): number {
  const mins = timeToMinutes(heure);
  if (mins < 0) return 0;
  return ((mins - HOUR_START * 60) / 60) * HOUR_PX;
}
function heightPx(heure: string): number {
  const mins = timeToMinutes(heure);
  if (mins < 0) return HOUR_PX;
  const top = ((mins - HOUR_START * 60) / 60) * HOUR_PX;
  return Math.min(EVENT_DUR / 60 * HOUR_PX, (HOUR_END - HOUR_START) * HOUR_PX - top);
}
function firstMondayOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return getMondayOfWeek(first);
}

// ─── Icônes & abbréviations mode de paiement ─────────────────────────────────
const PAYMENT_ICONS: Record<string, string> = {
  "Espèces"          : "💵",
  "Virement bancaire": "🏦",
  "Lien de paiement" : "🔗",
  "Chèque"           : "📄",
  "Carte sur place"  : "💳",
  "Avance immédiate" : "⚡",
};
const PAYMENT_SHORT: Record<string, string> = {
  "Espèces"          : "Espèces",
  "Virement bancaire": "Virement",
  "Lien de paiement" : "Lien",
  "Chèque"           : "Chèque",
  "Carte sur place"  : "Carte",
  "Avance immédiate" : "Av. imm.",
};

// ─── Options prestation ───────────────────────────────────────────────────────
const TYPES_PRESTA = TYPES_PRESTATION; // liste commune (constants.ts)

// ─── Composant DayDetailModal ─────────────────────────────────────────────────
const DAY_SLOTS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
  const h = HOUR_START + i;
  return `${String(h).padStart(2, "0")}:00`;
});

function DayDetailModal({
  day, events, colorMap, idByNom,
  onClose, onCreateSlot, onSelectEvent,
}: {
  day: Date;
  events: Prestation[];
  colorMap: Record<string, typeof PALETTE[0]>;
  idByNom: Record<string, string>;
  onClose: () => void;
  onCreateSlot: (slot: { date: string; heure: string }) => void;
  onSelectEvent: (ev: Prestation) => void;
}) {
  const MOIS_LONG = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const JOURS_FULL = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const label = `${JOURS_FULL[day.getDay()]} ${day.getDate()} ${MOIS_LONG[day.getMonth()]} ${day.getFullYear()}`;
  const dateStr = toFrDate(day);

  // Group events by hour slot
  const eventsBySlot: Record<string, Prestation[]> = {};
  events.forEach(ev => {
    const slotKey = ev.heure ? ev.heure.slice(0, 2) + ":00" : "sans-heure";
    if (!eventsBySlot[slotKey]) eventsBySlot[slotKey] = [];
    eventsBySlot[slotKey].push(ev);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-base">{label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{events.length} prestation{events.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="overflow-y-auto flex-1">
          {DAY_SLOTS.map(slot => {
            const slotEvents = eventsBySlot[slot] || [];
            return (
              <div key={slot} className="flex border-b border-gray-50 group/slot">
                {/* Heure */}
                <div className="w-14 shrink-0 py-2 px-2 text-xs text-gray-400 font-medium text-right border-r border-gray-100">
                  {slot}
                </div>
                {/* Contenu du slot */}
                <div className="flex-1 py-1 px-2 min-h-[38px] relative">
                  {slotEvents.length > 0 ? (
                    <div className="space-y-0.5">
                      {slotEvents.map(ev => {
                        const pid   = idByNom[ev.prestataire];
                        const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg:"#9CA3AF", light:"#F3F4F6", text:"#374151" };
                        return (
                          <button
                            key={ev.row}
                            onClick={() => { onClose(); onSelectEvent(ev); }}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:brightness-95 transition-all"
                            style={{ backgroundColor: color.light, color: color.text }}
                          >
                            <span className="font-bold shrink-0" style={{ color: color.bg }}>{ev.heure}</span>
                            <span className="font-semibold text-gray-800 truncate flex-1">{ev.prenom} {ev.nom}</span>
                            {ev.typePresta && <span className="text-gray-500 truncate hidden sm:block shrink-0">{ev.typePresta}</span>}
                            {Array.isArray(ev.photos) && ev.photos.length > 0 && (
                              <span className="shrink-0 text-[11px]" title={`${ev.photos.length} photo(s) d'intervention`}>📷 {ev.photos.length}</span>
                            )}
                            {ev.avis === "OUI" && <span className="shrink-0 text-[11px]" title="Avis laissé">⭐</span>}
                            {ev.modePaiement && PAYMENT_ICONS[ev.modePaiement] && (
                              <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: color.bg + "20", color: color.bg }}>
                                {PAYMENT_ICONS[ev.modePaiement]} {PAYMENT_SHORT[ev.modePaiement]}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    /* Slot vide → bouton créer */
                    <button
                      onClick={() => onCreateSlot({ date: dateStr, heure: slot })}
                      className="absolute inset-0 w-full flex items-center gap-1 px-2 opacity-0 group-hover/slot:opacity-100 transition-opacity text-xs text-blue-500 hover:bg-blue-50/60"
                    >
                      <Plus size={12} />
                      <span>Créer à {slot}</span>
                    </button>
                  )}
                </div>
                {/* Bouton + sur les slots avec events aussi */}
                {slotEvents.length > 0 && (
                  <button
                    onClick={() => onCreateSlot({ date: dateStr, heure: slot })}
                    title={`Créer à ${slot}`}
                    className="w-7 shrink-0 flex items-center justify-center text-blue-400 hover:bg-blue-50 opacity-0 group-hover/slot:opacity-100 transition-opacity"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={() => onCreateSlot({ date: dateStr, heure: "09:00" })}
            className="w-full py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            Nouvelle prestation ce jour
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section repliable de la fiche RDV (état ouvert/fermé mémorisé) ──────────
function FicheSection({ id, title, defaultOpen = false, aside, children }: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const key = `agenda:rdvSection:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* stockage indisponible */ }
    return defaultOpen;
  });
  const toggle = () => setOpen(o => {
    try { localStorage.setItem(key, o ? "0" : "1"); } catch { /* stockage indisponible */ }
    return !o;
  });
  return (
    <div className="mt-4 border-t border-gray-100 pt-2">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="w-full min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <span className="truncate">{title}</span>
        <span className="flex items-center gap-1.5 min-w-0">
          {aside}
          <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function AgendaPage() {
  const toast = useToast();
  const router = useRouter();
  // Pile d'annulation (Ctrl/⌘+Z) : chaque action annulable y dépose sa fonction inverse.
  const undoStackRef = useRef<{ label: string; undo: () => void | Promise<void> }[]>([]);
  const pushUndo = (label: string, undo: () => void | Promise<void>) => {
    undoStackRef.current.push({ label, undo });
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isZ = e.key === "z" || e.key === "Z";
      if (!isZ || e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
      // Dans un champ de saisie : laisser l'annulation native du texte.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (undoStackRef.current.length === 0) return;
      e.preventDefault();
      const action = undoStackRef.current.pop()!;
      Promise.resolve(action.undo()).then(() => toast.success(`Annulé : ${action.label}`));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);
  const [prestations,  setPrestations]  = useState<Prestation[]>(() => cacheGet<Prestation[]>(CACHE_KEYS.agenda) ?? []);
  const [prestataires, setPrestataires] = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);
  const [loading,      setLoading]      = useState(() => !cacheHas(CACHE_KEYS.agenda));
  const [weekStart,    setWeekStart]    = useState<Date>(() => getMondayOfWeek(new Date()));
  const [monthDate,    setMonthDate]    = useState<Date>(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [viewMode,     setViewModeRaw]  = useState<ViewMode>("week");
  // Choix de vue mémorisé (localStorage) — sinon : Jour sur mobile (< 768px), Semaine sur desktop.
  // Décidé au montage (pas au rendu serveur) pour éviter tout décalage d'hydratation.
  const setViewMode = (v: ViewMode) => {
    setViewModeRaw(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage indisponible */ }
  };
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(VIEW_KEY); } catch { /* stockage indisponible */ }
    if (saved === "day" || saved === "week" || saved === "month") setViewModeRaw(saved);
    else if (window.matchMedia("(max-width: 767px)").matches) setViewModeRaw("day");
  }, []);
  const [lightbox,     setLightbox]     = useState<{ photos: LightboxPhoto[]; index: number } | null>(null);
  const avanceIdx = useAvanceInscrits(); // clients inscrits avance immédiate (tél, email ou prénom + nom)
  const [dayDate,      setDayDate]      = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [checked,      setChecked]      = useState<Record<string, boolean>>({});
  const [showSansPresta, setShowSansPresta] = useState(true);
  const [selectedEvent,   setSelectedEvent]   = useState<Prestation | null>(null);
  const [createSlot,      setCreateSlot]      = useState<{ date: string; heure: string } | null>(null);
  const [selectedMonthDay, setSelectedMonthDay] = useState<Date | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const didDropRef = useRef<boolean>(false);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [showArchived, setShowArchived] = useState(true);

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const [draggingEvent,    setDraggingEvent]    = useState<Prestation | null>(null);
  const [dragOverDay,      setDragOverDay]      = useState<number | null>(null);
  const [dragOverMins,     setDragOverMins]     = useState<number>(0);

  // ── Reprogrammation d'un 2ème passage GRATUIT (offre fidélité) ──────────────
  const [reprog2Open, setReprog2Open] = useState(false);
  const [reprog2Date, setReprog2Date] = useState("");
  const [reprog2Hrs,  setReprog2Hrs]  = useState("");
  const [reprog2Presta, setReprog2Presta] = useState("");
  const [reprog2Busy, setReprog2Busy] = useState(false);
  async function reprogram2(fromId: string) {
    if (!reprog2Date) return;
    setReprog2Busy(true);
    try {
      const res = await fetch("/api/prestations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprogram2", fromId, date: reprog2Date, heure: reprog2Hrs, prestataire: reprog2Presta }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setReprog2Open(false); setReprog2Date(""); setReprog2Hrs(""); setReprog2Presta(""); setSelectedEvent(null);
      loadData();
      toast.success("2ème passage gratuit programmé ✅");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setReprog2Busy(false); }
  }

  // ── Satisfaction / avis manuels (modifiables même après archivage, pour les primes) ──
  async function majAvisSatisf(row: string, patch: { avisLaisse?: boolean; satisfaction?: number }) {
    // MAJ optimiste (tuiles + panneau), puis persistance.
    setPrestations(ps => ps.map(p => p.row === row ? {
      ...p,
      ...(patch.avisLaisse !== undefined ? { avis: patch.avisLaisse ? "OUI" : "" } : {}),
      ...(patch.satisfaction !== undefined ? { satisfaction: patch.satisfaction || undefined } : {}),
    } : p));
    setSelectedEvent(prev => prev && prev.row === row ? {
      ...prev,
      ...(patch.avisLaisse !== undefined ? { avis: patch.avisLaisse ? "OUI" : "" } : {}),
      ...(patch.satisfaction !== undefined ? { satisfaction: patch.satisfaction || undefined } : {}),
    } : prev);
    try {
      await fetch("/api/prestations/avis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row, ...(patch.avisLaisse !== undefined ? { avisLaisse: patch.avisLaisse } : {}), ...(patch.satisfaction !== undefined ? { satisfaction: patch.satisfaction || "" } : {}) }),
      });
    } catch { toast.error("Enregistrement impossible"); }
  }

  // ── Reschedule modal (pour mobile / vue mois) ──────────────────────────────
  const [rescheduleEv,      setRescheduleEv]      = useState<Prestation | null>(null);
  const [rescheduleDate,    setRescheduleDate]    = useState("");
  const [rescheduleHrs,     setRescheduleHrs]     = useState("");
  const [rescheduleSaving,  setRescheduleSaving]  = useState(false);

  // ── Avis depuis l'agenda ───────────────────────────────────────────────────
  const [avisLinkCopied, setAvisLinkCopied] = useState(false);
  const [avisMsgCopied,  setAvisMsgCopied]  = useState(false);
  const [rappelCopied,   setRappelCopied]   = useState(false);
  const [ficheClientId, setFicheClientId] = useState<string | null>(null);

  // Préférence fiscale du client sélectionné (avance immédiate / crédit d'impôt)
  const [fiscal, setFiscal] = useState<"" | "avance" | "credit">("");
  const [fiscalSaving, setFiscalSaving] = useState(false);

  useEffect(() => {
    const cid = selectedEvent?.clientId;
    if (!cid) { setFiscal(""); return; }
    setFiscal("");
    fetch(`/api/clients/fiscal?clientId=${cid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFiscal(d.fiscal || ""); })
      .catch(() => {});
  }, [selectedEvent?.clientId]);

  // ── Envoi des photos d'intervention au client (PDF compte rendu) ────────────
  type PhotosEnvoi = { le: string; a: string };
  const [photosInfo,  setPhotosInfo]  = useState<{ row: string; email: string; envoi: PhotosEnvoi | null } | null>(null);
  const [photosSheet, setPhotosSheet] = useState(false);
  const [photosTo,    setPhotosTo]    = useState("");
  const [photosMsg,   setPhotosMsg]   = useState("");
  const [photosBusy,  setPhotosBusy]  = useState(false);
  const photosRow = selectedEvent && Array.isArray(selectedEvent.photos) && selectedEvent.photos.length > 0 ? selectedEvent.row : null;
  useEffect(() => {
    setPhotosSheet(false); setPhotosMsg(""); setPhotosInfo(null); setPhotosTo("");
    if (!photosRow) return;
    let alive = true;
    fetch(`/api/prestations/${photosRow}/photos`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) return;
        setPhotosInfo({ row: photosRow, email: d.email || "", envoi: d.envoi || null });
        setPhotosTo(d.email || "");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [photosRow]);
  async function envoyerPhotos(row: string) {
    if (!photosTo.trim()) return;
    setPhotosBusy(true);
    try {
      const res = await fetch(`/api/prestations/${row}/photos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: photosTo.trim(), message: photosMsg }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`);
      setPhotosInfo(prev => ({ row, email: prev?.email || d.email, envoi: d.envoi }));
      setPhotosSheet(false); setPhotosMsg("");
      toast.success(`Photos envoyées à ${d.email}`);
      if (d.warn) toast.error(d.warn);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur d'envoi"); }
    finally { setPhotosBusy(false); }
  }
  const frJJMM = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });

  async function setFiscalPref(clientId: string, val: "" | "avance" | "credit") {
    const next = fiscal === val ? "" : val; // re-cliquer = désélectionner
    const prev = fiscal;
    setFiscal(next); // optimiste
    setFiscalSaving(true);
    try {
      const res = await fetch("/api/clients/fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, fiscal: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next === "avance" ? "Avance immédiate — noté pour ce client"
        : next === "credit" ? "Crédit d'impôt — noté pour ce client"
        : "Fiscalité remise à zéro");
    } catch {
      setFiscal(prev);
      toast.error("Erreur, réessaie");
    } finally {
      setFiscalSaving(false);
    }
  }

  // ── Clôture (archive) depuis l'agenda → ClotureModal partagée ─────────────
  const [archiveEv, setArchiveEv] = useState<Prestation | null>(null);

  // ── Édition : formulaire unique partagé (EditPrestationModal, aussi utilisé par Prestations) ──
  const [editEv, setEditEv] = useState<Prestation | null>(null);
  // Après enregistrement : la fiche RDV reste ouverte et se rafraîchit avec les données rechargées.
  const refreshSelRef = useRef<string | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  // Ajout d'une prestation à un RDV déjà programmé (même client, même créneau).
  const [addOpen, setAddOpen]   = useState(false);
  const [addType, setAddType]   = useState("");
  const [addUnit, setAddUnit]   = useState("");
  const [addNb,   setAddNb]     = useState("1");
  const [addBusy, setAddBusy]   = useState(false);
  async function ajouterPrestation(fromId: string) {
    if (!addType) { toast.error("Choisis un type de prestation"); return; }
    const prixTotal = (parseFloat(addUnit.replace(",", ".")) || 0) * Math.max(1, parseInt(addNb) || 1);
    setAddBusy(true);
    try {
      const res = await fetch("/api/prestations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_prestation", fromId, typePresta: addType, prix: prixTotal > 0 ? String(prixTotal) : "", quantite: parseInt(addNb) > 1 ? `×${addNb}` : "" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setAddOpen(false); setAddType(""); setAddUnit(""); setAddNb("1"); setSelectedEvent(null);
      loadData();
      toast.success("Prestation ajoutée au RDV ✅");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setAddBusy(false); }
  }
  const [cancelling,    setCancelling]    = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const netLoadedRef = useRef(false); // vrai dès qu'un chargement réseau a abouti (≠ cache)
  const archiveFromRef = useRef(debutFenetreArchive()); // "" = tout l'historique
  const loadSeqRef = useRef(0); // seule la réponse du dernier chargement est appliquée
  const loadData = () => {
    const seq = ++loadSeqRef.current;
    const from = archiveFromRef.current;
    Promise.all([
      fetch("/api/prestations").then(r => r.json()),
      fetch("/api/prestataires").then(r => r.json()),
      fetch(from ? `/api/archive?from=${from}` : "/api/archive").then(r => r.json()),
    ]).then(([prestas, prestas2, archived]) => {
      if (seq !== loadSeqRef.current) return; // un chargement plus récent est en cours
      // Marque les archivés avec _archived:true et fusionne
      const archivedMarked = (Array.isArray(archived) ? archived : [])
        .map((p: Prestation) => ({ ...p, _archived: true }));
      const all = [...(Array.isArray(prestas) ? prestas : []), ...archivedMarked];
      setPrestations(all); cacheSet(CACHE_KEYS.agenda, all);
      const prestataireList = Array.isArray(prestas2) ? prestas2 : [];
      setPrestataires(prestataireList); cacheSet(CACHE_KEYS.prestataires, prestataireList);
      setChecked(prev => {
        const next = { ...prev };
        (Array.isArray(prestas2) ? prestas2 : []).forEach((p: Prestataire) => {
          if (next[p.id] === undefined) next[p.id] = true;
        });
        return next;
      });
      netLoadedRef.current = true;
      setLoading(false);
    }).catch(() => { if (seq !== loadSeqRef.current) return; netLoadedRef.current = true; setLoading(false); });
  };
  useEffect(() => { loadData(); }, []);
  // Rafraîchit la fiche RDV ouverte une fois les données rechargées après une modification.
  useEffect(() => {
    const row = refreshSelRef.current;
    if (!row) return;
    const fresh = prestations.find(p => p.row === row);
    if (!fresh) return;
    refreshSelRef.current = null;
    setSelectedEvent(prev => prev && prev.row === row ? fresh : prev);
  }, [prestations]);
  // Passe à l'historique complet (date affichée avant la fenêtre, RDV introuvable).
  const chargerToutArchive = () => {
    if (!archiveFromRef.current) return;
    archiveFromRef.current = "";
    loadData();
  };

  // Lien profond depuis l'accueil : /agenda?rdv=<id prestation> → saute à la date
  // du RDV (jour / semaine / mois) et ouvre sa fiche. Lu côté client (window) —
  // pas de useSearchParams, donc pas de Suspense requis (même approche que /clients).
  // On attend les données fraîches (le cache peut ne pas encore contenir le RDV),
  // puis on retire ?rdv= de l'URL pour que rechargement / retour ne la rouvrent pas.
  const rdvLinkDone = useRef(false);
  useEffect(() => {
    if (rdvLinkDone.current) return;
    const id = new URLSearchParams(window.location.search).get("rdv");
    if (!id) { rdvLinkDone.current = true; return; }
    const ev = prestations.find(p => p.row === id);
    if (!ev && !netLoadedRef.current) return; // données réseau pas encore arrivées
    // RDV archivé plus ancien que la fenêtre chargée → on charge tout puis on réessaie.
    if (!ev && archiveFromRef.current) { netLoadedRef.current = false; chargerToutArchive(); return; }
    rdvLinkDone.current = true;
    if (ev) {
      const d = frToDate(ev.date);
      if (d) {
        setDayDate(d);
        setWeekStart(getMondayOfWeek(d));
        setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1));
      }
      setSelectedEvent(ev);
    } else {
      toast.error("RDV introuvable");
    }
    router.replace("/agenda", { scroll: false });
  }, [prestations, loading, router, toast]); // eslint-disable-line react-hooks/exhaustive-deps -- chargerToutArchive lit des refs

  // Vrai si le client de ce RDV s'est inscrit à l'avance immédiate (tél, email ou prénom + nom).
  const estInscritAvance = (ev: { tel?: string; email?: string; prenom?: string; nom?: string }) => matchInscrit(avanceIdx, ev);

  // Auto-scroll vers 08h00
  useEffect(() => {
    if (!loading && (viewMode === "week" || viewMode === "day") && scrollRef.current) {
      scrollRef.current.scrollTop = (8 - HOUR_START) * HOUR_PX - 8;
    }
  }, [loading, viewMode, dayDate]);

  // ── Couleurs ───────────────────────────────────────────────────────────────
  const colorMap = useMemo(() => {
    const map: Record<string, typeof PALETTE[0]> = {};
    prestataires.forEach((p, i) => { map[p.id] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [prestataires]);

  const idByNom = useMemo(() => {
    const map: Record<string, string> = {};
    prestataires.forEach(p => { map[p.nom] = p.id; });
    return map;
  }, [prestataires]);

  // ── Filtres ────────────────────────────────────────────────────────────────
  const visiblePrestations = useMemo(() =>
    prestations.filter(p => {
      if (!p.date) return false;
      if ((p as Prestation & { _archived?: boolean })._archived && !showArchived) return false;
      const pid = idByNom[p.prestataire];
      if (p.prestataire && pid) return checked[pid] ?? false;
      return showSansPresta;
    }),
    [prestations, checked, showSansPresta, idByNom, showArchived]
  );

  function eventsForDay(day: Date): Prestation[] {
    return visiblePrestations
      .filter(p => { const d = frToDate(p.date); return d && sameDay(d, day); })
      .sort((a, b) => (a.heure||"").localeCompare(b.heure||""));
  }

  // ── Semaine ────────────────────────────────────────────────────────────────
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    if (weekStart.getMonth() === end.getMonth())
      return `${weekStart.getDate()} – ${end.getDate()} ${MOIS[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    return `${weekStart.getDate()} ${MOIS[weekStart.getMonth()].slice(0,3)} – ${end.getDate()} ${MOIS[end.getMonth()].slice(0,3)} ${weekStart.getFullYear()}`;
  }, [weekStart]);

  // ── Mois ───────────────────────────────────────────────────────────────────
  const monthLabel = `${MOIS[monthDate.getMonth()]} ${monthDate.getFullYear()}`;

  const monthGrid = useMemo(() => {
    const start = firstMondayOfMonthGrid(monthDate);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthDate]);

  // 1er jour affiché (jour / semaine / grille du mois) avant la fenêtre d'historique
  // chargée → on charge tout l'historique.
  const debutVisibleIso = toIsoDate(viewMode === "day" ? dayDate : viewMode === "week" ? weekStart : monthGrid[0]);
  useEffect(() => {
    if (archiveFromRef.current && debutVisibleIso < archiveFromRef.current) chargerToutArchive();
  }, [debutVisibleIso]); // eslint-disable-line react-hooks/exhaustive-deps -- chargerToutArchive lit des refs

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navPrev() {
    if (viewMode === "day") setDayDate(d => addDays(d, -1));
    else if (viewMode === "week") setWeekStart(w => addDays(w, -7));
    else setMonthDate(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function navNext() {
    if (viewMode === "day") setDayDate(d => addDays(d, 1));
    else if (viewMode === "week") setWeekStart(w => addDays(w, 7));
    else setMonthDate(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function navToday() {
    if (viewMode === "day") { const d = new Date(); d.setHours(0,0,0,0); setDayDate(d); }
    else if (viewMode === "week") setWeekStart(getMondayOfWeek(new Date()));
    else { const d = new Date(); setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1)); }
  }

  // ── Reschedule (drag & modal) ───────────────────────────────────────────────
  // Applique un déplacement (UI optimiste + persistance), SANS toucher à la pile
  // d'annulation — utilisé par l'action utilisateur ET par le Ctrl+Z.
  async function applyReschedule(row: string, date: string, heure: string) {
    setPrestations(prev => prev.map(p => p.row === row ? { ...p, date, heure } : p));
    try {
      await fetch("/api/prestations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, updates: { date, heure } }),
      });
    } catch {
      loadData(); // rollback
    }
  }

  async function reschedulePrestation(ev: Prestation, newDate: string, newHeure: string) {
    setRescheduleSaving(true);
    const row = ev.row, prevDate = ev.date, prevHeure = ev.heure;
    setSelectedEvent(null);
    setRescheduleEv(null);
    await applyReschedule(row, newDate, newHeure);
    setRescheduleSaving(false);
    // Mémorise l'action pour l'annuler avec Ctrl/⌘+Z (remet l'ancienne date/heure).
    pushUndo(`Déplacement de ${ev.prenom || "RDV"}`, () => applyReschedule(row, prevDate, prevHeure));
    toast.success("RDV déplacé — ⌘/Ctrl+Z pour annuler");
  }

  // ── Annulation rapide (sans motif, sans modal) ───────────────────────────
  async function quickCancel(evRow: string) {
    setCancelling(true);
    try {
      await fetchJsonOk("/api/archive", "PATCH", { id: evRow, reason: "Annulation client", modePaiement: "" });
      setSelectedEvent(null);
      setCancelConfirm(false);
      loadData();
    } catch (e) {
      toast.error(`Annulation non enregistrée : ${e instanceof Error ? e.message : "Erreur"}`);
    } finally {
      setCancelling(false);
    }
  }

  // ── Mise à jour mode de paiement (même sur archivé) ─────────────────────
  async function updatePaymentMode(evRow: string, newMode: string) {
    setPaymentSaving(true);
    try {
      // L'UI n'est mise à jour qu'après confirmation du serveur (rien à annuler en cas d'échec)
      await fetchJsonOk("/api/prestations", "PUT", { row: evRow, updates: { modePaiement: newMode } });
      setPrestations(prev => prev.map(p =>
        p.row === evRow ? { ...p, modePaiement: newMode as Prestation["modePaiement"] } : p
      ));
      setSelectedEvent(prev => prev ? { ...prev, modePaiement: newMode as Prestation["modePaiement"] } : prev);
    } catch (e) {
      toast.error(`Mode de paiement non enregistré : ${e instanceof Error ? e.message : "Erreur"}`);
    } finally {
      setPaymentSaving(false);
    }
  }

  // Clic sur numéro de jour (header semaine) → vue mois
  function handleDayHeaderClick(day: Date) {
    setMonthDate(new Date(day.getFullYear(), day.getMonth(), 1));
    setViewMode("month");
  }

  // Clic sur une journée dans la vue mois → ouvrir le popup du jour
  function handleMonthDayClick(day: Date) {
    setSelectedMonthDay(day);
  }

  // Clic sur un créneau horaire vide (vue semaine)
  function handleSlotClick(e: React.MouseEvent<HTMLDivElement>, day: Date) {
    if (didDropRef.current) return; // évite d'ouvrir le modal après un drop
    const y = e.nativeEvent.offsetY;
    const totalMins = Math.floor((y / HOUR_PX) * 60 / 15) * 15 + HOUR_START * 60;
    const clamped = Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 - 15, totalMins));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    const heure = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    setCreateSlot({ date: toFrDate(day), heure });
  }

  // Bouton « + Nouveau RDV » : ouvre la création pré-remplie avec le jour affiché
  // (vue jour : ce jour ; semaine/mois : aujourd'hui s'il est visible, sinon le 1er jour visible).
  function openNewRdv() {
    let d: Date;
    if (viewMode === "day") d = dayDate;
    else if (viewMode === "week") d = today >= weekStart && today < addDays(weekStart, 7) ? today : weekStart;
    else d = today.getFullYear() === monthDate.getFullYear() && today.getMonth() === monthDate.getMonth() ? today : monthDate;
    setCreateSlot({ date: toFrDate(d), heure: "" });
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const allChecked = prestataires.every(p => checked[p.id]) && showSansPresta;
  const toggleAll  = (v: boolean) => {
    const next: Record<string, boolean> = {};
    prestataires.forEach(p => { next[p.id] = v; });
    setChecked(next); setShowSansPresta(v);
  };

  // ─────────────────────────────────────────────────────────────────────────

  // Sidebar prestataires content (partagé desktop + mobile)
  const sidebarContent = (
    <>
      <div className="font-semibold text-sm text-gray-700 mb-1">Prestataires</div>
      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-400 uppercase tracking-wide">
        <input type="checkbox" checked={allChecked} onChange={e => toggleAll(e.target.checked)} className="w-3.5 h-3.5 rounded" />
        Tous
      </label>
      <div className="flex flex-col gap-2">
        {prestataires.map(p => {
          const color = colorMap[p.id] ?? PALETTE[0];
          return (
            <label key={p.id} className="flex items-center gap-2.5 cursor-pointer group"
              onClick={() => setChecked(prev => ({ ...prev, [p.id]: !prev[p.id] }))}>
              <span className="w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0"
                style={{ borderColor: color.bg, backgroundColor: checked[p.id] ? color.bg : "transparent" }}>
                {checked[p.id] && (
                  <svg viewBox="0 0 10 8" className="w-2.5 h-2">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <span className="text-sm text-gray-700 truncate">{p.nom}</span>
            </label>
          );
        })}
        <label className="flex items-center gap-2.5 cursor-pointer group"
          onClick={() => setShowSansPresta(v => !v)}>
          <span className="w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0"
            style={{ borderColor:"#9CA3AF", backgroundColor: showSansPresta ? "#9CA3AF" : "transparent" }}>
            {showSansPresta && (
              <svg viewBox="0 0 10 8" className="w-2.5 h-2">
                <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
          <span className="text-sm text-gray-400 truncate">Sans prestataire</span>
        </label>
      </div>

      {/* ── Archivés toggle ─────────────────────────────────────────── */}
      <div className="pt-2 border-t border-gray-100">
        <label className="flex items-center gap-2.5 cursor-pointer group"
          onClick={() => setShowArchived(v => !v)}>
          <span className="w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0"
            style={{ borderColor:"#6B7280", backgroundColor: showArchived ? "#6B7280" : "transparent" }}>
            {showArchived && (
              <svg viewBox="0 0 10 8" className="w-2.5 h-2">
                <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
          <span className="text-sm text-gray-400 italic truncate">Archivés</span>
        </label>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Topbar partagée : menu (mobile) + recherche globale. Version compacte pour laisser la place au calendrier. */}
      <Topbar title="Agenda" onRefresh={loadData} loading={loading} compact
        action={
          <button
            onClick={openNewRdv}
            title="Nouveau RDV (jour affiché)"
            aria-label="Nouveau RDV"
            className="flex items-center gap-1.5 min-h-[36px] min-w-[36px] justify-center p-2 sm:px-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
            <Plus size={18} />
            <span className="hidden sm:inline">Nouveau RDV</span>
          </button>
        } />
      <div className="flex-1 flex min-h-0">

      {/* ── Sidebar filtre mobile (drawer) ────────────────────────────────── */}
      {filterOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setFilterOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute left-0 top-0 bottom-0 w-56 bg-white p-4 flex flex-col gap-3 shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm text-gray-700">Filtres</span>
              <button onClick={() => setFilterOpen(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* ── Sidebar desktop ───────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-gray-200 p-4 flex-col gap-3">
        {sidebarContent}
      </aside>

      {/* ── Calendrier ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Barre navigation — mobile : 2 lignes (commandes puis date) pour tenir en 375px, cibles ≥ 36px */}
        <div className="bg-white border-b border-gray-200 px-2 sm:px-4 py-2 sm:py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-x-1 gap-y-1 sm:gap-2 shrink-0">
          {/* Bouton filtre prestataires - mobile only */}
          <button
            onClick={() => setFilterOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors md:hidden shrink-0"
            title="Filtrer par prestataire"
            aria-label="Filtrer par prestataire"
          >
            <SlidersHorizontal size={17} className="text-gray-600" />
          </button>
          <button onClick={navPrev} aria-label="Précédent"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <button onClick={navToday}
            className="h-9 px-2.5 sm:px-3 text-xs sm:text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors shrink-0">
            Aujourd&apos;hui
          </button>
          <button onClick={navNext} aria-label="Suivant"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            <ChevronRight size={20} className="text-gray-600" />
          </button>
          <h2 className="order-last sm:order-none w-full sm:w-auto sm:flex-1 text-sm font-semibold text-gray-800 px-1 sm:ml-1 truncate">
            {viewMode === "day"
              ? `${JOURS_LONG[(dayDate.getDay()+6)%7]} ${dayDate.getDate()} ${MOIS[dayDate.getMonth()]}`
              : viewMode === "week" ? weekLabel : monthLabel}
          </h2>
          {/* Toggle jour / semaine / mois */}
          <div className="ml-auto sm:ml-0 flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium shrink-0">
            <button
              onClick={() => setViewMode("day")}
              className={`h-9 px-2 sm:px-3 transition-colors ${viewMode==="day" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              Jour
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`h-9 px-2 sm:px-3 border-l border-gray-200 transition-colors ${viewMode==="week" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              Sem.
            </button>
            <button
              onClick={() => { setViewMode("month"); setMonthDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)); }}
              className={`h-9 px-2 sm:px-3 border-l border-gray-200 transition-colors ${viewMode==="month" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              Mois
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Chargement…</div>
        ) : viewMode === "day" ? (

          /* ══ VUE JOUR ═════════════════════════════════════════════════════ */
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="flex" style={{ minHeight: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}>
              {/* Colonne heures */}
              <div className="w-10 shrink-0 relative bg-white">
                {HOURS.map((h, i) => (
                  <div key={h} className="absolute right-2 text-xs text-gray-400 font-medium" style={{ top: `${i * HOUR_PX - 7}px` }}>{String(h).padStart(2, "0")}:00</div>
                ))}
              </div>
              {/* Colonne du jour */}
              <div className="flex-1 border-l border-gray-100 relative bg-white cursor-pointer" style={{ height: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}
                onClick={e => handleSlotClick(e, dayDate)}>
                {HOURS.map((h, i) => <div key={h} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${i * HOUR_PX}px` }} />)}
                {eventsForDay(dayDate).map((ev, ei) => {
                  const isArchived = !!(ev as Prestation & { _archived?: boolean })._archived;
                  const pid = idByNom[ev.prestataire];
                  const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg: "#9CA3AF", light: "#F3F4F6", text: "#374151" };
                  const top_ = ev.heure ? topPx(ev.heure) : 0;
                  const h_ = ev.heure ? heightPx(ev.heure) : HOUR_PX;
                  return (
                    <button key={ev.row} onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                      className="absolute rounded-lg text-left overflow-hidden shadow-sm hover:brightness-95 transition-all"
                      style={{ top: `${top_ + 1}px`, height: `${Math.max(h_ - 2, 28)}px`, left: "6px", right: "6px",
                        backgroundColor: isArchived ? "#F3F4F6" : color.light, borderLeft: `3px solid ${isArchived ? "#9CA3AF" : color.bg}`, opacity: isArchived ? 0.6 : 1, zIndex: 10 + ei }}>
                      <div className="px-2.5 py-1.5 h-full flex flex-col overflow-hidden">
                        {ev.heure && <span className="font-bold text-xs" style={{ color: isArchived ? "#9CA3AF" : color.bg }}>{ev.heure}</span>}
                        <span className={`font-semibold text-sm truncate ${isArchived ? "line-through text-gray-400" : "text-gray-900"}`}>{ev.prenom} {ev.nom}</span>
                        <span className="text-xs text-gray-500 truncate">{ev.typePresta}{ev.quantite && ev.quantite !== "1" ? ` — ${ev.quantite}` : ""}{ev.prestataire ? ` · ${ev.prestataire}` : ""}</span>
                        {ev.modePaiement && PAYMENT_ICONS[ev.modePaiement] && <span className="text-[11px] mt-0.5">{PAYMENT_ICONS[ev.modePaiement]} {PAYMENT_SHORT[ev.modePaiement] ?? ev.modePaiement}</span>}
                        {Array.isArray(ev.photos) && ev.photos.length > 0 && (
                          <span className="text-[11px] mt-0.5 text-gray-600" title={`${ev.photos.length} photo(s) d'intervention`}>📷 {ev.photos.length} photo{ev.photos.length > 1 ? "s" : ""}</span>
                        )}
                        {ev.avis === "OUI" && <span className="text-[11px] mt-0.5 text-amber-600" title="Avis laissé">⭐ Avis</span>}
                      </div>
                    </button>
                  );
                })}
                {eventsForDay(dayDate).length === 0 && (
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-gray-300 text-sm pointer-events-none">Aucun rendez-vous ce jour<br /><span className="text-xs">Touche un créneau ou « + » pour créer</span></div>
                )}
              </div>
            </div>
          </div>

        ) : viewMode === "week" ? (

          /* ══ VUE SEMAINE ══════════════════════════════════════════════════ */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Wrapper scroll horizontal mobile */}
            <div className="flex-1 flex flex-col overflow-hidden overflow-x-auto">
            {/* En-têtes jours */}
            <div className="grid bg-white border-b border-gray-200 shrink-0"
              style={{ gridTemplateColumns: "40px repeat(7, minmax(44px, 1fr))", minWidth: "360px" }}>
              <div />
              {weekDays.map((day, i) => {
                const isToday = sameDay(day, today);
                return (
                  <div key={i} className="py-1.5 text-center border-l border-gray-100">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{JOURS_SHORT[i]}</p>
                    <button
                      onClick={() => handleDayHeaderClick(day)}
                      title="Voir le mois"
                      className={`mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors
                        ${isToday ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                      {day.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Grille avec heures */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="flex" style={{ minHeight: `${(HOUR_END - HOUR_START) * HOUR_PX}px`, minWidth: "360px" }}>

                {/* Colonne heures */}
                <div className="w-10 shrink-0 relative bg-white" style={{ height: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}>
                  {HOURS.map((h, i) => (
                    <div key={h} className="absolute right-2 text-xs text-gray-400 font-medium"
                      style={{ top: `${i * HOUR_PX - 7}px` }}>
                      {String(h).padStart(2,"0")}:00
                    </div>
                  ))}
                </div>

                {/* Colonnes jours */}
                {weekDays.map((day, di) => {
                  const events  = eventsForDay(day);
                  const isToday = sameDay(day, today);
                  const isDragOver = dragOverDay === di;
                  return (
                    <div
                      key={di}
                      className={`flex-1 border-l border-gray-100 relative cursor-pointer group ${isToday ? "bg-blue-50/20" : "bg-white"} ${isDragOver ? "bg-blue-50/40" : ""}`}
                      style={{ height: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}
                      onClick={e => handleSlotClick(e, day)}
                      title="Cliquer pour créer une prestation"
                      onDragOver={e => {
                        if (!draggingEvent) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const raw = Math.round((y / HOUR_PX) * 60 / 15) * 15 + HOUR_START * 60;
                        const clamped = Math.max(HOUR_START * 60, Math.min((HOUR_END - 1) * 60, raw));
                        setDragOverDay(di);
                        setDragOverMins(clamped);
                      }}
                      onDragLeave={e => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverDay(null);
                        }
                      }}
                      onDrop={async e => {
                        e.preventDefault();
                        if (!draggingEvent) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const raw = Math.round((y / HOUR_PX) * 60 / 15) * 15 + HOUR_START * 60;
                        const clamped = Math.max(HOUR_START * 60, Math.min((HOUR_END - 1) * 60, raw));
                        const h = Math.floor(clamped / 60);
                        const m = clamped % 60;
                        const newHeure = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
                        const newDate  = toFrDate(day);
                        const ev = draggingEvent;
                        setDraggingEvent(null);
                        setDragOverDay(null);
                        didDropRef.current = true;
                        setTimeout(() => { didDropRef.current = false; }, 200);
                        await reschedulePrestation(ev, newDate, newHeure);
                      }}
                    >
                      {/* Lignes horaires */}
                      {HOURS.map((h, i) => (
                        <div key={h} className="absolute left-0 right-0 border-t border-gray-100"
                          style={{ top: `${i * HOUR_PX}px` }} />
                      ))}
                      {HOURS.map((h, i) => (
                        <div key={`${h}-half`} className="absolute left-0 right-0 border-t border-gray-50"
                          style={{ top: `${i * HOUR_PX + HOUR_PX / 2}px` }} />
                      ))}

                      {/* Hover hint */}
                      <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/[0.02] transition-colors pointer-events-none" />

                      {/* Indicateur de drop */}
                      {isDragOver && draggingEvent && (
                        <div
                          className="absolute left-1 right-1 rounded pointer-events-none z-30"
                          style={{
                            top: `${((dragOverMins - HOUR_START * 60) / 60) * HOUR_PX}px`,
                            height: `${HOUR_PX}px`,
                            backgroundColor: "rgba(59,130,246,0.12)",
                            borderTop: "2px solid #3B82F6",
                          }}
                        >
                          <span className="absolute top-0.5 left-1 bg-blue-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-sm leading-none">
                            {`${String(Math.floor(dragOverMins/60)).padStart(2,"0")}:${String(dragOverMins%60).padStart(2,"0")}`}
                          </span>
                        </div>
                      )}

                      {/* Events */}
                      {events.map((ev, ei) => {
                        const isArchived = !!(ev as Prestation & { _archived?: boolean })._archived;
                        const pid   = idByNom[ev.prestataire];
                        const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg:"#9CA3AF", light:"#F3F4F6", text:"#374151" };
                        const top_  = ev.heure ? topPx(ev.heure)   : 0;
                        const h_    = ev.heure ? heightPx(ev.heure) : HOUR_PX;
                        const overlap = events.slice(0, ei).filter(e => {
                          if (!e.heure || !ev.heure) return false;
                          return Math.abs(timeToMinutes(e.heure) - timeToMinutes(ev.heure)) < EVENT_DUR;
                        }).length;
                        return (
                          <button
                            key={ev.row}
                            draggable={!isArchived}
                            onDragStart={e => {
                              e.stopPropagation();
                              setDraggingEvent(ev);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => { setDraggingEvent(null); setDragOverDay(null); }}
                            onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                            className="absolute rounded-md text-left text-xs overflow-hidden shadow-sm hover:brightness-95 transition-all"
                            style={{
                              top   : `${top_ + 1}px`,
                              height: `${Math.max(h_ - 2, 22)}px`,
                              left  : overlap > 0 ? "calc(50% + 2px)" : "3px",
                              width : overlap > 0 ? "calc(50% - 4px)" : "calc(100% - 6px)",
                              backgroundColor: isArchived ? "#F3F4F6" : color.light,
                              borderLeft     : `3px solid ${isArchived ? "#9CA3AF" : color.bg}`,
                              opacity: isArchived ? 0.6 : (draggingEvent?.row === ev.row ? 0.4 : 1),
                              cursor: isArchived ? "default" : "grab",
                              zIndex: 10 + ei,
                            }}
                          >
                            {Array.isArray(ev.photos) && ev.photos.length > 0 && (
                              <span className="absolute top-0 right-0 z-20 inline-flex items-center rounded-bl-md bg-black/55 text-white text-[9px] font-bold px-1 py-0.5 leading-none" title={`${ev.photos.length} photo(s) d'intervention`}>📷{ev.photos.length}</span>
                            )}
                            {ev.avis === "OUI" && (
                              <span className="absolute top-0 left-0 z-20 inline-flex items-center rounded-br-md bg-amber-400 text-white text-[9px] font-bold px-1 py-0.5 leading-none" title="Avis laissé">⭐</span>
                            )}
                            <div className="px-1.5 py-1 h-full flex flex-col overflow-hidden gap-px">
                              {ev.heure && (
                                <span className="font-bold leading-tight truncate text-[11px]" style={{ color: isArchived ? "#9CA3AF" : color.bg }}>{ev.heure}</span>
                              )}
                              <span className={`font-semibold leading-tight truncate text-[11px] ${isArchived ? "line-through text-gray-400" : "text-gray-800"}`}>{ev.prenom} {ev.nom}</span>
                              {h_ > 36 && <span className="text-gray-400 leading-tight truncate text-[10px]">{ev.typePresta}</span>}
                              {h_ > 52 && ev.prestataire && !isArchived && (
                                <span className="leading-tight truncate text-[10px] font-medium" style={{ color: color.text }}>{ev.prestataire}</span>
                              )}
                              {ev.modePaiement && PAYMENT_ICONS[ev.modePaiement] && (
                                <span className="mt-auto inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded w-fit"
                                  style={{ backgroundColor: isArchived ? "#E5E7EB" : color.bg + "22", color: isArchived ? "#9CA3AF" : color.bg }}>
                                  {PAYMENT_ICONS[ev.modePaiement]}{h_ > 40 && ` ${PAYMENT_SHORT[ev.modePaiement] ?? ev.modePaiement}`}
                                </span>
                              )}
                              {isArchived && !ev.modePaiement && <span className="text-gray-400 text-[9px] leading-tight font-medium uppercase tracking-wide">Archivé</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>{/* fin wrapper scroll horizontal */}
          </div>

        ) : (

          /* ══ VUE MOIS ════════════════════════════════════════════════════ */
          <div className="flex-1 flex flex-col overflow-auto bg-white">
            {/* En-tête jours de la semaine */}
            <div className="grid border-b border-gray-200 shrink-0"
              style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {JOURS_LONG.map((j, i) => (
                <div key={i} className={`py-2 text-center text-xs font-semibold uppercase tracking-wide
                  ${i >= 5 ? "text-gray-400" : "text-gray-500"}`}>
                  <span className="hidden sm:inline">{j}</span>
                  <span className="sm:hidden">{JOURS_SHORT[i]}</span>
                </div>
              ))}
            </div>

            {/* Grille 6×7 */}
            <div className="grid flex-1" style={{ gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: "repeat(6, 1fr)" }}>
              {monthGrid.map((day, idx) => {
                const inCurrentMonth = day.getMonth() === monthDate.getMonth();
                const isToday_       = sameDay(day, today);
                const events         = eventsForDay(day);
                const isWeekend      = idx % 7 >= 5;
                return (
                  <div
                    key={idx}
                    onClick={() => handleMonthDayClick(day)}
                    className={`border-b border-r border-gray-100 p-1 sm:p-1.5 cursor-pointer hover:bg-blue-50/50 transition-colors min-h-[60px] sm:min-h-[100px] group/day
                      ${!inCurrentMonth ? "bg-gray-50/50" : ""}
                      ${isWeekend && inCurrentMonth ? "bg-orange-50/20" : ""}`}
                    title="Voir le détail du jour"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold
                        ${isToday_ ? "bg-blue-600 text-white" : inCurrentMonth ? (isWeekend ? "text-gray-400" : "text-gray-700") : "text-gray-300"}`}>
                        {day.getDate()}
                      </span>
                      {day.getDate() === 1 && !isToday_ && (
                        <span className="text-xs text-gray-400 font-medium">{MOIS[day.getMonth()].slice(0,3)}</span>
                      )}
                    </div>
                    {/* Events du jour (max 3 + overflow) */}
                    <div className="space-y-0.5">
                      {events.slice(0, 3).map(ev => {
                        const isArchived = !!(ev as Prestation & { _archived?: boolean })._archived;
                        const pid   = idByNom[ev.prestataire];
                        const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg:"#9CA3AF", light:"#F3F4F6", text:"#374151" };
                        return (
                          <div key={ev.row} className={`relative w-full rounded overflow-hidden ${isArchived ? "opacity-55" : ""}`}
                            style={{ backgroundColor: isArchived ? "#F3F4F6" : color.light }}>
                            {Array.isArray(ev.photos) && ev.photos.length > 0 && (
                              <span className="absolute top-0 right-0 z-20 inline-flex items-center rounded-bl bg-black/55 text-white text-[9px] font-bold px-1 py-0.5 leading-none" title={`${ev.photos.length} photo(s) d'intervention`}>📷{ev.photos.length}</span>
                            )}
                            {ev.avis === "OUI" && (
                              <span className="absolute top-0 left-0 z-20 inline-flex items-center rounded-br bg-amber-400 text-white text-[9px] font-bold px-1 py-0.5 leading-none" title="Avis laissé">⭐</span>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                              className="w-full text-left px-1.5 py-0.5 text-xs font-medium flex items-center gap-1"
                              style={{ color: isArchived ? "#9CA3AF" : color.text }}
                            >
                              {ev.heure && <span className={`font-bold shrink-0 ${isArchived ? "line-through" : ""}`}>{ev.heure}</span>}
                              <span className={`truncate flex-1 ${isArchived ? "line-through" : ""}`}>{ev.prenom} {ev.nom}</span>
                            </button>
                            {ev.modePaiement && PAYMENT_ICONS[ev.modePaiement] && (
                              <div className="px-1.5 pb-0.5 flex items-center gap-0.5 text-[10px] font-semibold"
                                style={{ color: isArchived ? "#9CA3AF" : color.bg }}>
                                {PAYMENT_ICONS[ev.modePaiement]}
                                <span>{PAYMENT_SHORT[ev.modePaiement] ?? ev.modePaiement}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {events.length > 3 && (
                        <p className="text-xs text-blue-500 font-medium pl-1">+{events.length - 3} autres</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal détail event ───────────────────────────────────────────── */}
      {ficheClientId && (
        <ClientFicheById clientId={ficheClientId} onClose={() => setFicheClientId(null)} onChanged={loadData} />
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => { setSelectedEvent(null); setCancelConfirm(false); }}>
          {/* Mobile : feuille du bas (pleine largeur) — desktop : modale centrée */}
          <div key={selectedEvent.row}
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm sm:mx-4 max-h-[90vh] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]"
            onClick={e => e.stopPropagation()}>
            {(() => {
              const ev    = selectedEvent;
              const pid   = idByNom[ev.prestataire];
              const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg:"#9CA3AF", light:"#F3F4F6", text:"#374151" };
              const isArchived = !!(ev as Prestation & { _archived?: boolean; archive_reason?: string })._archived;
              const archiveReason = (ev as Prestation & { _archived?: boolean; archive_reason?: string }).archive_reason;
              // RDV passé ? (date + heure ; sans heure : jour strictement avant aujourd'hui)
              const rdvJour = frToDate(ev.date);
              const rdvDebut = rdvJour ? new Date(rdvJour) : null;
              if (rdvDebut && ev.heure) { const [hh, mm] = ev.heure.split(":").map(Number); rdvDebut.setHours(hh || 0, mm || 0, 0, 0); }
              const estPasse = !!rdvDebut && (ev.heure ? rdvDebut.getTime() < Date.now() : rdvDebut < today);
              const aVenir = !!rdvJour && rdvJour >= today;
              // ── Message mission au prestataire (WhatsApp, avec réponse directe) ──
              const prestataireObj = ev.prestataire ? prestataires.find(p => p.nom === ev.prestataire) : undefined;
              const baseUrl   = typeof window !== "undefined" ? window.location.origin : "";
              const acceptUrl = `${baseUrl}/api/mission/reponse?id=${ev.row}&action=accepter`;
              const refusUrl  = `${baseUrl}/api/mission/reponse?id=${ev.row}&action=refuser`;
              const missionMsg = (
                `Bonjour ${ev.prestataire} 👋,\n\nUne mission vous a été proposée chez KinouClean :\n\n` +
                `👤 Client : ${ev.prenom} ${ev.nom}\n` +
                `📞 Téléphone : ${ev.tel || "—"}\n` +
                `🧹 Prestation : ${ev.typePresta || "—"}\n` +
                `📍 Adresse : ${ev.adresse || "—"}\n` +
                `📅 Date : ${ev.date || "—"}${ev.heure ? ` à ${ev.heure}` : ""}\n` +
                `💶 Prix : ${ev.prix && ev.prix !== "0" ? ev.prix + " €" : "À définir"}` +
                (ev.modePaiement ? `\n💳 Mode de paiement : ${ev.modePaiement}` : "") +
                (ev.message?.trim() ? `\n\n💬 Message client :\n${ev.message.trim()}` : "") +
                (ev.commentaire?.trim() ? `\n\n📝 Note interne :\n${ev.commentaire.trim()}` : "") +
                `\n\nMerci de répondre directement via ces liens :\n\n` +
                `✅ ACCEPTER la mission :\n${acceptUrl}\n\n` +
                `❌ REFUSER la mission :\n${refusUrl}\n\n` +
                `Votre réponse met à jour la fiche automatiquement 🙏`
              );
              const missionLien = prestataireObj?.tel ? waLien(prestataireObj.tel, missionMsg) : null;
              // ── Rappel client ──
              // Avance immédiate par défaut (≈90 % des clients) → on affiche
              // TOUJOURS le reste à charge (−50 %) dès qu'il y a un montant.
              // Message manuel : à retirer à la main dans les rares cas « crédit ».
              const prixNumR = parseFloat((ev.prix || "").replace(",", "."));
              const resteR = !isNaN(prixNumR) && prixNumR > 0 ? prixNumR / 2 : null;
              const fmtR = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
              const rappelMsg =
                `Bonjour ${ev.prenom || ""},\n\n` +
                `Petit rappel de votre rendez-vous KinouClean 🙂\n\n` +
                `🧹 ${ev.typePresta || "Prestation KinouClean"}\n` +
                `📅 ${ev.date || "—"}${ev.heure ? ` à ${ev.heure}` : ""}\n` +
                `📍 ${ev.adresse || "—"}\n` +
                (ev.prix && ev.prix !== "0" ? `💶 Montant : ${ev.prix} €\n` : "") +
                (resteR != null ? `💳 Reste à charge : ${fmtR(resteR)} €\n` : "") +
                (resteR != null ? `\nN'oubliez pas de finaliser votre inscription à l'avance immédiate.\n` : "") +
                `\nEn cas d'empêchement, merci de nous prévenir au plus tôt.\n\nÀ très bientôt,\nL'équipe KinouClean`;
              const rappelLien = waLien(ev.tel, rappelMsg);
              return (
                <>
                  {/* ── Header (collant) : nom + statut + modifier / fermer ── */}
                  <div className="sticky top-0 z-10 bg-white px-5 pt-2 sm:pt-4 pb-3 border-b border-gray-100 rounded-t-2xl">
                    <div className="sm:hidden mx-auto mb-2 h-1 w-10 rounded-full bg-gray-200" aria-hidden />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {ev.clientId ? (
                          <button onClick={() => setFicheClientId(ev.clientId)}
                            className={`block font-bold text-base text-left hover:text-blue-600 transition-colors truncate max-w-full ${isArchived ? "line-through text-gray-400" : "text-gray-900"}`}
                            title="Ouvrir la fiche client">
                            {ev.prenom} {ev.nom}
                          </button>
                        ) : (
                          <h3 className={`font-bold text-base truncate ${isArchived ? "line-through text-gray-400" : "text-gray-900"}`}>{ev.prenom} {ev.nom}</h3>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <div className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: isArchived ? "#F3F4F6" : color.light, color: isArchived ? "#6B7280" : color.text }}>
                            {ev.prestataire || "Sans prestataire"}
                          </div>
                          {isArchived && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                              📦 Archivé
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isArchived && (
                          <button onClick={() => setEditEv(ev)}
                            className="text-xs text-blue-500 hover:text-blue-700 font-semibold min-h-[32px] px-1">✏️ Modifier</button>
                        )}
                        <button onClick={() => { setSelectedEvent(null); setCancelConfirm(false); }}
                          aria-label="Fermer"
                          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl font-bold leading-none">×</button>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pt-3 pb-5">
                      <p className="text-sm text-gray-500 mb-3">
                        {ev.typePresta}
                        {ev.quantite && ev.quantite !== "1" && <span className="text-gray-700 font-medium"> — {ev.quantite}</span>}
                      </p>
                      {ev.message?.toLowerCase().includes("2ème passage") && (
                        <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full">
                          🎁 2ème passage gratuit
                        </div>
                      )}
                      {estInscritAvance(ev) && (
                        <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                          <CheckCircle2 size={13} /> Inscrit à l&apos;avance immédiate ⚡
                        </div>
                      )}
                      {/* ── Actions rapides client : appeler / WhatsApp / itinéraire / mail ── */}
                      {(() => {
                        const telClean = (ev.tel || "").replace(/\s/g, "");
                        const quick = [
                          { key: "tel",  icon: "📞", label: "Appeler",    href: telClean ? `tel:${telClean}` : "" },
                          { key: "wa",   icon: "💬", label: "WhatsApp",   href: waMobile(ev.tel) ? `https://wa.me/${waMobile(ev.tel)}` : "" },
                          { key: "maps", icon: "🧭", label: "Itinéraire", href: ev.adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.adresse)}` : "" },
                          { key: "mail", icon: "✉️", label: "Mail",       href: ev.email ? `mailto:${ev.email}` : "" },
                        ];
                        return (
                          <div className="grid grid-cols-4 gap-1.5 mb-3">
                            {quick.map(q => q.href ? (
                              <a key={q.key} href={q.href}
                                {...(q.key === "wa" || q.key === "maps" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                className="min-h-[52px] rounded-xl border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 active:bg-blue-100 transition-colors flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-gray-700">
                                <span className="text-base leading-none">{q.icon}</span>{q.label}
                              </a>
                            ) : (
                              <span key={q.key} title="Information manquante"
                                className="min-h-[52px] rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-gray-300">
                                <span className="text-base leading-none grayscale opacity-50">{q.icon}</span>{q.label}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                      {/* ── Action principale selon le contexte du RDV ── */}
                      {isArchived ? (
                        <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 space-y-0.5">
                          <p className="font-semibold">📦 {archiveReason || "RDV clôturé"}</p>
                          <p className="text-xs text-gray-500">
                            {ev.modePaiement ? `💳 ${ev.modePaiement}` : "💳 Paiement non renseigné"}
                            {ev.prix && ev.prix !== "0" ? ` · ${ev.prix} €` : ""}
                          </p>
                        </div>
                      ) : estPasse ? (
                        <button type="button"
                          onClick={() => { setArchiveEv(ev); setSelectedEvent(null); }}
                          className="mb-3 w-full min-h-[48px] rounded-xl bg-green-600 text-white text-base font-semibold hover:bg-green-700 active:bg-green-800 transition-colors flex items-center justify-center gap-1.5">
                          ✅ Clôturer ce RDV
                        </button>
                      ) : (rappelLien || missionLien) ? (
                        <div className={`mb-3 grid gap-1.5 ${rappelLien && missionLien ? "grid-cols-2" : "grid-cols-1"}`}>
                          {rappelLien && (
                            <a href={rappelLien} target="_blank" rel="noopener noreferrer"
                              className="min-h-[48px] rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 active:bg-sky-800 transition-colors flex items-center justify-center gap-1.5 px-2 text-center">
                              🔔 Rappel WhatsApp
                            </a>
                          )}
                          {missionLien && (
                            <a href={missionLien} target="_blank" rel="noopener noreferrer"
                              className="min-h-[48px] rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 active:bg-green-800 transition-colors flex items-center justify-center gap-1.5 px-2 text-center">
                              📱 Envoyer la mission
                            </a>
                          )}
                        </div>
                      ) : null}
                      {/* ── Infos RDV : date / heure / prestataire / prix / statut ── */}
                      <div className="space-y-1.5 text-sm text-gray-700">
                        {([
                          ["Date",        `${ev.date}${ev.heure ? ` à ${ev.heure}` : ""}`],
                          ["Prestataire", ev.prestataire || "—"],
                          ["Prix",        ev.prix     ? `${ev.prix} €` : null],
                          ["Statut",      ev.statut  || null],
                          ["Adresse",     ev.adresse || null],
                          ["Tél",         ev.tel      || null],
                          ["Message",     ev.message  || null],
                          ["Note",        ev.commentaire || null],
                          ...(isArchived && archiveReason ? [["Motif", archiveReason]] : []),
                        ] as [string, string|null][]).filter(([,v]) => v).map(([label, val]) => (
                          <div key={label} className="flex gap-2">
                            <span className="text-gray-400 w-20 shrink-0">{label}</span>
                            <span className={label === "Motif" ? "text-gray-500 italic" : "min-w-0 break-words"}>{val}</span>
                          </div>
                        ))}
                      </div>

                      {/* ── Messages : mission au prestataire + rappel J-1 au client ── */}
                      {!isArchived && (
                        <FicheSection id="messages" title="Messages">
                          <div className="flex flex-col gap-2">
                            {/* ── WhatsApp prestataire : envoyer la mission (avec réponse directe) ── */}
                            {/* Pas de numéro enregistré pour ce prestataire → on l'indique au lieu de masquer. */}
                            {ev.prestataire && (!prestataireObj?.tel ? (
                              <div className="w-full py-2 rounded-xl border border-dashed border-gray-200 text-gray-400 text-xs text-center px-2">
                                📱 Ajoute un n° à <span className="font-medium">{ev.prestataire}</span> (fiche Prestataires) pour lui envoyer la mission
                              </div>
                            ) : !missionLien ? (
                              <div className="w-full py-2 rounded-xl border border-dashed border-gray-200 text-gray-400 text-xs text-center px-2">
                                📱 Le n° de <span className="font-medium">{ev.prestataire}</span> n&apos;est pas un mobile (06/07) : WhatsApp indisponible
                              </div>
                            ) : (
                              <a
                                href={missionLien}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-2 rounded-xl border border-green-200 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors flex items-center justify-center gap-1.5"
                              >
                                📱 Envoyer la mission à {ev.prestataire}
                              </a>
                            ))}
                            {/* ── Rappel client : WhatsApp si numéro (RDV à venir) + copie toujours dispo ── */}
                            {rappelLien && aVenir && (
                              <a
                                href={rappelLien}
                                target="_blank" rel="noopener noreferrer"
                                className="w-full min-h-[40px] py-2 rounded-xl border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-50 transition-colors flex items-center justify-center gap-1.5"
                              >
                                🔔 Rappel WhatsApp à {ev.prenom}
                              </a>
                            )}
                            <button
                              onClick={() => navigator.clipboard.writeText(rappelMsg).then(() => { setRappelCopied(true); setTimeout(() => setRappelCopied(false), 2000); })}
                              className={`w-full py-2 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${rappelCopied ? "bg-green-50 text-green-700 border-green-200" : "border-sky-200 text-sky-700 hover:bg-sky-50"}`}
                            >
                              📋 {rappelCopied ? "Rappel copié !" : "Copier le message de rappel"}
                            </button>
                          </div>
                        </FicheSection>
                      )}

                      {/* ── Contact client (email / WhatsApp) ── */}
                      {!isArchived && (
                        <FicheSection id="contact" title="Contacter le client" defaultOpen={!estPasse}>
                          <EmailActions
                            prestationId={ev.row}
                            clientEmail={ev.email}
                            clientTel={ev.tel}
                            prenom={ev.prenom}
                            typePresta={ev.typePresta}
                            prix={ev.prix}
                            quantite={ev.quantite}
                            adresse={ev.adresse}
                            date={ev.date}
                            heure={ev.heure}
                            compact
                          />
                        </FicheSection>
                      )}

                      {/* ── Satisfaction + avis (modifiables même après archivage, pour les primes) ── */}
                      <FicheSection id="avis" title="Satisfaction & avis" defaultOpen={estPasse || isArchived}>
                        {/* Satisfaction + avis — modifiables manuellement, même après archivage (primes) */}
                        <div className="mb-2 rounded-xl border border-gray-100 p-2.5">
                          <div className="flex items-center justify-between gap-1 mb-2">
                            {[{ e: "😠", n: 1 }, { e: "🙁", n: 2 }, { e: "😐", n: 3 }, { e: "🙂", n: 4 }, { e: "😄", n: 5 }].map(({ e, n }) => (
                              <button key={n} type="button" onClick={() => majAvisSatisf(ev.row, { satisfaction: ev.satisfaction === n ? 0 : n })}
                                title={["Très mécontent", "Mécontent", "Neutre", "Content", "Très content"][n - 1]}
                                className={`flex-1 py-1 rounded-lg text-xl transition-all ${ev.satisfaction === n ? "bg-emerald-50 scale-110" : "grayscale opacity-45 hover:opacity-80"}`}>
                                {e}
                              </button>
                            ))}
                          </div>
                          <button type="button" onClick={() => majAvisSatisf(ev.row, { avisLaisse: ev.avis !== "OUI" })}
                            className={`w-full py-2 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                              ev.avis === "OUI" ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:bg-amber-50"
                            }`}>
                            ⭐ {ev.avis === "OUI" ? "Avis laissé (prime) — cliquer pour retirer" : "Marquer : avis laissé"}
                          </button>
                        </div>
                    {/* ── Avis client (affiché même si archivé) ── */}
                    {(ev.prenom || ev.nom) && (
                      <div className={`flex flex-col gap-2`}>
                        <button
                          onClick={() => {
                            const params = new URLSearchParams({ nom: `${ev.prenom} ${ev.nom}`.trim() });
                            if (ev.typePresta) params.set("prestation", ev.typePresta);
                            const url = `${window.location.origin}/avis/${ev.row}?${params.toString()}`;
                            navigator.clipboard.writeText(url).then(() => {
                              setAvisLinkCopied(true);
                              setTimeout(() => setAvisLinkCopied(false), 2000);
                            });
                          }}
                          className={`w-full py-2 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                            avisLinkCopied
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
                          }`}
                        >
                          ⭐ {avisLinkCopied ? "Lien copié !" : "Copier lien avis"}
                        </button>
                        {(() => {
                          const params = new URLSearchParams({ nom: `${ev.prenom} ${ev.nom}`.trim() });
                          if (ev.typePresta) params.set("prestation", ev.typePresta);
                          const avisUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/avis/${ev.row}?${params.toString()}`;
                          const avisLien = waLien(ev.tel, waTexteAvis({ prenom: ev.prenom, prestation: ev.typePresta, lien: avisUrl }));
                          return avisLien ? (
                            <a href={avisLien} target="_blank" rel="noopener noreferrer"
                              className="w-full min-h-[40px] py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 active:bg-green-800 transition-colors flex items-center justify-center gap-1.5">
                              💬 Envoyer la demande d&apos;avis sur WhatsApp
                            </a>
                          ) : null;
                        })()}
                        <button
                          onClick={() => {
                            const params = new URLSearchParams({ nom: `${ev.prenom} ${ev.nom}`.trim() });
                            if (ev.typePresta) params.set("prestation", ev.typePresta);
                            const avisUrl = `${window.location.origin}/avis/${ev.row}?${params.toString()}`;
                            const msg = waTexteAvis({ prenom: ev.prenom, prestation: ev.typePresta, lien: avisUrl });
                            navigator.clipboard.writeText(msg).then(() => {
                              setAvisMsgCopied(true);
                              setTimeout(() => setAvisMsgCopied(false), 2000);
                            });
                          }}
                          className={`w-full py-2 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                            avisMsgCopied
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          }`}
                        >
                          💬 {avisMsgCopied ? "Message copié !" : "Copier message fin de prestation"}
                        </button>
                      </div>
                    )}
                      </FicheSection>

                      {/* ── Mode de paiement (visible + modifiable même archivé) ── */}
                      {(() => {
                        const PAYMENT_OPTIONS = [
                          { label: "Espèces",           icon: "💵" },
                          { label: "Virement bancaire",  icon: "🏦" },
                          { label: "Lien de paiement",   icon: "🔗" },
                          { label: "Chèque",             icon: "📄" },
                          { label: "Carte sur place",    icon: "💳" },
                          { label: "Avance immédiate", icon: "⚡" },
                        ];
                        return (
                          <FicheSection id="paiement" title="Mode de paiement"
                            aside={paymentSaving ? <span className="text-[10px] text-blue-400 normal-case font-normal">Enregistrement…</span>
                              : <span className="text-[11px] text-gray-500 normal-case font-medium truncate">{ev.modePaiement || "Non défini"}</span>}>
                            <div className="grid grid-cols-2 gap-1.5">
                              {PAYMENT_OPTIONS.map(({ label, icon }) => (
                                <button key={label} type="button"
                                  disabled={paymentSaving}
                                  onClick={() => updatePaymentMode(ev.row, ev.modePaiement === label ? "" : label)}
                                  className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                                    ev.modePaiement === label
                                      ? "bg-blue-600 text-white border-blue-600"
                                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                                  } disabled:opacity-50`}>
                                  <span>{icon}</span>
                                  <span className="truncate">{label}</span>
                                </button>
                              ))}
                            </div>
                          </FicheSection>
                        );
                      })()}

                      {/* ── Fiscalité du client (pense-bête + adapte les relances) ── */}
                      {ev.clientId && (
                        <FicheSection id="fiscal" title="Avantage fiscal du client">
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { val: "" as const,        label: "Aucun",           icon: "—"  },
                              { val: "avance" as const,  label: "Avance imméd.",   icon: "⚡" },
                              { val: "credit" as const,  label: "Crédit d'impôt",  icon: "🧾" },
                            ].map(({ val, label, icon }) => (
                              <button key={label} type="button"
                                disabled={fiscalSaving}
                                onClick={() => setFiscalPref(ev.clientId, val)}
                                className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors flex flex-col items-center gap-0.5 ${
                                  fiscal === val
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                                } disabled:opacity-50`}>
                                <span>{icon}</span>
                                <span className="truncate text-[11px]">{label}</span>
                              </button>
                            ))}
                          </div>
                          {fiscal && (
                            <p className="text-[11px] text-indigo-500 mt-1.5">
                              💡 {fiscal === "avance" ? "Ses relances mentionnent l'avance immédiate (−50%)." : "Ses relances mentionnent le crédit d'impôt (−50%)."}
                            </p>
                          )}
                        </FicheSection>
                      )}

                      {/* ── Photos de l'intervention (prises par le prestataire) ── */}
                      {Array.isArray(ev.photos) && ev.photos.length > 0 && (
                        <FicheSection id="photos" title="📷 Photos de l'intervention" defaultOpen>
                          {Array.from(new Set(ev.photos.map(p => p.article))).map(art => (
                            <div key={art} className="mb-2">
                              <p className="text-[11px] font-medium text-gray-600 mb-1">{art}</p>
                              <div className="flex gap-3">
                                {(["avant", "apres"] as const).map(phase => {
                                  const ph = ev.photos!.filter(p => p.article === art && p.phase === phase);
                                  return (
                                    <div key={phase}>
                                      <p className={`text-[10px] mb-0.5 ${phase === "avant" ? "text-orange-600" : "text-green-600"}`}>{phase === "avant" ? "Avant" : "Après"}</p>
                                      <div className="flex gap-1">
                                        {ph.length === 0 ? <span className="text-[10px] text-gray-300">—</span> : ph.map(p => (
                                          <button type="button" key={p.path} onClick={() => setLightbox({ photos: ev.photos!, index: ev.photos!.findIndex(pp => pp.path === p.path) })}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={p.url} alt={art} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                          {/* ── Envoi des photos au client (PDF compte rendu) ── */}
                          {(() => {
                            const info = photosInfo && photosInfo.row === ev.row ? photosInfo : null;
                            const envoi = info?.envoi || null;
                            const emailClient = info?.email || ev.email || "";
                            return (
                              <div className="mt-2">
                                {envoi && (
                                  <p className="text-[11px] text-green-700 mb-1.5">✓ Envoyées le {frJJMM(envoi.le)} à {envoi.a}</p>
                                )}
                                {!photosSheet ? (
                                  <button type="button"
                                    onClick={() => { setPhotosSheet(true); setPhotosTo(t => t || emailClient); }}
                                    className="w-full py-2 rounded-xl border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors">
                                    {envoi ? "📸 Renvoyer les photos au client" : "📸 Envoyer les photos au client"}
                                  </button>
                                ) : (
                                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                                    <p className="text-xs text-blue-900 font-semibold">Envoyer le compte rendu photos (PDF)</p>
                                    {emailClient ? (
                                      <label className="block">
                                        <span className="text-[11px] text-gray-600">Destinataire</span>
                                        <input type="email" inputMode="email" value={photosTo} onChange={e => setPhotosTo(e.target.value)}
                                          className="mt-0.5 w-full bg-white border border-blue-200 rounded-lg px-2.5 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                      </label>
                                    ) : (
                                      <p className="text-[12px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-2">
                                        Pas d&apos;adresse email sur la fiche client — ajoute-la depuis la fiche client pour pouvoir envoyer les photos.
                                      </p>
                                    )}
                                    <label className="block">
                                      <span className="text-[11px] text-gray-600">Message personnel (optionnel)</span>
                                      <textarea value={photosMsg} onChange={e => setPhotosMsg(e.target.value)} rows={3} maxLength={2000}
                                        placeholder="Ex. : Pensez à bien aérer la pièce pendant le séchage…"
                                        className="mt-0.5 w-full bg-white border border-blue-200 rounded-lg px-2.5 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
                                    </label>
                                    <div className="flex gap-2">
                                      <a href={`/api/prestations/${ev.row}/photos?pdf=1`} target="_blank" rel="noopener noreferrer"
                                        className="flex-1 py-2 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-medium text-center hover:bg-blue-100 transition-colors">
                                        Aperçu du PDF
                                      </a>
                                      <button type="button" disabled={photosBusy || !emailClient || !photosTo.trim()}
                                        onClick={() => envoyerPhotos(ev.row)}
                                        className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                                        {photosBusy ? (<><Loader2 size={14} className="animate-spin" /> Envoi…</>) : "Envoyer"}
                                      </button>
                                    </div>
                                    <button type="button" onClick={() => setPhotosSheet(false)} disabled={photosBusy}
                                      className="w-full text-[12px] text-gray-500 py-1">Annuler</button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </FicheSection>
                      )}

                      {/* ── Gestion du RDV : ajout, 2ème passage, puis actions sensibles en bas ── */}
                      <div className="mt-4 border-t border-gray-100 pt-3 flex flex-col gap-2">
                        {!isArchived && (<>
                          {/* ── Ajouter une prestation à ce RDV (même client, même créneau) ── */}
                          {!addOpen ? (
                            <button type="button" onClick={() => { setAddOpen(true); setAddType(""); setAddUnit(""); setAddNb("1"); }}
                              className="w-full py-2 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5">
                              ➕ Ajouter une prestation
                            </button>
                          ) : (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                              <p className="text-xs text-emerald-800 font-semibold">Ajouter une prestation — {ev.prenom} {ev.nom}</p>
                              <select value={addType} onChange={e => setAddType(e.target.value)}
                                className="w-full bg-white border border-emerald-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                                <option value="">— Type de prestation —</option>
                                {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <div className="flex items-end gap-2 flex-wrap">
                                <div>
                                  <label className="text-[11px] text-gray-500 block mb-0.5">Prix unitaire (€)</label>
                                  <input type="number" step="0.01" value={addUnit} onChange={e => setAddUnit(e.target.value)}
                                    className="w-24 bg-white border border-emerald-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="0.00" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-gray-500 block mb-0.5">Nombre</label>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => setAddNb(String(Math.max(1, (parseInt(addNb) || 1) - 1)))} className="w-7 h-7 rounded-lg border border-emerald-200 bg-white text-gray-600 text-lg leading-none">–</button>
                                    <input type="number" min={1} value={addNb} onChange={e => setAddNb(e.target.value)} className="w-11 text-center bg-white border border-emerald-200 rounded-lg px-1 py-1.5 text-sm" />
                                    <button type="button" onClick={() => setAddNb(String((parseInt(addNb) || 1) + 1))} className="w-7 h-7 rounded-lg border border-emerald-200 bg-white text-gray-600 text-lg leading-none">+</button>
                                  </div>
                                </div>
                                {(() => { const t = (parseFloat(addUnit.replace(",", ".")) || 0) * Math.max(1, parseInt(addNb) || 1); return t > 0 ? <div className="text-sm text-gray-700 pb-1.5">= <strong>{t.toFixed(2)} €</strong></div> : null; })()}
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setAddOpen(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Annuler</button>
                                <button type="button" onClick={() => ajouterPrestation(ev.row)} disabled={!addType || addBusy}
                                  className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                                  {addBusy ? <Loader2 size={14} className="animate-spin" /> : null} Ajouter
                                </button>
                              </div>
                            </div>
                          )}
                        </>)}
                      {/* ── Reprogrammer un 2ème passage GRATUIT (offre fidélité) — RDV archivé ── */}
                      {isArchived && (ev.prenom || ev.nom) && (
                        <div className="flex flex-col gap-2">
                          {!reprog2Open ? (
                            <button type="button" onClick={() => { setReprog2Open(true); setReprog2Date(""); setReprog2Hrs(ev.heure || ""); }}
                              className="w-full py-2 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5">
                              🎁 Reprogrammer un 2ème passage (gratuit)
                            </button>
                          ) : (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                              <p className="text-xs text-emerald-800 font-semibold">2ème passage gratuit — {ev.prenom} {ev.nom}</p>
                              <p className="text-[11px] text-emerald-700">Même client, même prestation. Créé dans l&apos;agenda à 0 €, marqué « 2ème passage ».</p>
                              <div className="flex gap-2">
                                <input type="date" value={reprog2Date} onChange={e => setReprog2Date(e.target.value)}
                                  className="flex-1 border border-emerald-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                                <input type="time" value={reprog2Hrs} onChange={e => setReprog2Hrs(e.target.value)}
                                  className="w-28 border border-emerald-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                              </div>
                              <select value={reprog2Presta} onChange={e => setReprog2Presta(e.target.value)}
                                className="w-full border border-emerald-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                                <option value="">Prestataire : à affecter plus tard</option>
                                {prestataires.map(pr => <option key={pr.nom} value={pr.nom}>{pr.nom}</option>)}
                              </select>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setReprog2Open(false)}
                                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Annuler</button>
                                <button type="button" onClick={() => reprogram2(ev.row)} disabled={!reprog2Date || reprog2Busy}
                                  className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                                  {reprog2Busy ? <Loader2 size={14} className="animate-spin" /> : null} Programmer
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                        {!isArchived && (
                          <div className="mt-2 pt-3 border-t border-dashed border-gray-200 flex flex-col gap-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions sur le RDV</p>
                          <button
                            onClick={() => {
                              setRescheduleEv(ev);
                              setRescheduleDate(ev.date || "");
                              setRescheduleHrs(ev.heure || "");
                              setSelectedEvent(null);
                            }}
                            className="w-full py-2 rounded-xl border border-blue-200 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5"
                          >
                            📅 Déplacer ce RDV
                          </button>
                          <button
                            onClick={() => {
                              setArchiveEv(ev);
                              setSelectedEvent(null);
                            }}
                            className="w-full py-2 rounded-xl border border-orange-200 text-orange-600 text-sm font-medium hover:bg-orange-50 transition-colors flex items-center justify-center gap-1.5"
                          >
                            📦 Clôturer / archiver ce RDV
                          </button>
                          {/* ── Annulation rapide ── */}
                          {!cancelConfirm ? (
                            <button
                              onClick={() => setCancelConfirm(true)}
                              className="w-full py-2 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5"
                            >
                              ❌ Annuler ce RDV
                            </button>
                          ) : (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                              <p className="text-xs text-red-700 font-medium text-center">Confirmer l&apos;annulation ?</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setCancelConfirm(false)}
                                  className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  Retour
                                </button>
                                <button
                                  onClick={() => quickCancel(ev.row)}
                                  disabled={cancelling}
                                  className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                                >
                                  {cancelling ? "Annulation…" : "Oui, annuler"}
                                </button>
                              </div>
                            </div>
                          )}
                          </div>
                        )}
                      </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Modifier le RDV : formulaire unique (même que la page Prestations) ── */}
      {editEv && (
        <EditPrestationModal
          prestation={editEv}
          prestataires={prestataires}
          onClose={() => setEditEv(null)}
          onSaved={(row, updates) => {
            // Fiche RDV gardée ouverte : MAJ immédiate puis données fraîches au rechargement.
            setSelectedEvent(prev => prev && prev.row === row ? { ...prev, ...updates } as Prestation : prev);
            refreshSelRef.current = row;
            loadData();
            toast.success("Modifications enregistrées");
          }}
          onClotured={() => { setSelectedEvent(null); loadData(); }}
        />
      )}

      {/* ── Modal détail jour (vue mois) ─────────────────────────────── */}
      {selectedMonthDay && !createSlot && (
        <DayDetailModal
          day={selectedMonthDay}
          events={eventsForDay(selectedMonthDay)}
          colorMap={colorMap}
          idByNom={idByNom}
          onClose={() => setSelectedMonthDay(null)}
          onCreateSlot={slot => { setSelectedMonthDay(null); setCreateSlot(slot); }}
          onSelectEvent={ev => { setSelectedMonthDay(null); setSelectedEvent(ev); }}
        />
      )}

      {/* ── Modal création rapide ────────────────────────────────────────── */}
      {createSlot && (
        <NewClientModal
          initialValues={{ date: createSlot.date, heure: createSlot.heure }}
          prestataires={prestataires}
          onClose={() => setCreateSlot(null)}
          onSaved={() => loadData()} // la fenêtre reste ouverte sur son écran de succès
        />
      )}

      {/* ── Clôture / archivage RDV — modale unique partagée ─────────────────── */}
      {archiveEv && (
        <ClotureModal prestation={archiveEv} onClose={() => setArchiveEv(null)} onDone={() => loadData()} />
      )}

      {/* ── Modal déplacer RDV ────────────────────────────────────────────── */}
      {rescheduleEv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setRescheduleEv(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">📅 Déplacer le RDV</h3>
              <button onClick={() => setRescheduleEv(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{rescheduleEv.prenom} {rescheduleEv.nom}</span>
              {rescheduleEv.typePresta ? ` — ${rescheduleEv.typePresta}` : ""}
            </p>
            {/* Raccourcis : demain (Paris) même heure / même jour +7 j même heure */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button type="button"
                onClick={() => { setRescheduleDate(fromInputDate(isoParis(1))); setRescheduleHrs(rescheduleEv.heure || rescheduleHrs); }}
                className="min-h-[40px] rounded-xl border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors">
                Demain
              </button>
              <button type="button"
                onClick={() => {
                  const base = frToDate(rescheduleEv.date) ?? frToDate(fromInputDate(isoParis()))!;
                  setRescheduleDate(toFrDate(addDays(base, 7)));
                  setRescheduleHrs(rescheduleEv.heure || rescheduleHrs);
                }}
                className="min-h-[40px] rounded-xl border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors">
                +1 sem. même heure
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="min-w-0">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nouvelle date</label>
                <input
                  type="date"
                  value={toInputDate(rescheduleDate)}
                  onChange={e => setRescheduleDate(fromInputDate(e.target.value))}
                  className="w-full min-h-[40px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nouvelle heure</label>
                <input
                  type="time"
                  value={rescheduleHrs}
                  onChange={e => setRescheduleHrs(e.target.value)}
                  className="w-full min-h-[40px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRescheduleEv(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                disabled={!rescheduleDate || rescheduleSaving}
                onClick={() => reschedulePrestation(rescheduleEv, rescheduleDate, rescheduleHrs)}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {rescheduleSaving ? "Sauvegarde…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {lightbox && (
        <PhotoLightbox photos={lightbox.photos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
      </div>
    </div>
  );
}
