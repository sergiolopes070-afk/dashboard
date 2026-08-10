"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, X, SlidersHorizontal, Download, CheckCircle2, MapPin, Loader2 } from "lucide-react";
import { Prestation, Prestataire, StatutClient } from "@/lib/constants";
import { useToast } from "@/components/Toast";
import { ClientFicheById } from "@/components/ClientFiche";
import EmailActions from "@/components/EmailActions";
import NewClientModal from "@/components/NewClientModal";
import { cacheGet, cacheSet, cacheHas, CACHE_KEYS } from "@/lib/dataCache";

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
const STATUTS: StatutClient[] = ["EMAIL ENVOYÉ","CONFIRMÉ","TERMINÉ","ANNULÉ",""];

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
function toFrDate(d: Date): string {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}
function frToDate(fr: string): Date | null {
  if (!fr) return null;
  const p = fr.split("/");
  return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])) : null;
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

// ─── Raisons d'archivage sans paiement (annulations) ────────────────────────
const CANCELLATION_REASONS = ["Annulation client", "Client injoignable", "Doublon"];
const isCancellationReason = (r: string) => CANCELLATION_REASONS.some(cr => r.startsWith(cr));

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
const TYPES_PRESTA = [
  "Ménage", "Repassage", "Vitres", "Débarras",
  "Après travaux", "Bureaux", "Lavage Canapé", "Lavage véhicule", "Lavage de matelas", "Autre",
];

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

// ─── Hook auto-ville ──────────────────────────────────────────────────────────
function useVilleFromCP(cp: string) {
  const [villes,  setVilles]  = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (cp.length !== 5) { setVilles([]); return; }
    setLoading(true);
    fetch(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom&format=json`)
      .then(r => r.json())
      .then((data: { nom: string }[]) => setVilles(data.map(d => d.nom)))
      .catch(() => setVilles([]))
      .finally(() => setLoading(false));
  }, [cp]);
  return { villes, loading };
}

// ─── Autocomplete adresse (Base Adresse Nationale) ───────────────────────────
interface BanFeature {
  properties: { label: string; name: string; postcode: string; city: string };
}

function useAddressSearch(query: string) {
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (query.length < 4) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=6`)
        .then(r => r.json())
        .then((d: { features: BanFeature[] }) => setSuggestions(d.features || []))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);
  return { suggestions, loading };
}

function AddressAutocomplete({ value, onChange, onSelect, inputCls }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (adresse: string, cp: string, ville: string) => void;
  inputCls: string;
}) {
  const [open,        setOpen]        = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { suggestions } = useAddressSearch(searchQuery);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setSearchQuery(e.target.value); setOpen(true); }}
        onFocus={() => searchQuery.length >= 4 && setOpen(true)}
        placeholder="12 rue de la Paix, Paris…"
        autoComplete="off"
        className={inputCls}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onSelect(s.properties.name, s.properties.postcode, s.properties.city);
                setSearchQuery("");
                setOpen(false);
              }}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex items-start gap-2"
            >
              <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <span>{s.properties.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function AgendaPage() {
  const toast = useToast();
  const [prestations,  setPrestations]  = useState<Prestation[]>(() => cacheGet<Prestation[]>(CACHE_KEYS.agenda) ?? []);
  const [prestataires, setPrestataires] = useState<Prestataire[]>(() => cacheGet<Prestataire[]>(CACHE_KEYS.prestataires) ?? []);
  const [loading,      setLoading]      = useState(() => !cacheHas(CACHE_KEYS.agenda));
  const [weekStart,    setWeekStart]    = useState<Date>(() => getMondayOfWeek(new Date()));
  const [monthDate,    setMonthDate]    = useState<Date>(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [viewMode,     setViewMode]     = useState<"week"|"month">("week");
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

  // ── Archive depuis l'agenda ────────────────────────────────────────────────
  const [archiveEv,      setArchiveEv]      = useState<Prestation | null>(null);
  const [archiveReason,  setArchiveReason]  = useState("");
  const [archivePayment, setArchivePayment] = useState("");
  const [archiveComment, setArchiveComment] = useState("");
  const [archiveSendAvis, setArchiveSendAvis] = useState(true); // demander un avis au client à l'archivage
  const [archiving,      setArchiving]      = useState(false);
  const [avisGlobalActif, setAvisGlobalActif] = useState(true); // interrupteur global (Configuration)

  // Charge l'état global des demandes d'avis (Configuration → Automatisations).
  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(s => {
      const actif = s ? s.avis_actif !== "false" : true;
      setAvisGlobalActif(actif);
      setArchiveSendAvis(actif); // par défaut aligné sur l'interrupteur global
    }).catch(() => {});
  }, []);

  // ── Édition inline depuis le modal ────────────────────────────────────────
  const [editMode,   setEditMode]   = useState(false);
  const [editForm,   setEditForm]   = useState<Partial<Prestation>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editCp,     setEditCp]     = useState("");
  const [editVille,  setEditVille]  = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling,    setCancelling]    = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadData = () => {
    Promise.all([
      fetch("/api/prestations").then(r => r.json()),
      fetch("/api/prestataires").then(r => r.json()),
      fetch("/api/archive").then(r => r.json()),
    ]).then(([prestas, prestas2, archived]) => {
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
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  // Auto-scroll vers 08h00
  useEffect(() => {
    if (!loading && viewMode === "week" && scrollRef.current) {
      scrollRef.current.scrollTop = (8 - HOUR_START) * HOUR_PX - 8;
    }
  }, [loading, viewMode]);

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

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navPrev() {
    if (viewMode === "week") setWeekStart(w => addDays(w, -7));
    else setMonthDate(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function navNext() {
    if (viewMode === "week") setWeekStart(w => addDays(w, 7));
    else setMonthDate(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function navToday() {
    if (viewMode === "week") setWeekStart(getMondayOfWeek(new Date()));
    else { const d = new Date(); setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1)); }
  }

  // ── Reschedule (drag & modal) ───────────────────────────────────────────────
  async function reschedulePrestation(ev: Prestation, newDate: string, newHeure: string) {
    setRescheduleSaving(true);
    // Optimistic UI
    setPrestations(prev => prev.map(p =>
      p.row === ev.row ? { ...p, date: newDate, heure: newHeure } : p
    ));
    setSelectedEvent(null);
    setRescheduleEv(null);
    try {
      await fetch("/api/prestations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: ev.row, updates: { date: newDate, heure: newHeure } }),
      });
    } catch {
      loadData(); // rollback
    } finally {
      setRescheduleSaving(false);
    }
  }

  // ── Archive depuis l'agenda ────────────────────────────────────────────────
  async function handleArchiveConfirm() {
    if (!archiveEv) return;
    setArchiving(true);
    const fullReason = archiveReason + (archiveComment.trim() ? ` — ${archiveComment.trim()}` : "");
    const prestationId = archiveEv.row;
    const envoyerAvis  = archiveSendAvis && !isCancellationReason(archiveReason);
    try {
      await fetch("/api/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prestationId, reason: fullReason, modePaiement: archivePayment }),
      });
      setArchiveEv(null);
      setArchiveReason("");
      setArchivePayment("");
      setArchiveComment("");
      setArchiveSendAvis(true);
      loadData();
      toast.success("Prestation archivée");

      // Envoi de la demande d'avis (si coché et prestation réalisée)
      if (envoyerAvis) {
        try {
          const res = await fetch("/api/emails/send-avis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prestationId }),
          });
          const d = await res.json().catch(() => ({}));
          if (res.ok) toast.success("Demande d'avis envoyée au client ⭐");
          else toast.error(d.error || "Avis non envoyé");
        } catch {
          toast.error("Avis non envoyé (réseau)");
        }
      }
    } catch {
      toast.error("Erreur lors de l'archivage. Réessayez.");
    } finally {
      setArchiving(false);
    }
  }

  // ── Sauvegarde édition inline ─────────────────────────────────────────────
  async function saveEdit() {
    if (!selectedEvent) return;
    setEditSaving(true);
    const updates: Record<string, string> = {};
    (Object.keys(editForm) as (keyof Prestation)[]).forEach(k => {
      updates[k] = String(editForm[k] ?? "");
    });
    // Combiner adresse + CP + ville si CP ou ville renseignés
    const fullAdresse = [editForm.adresse, editCp, editVille].filter(Boolean).join(" ");
    if (fullAdresse) updates.adresse = fullAdresse;
    try {
      const res = await fetch("/api/prestations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: selectedEvent.row, updates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      // Recharger les vraies données depuis la base
      loadData();
      const updated = { ...selectedEvent, ...editForm, adresse: fullAdresse || editForm.adresse || selectedEvent.adresse } as Prestation;
      setSelectedEvent(updated);
      setEditMode(false);
      setEditCp(""); setEditVille("");
      toast.success("Modifications enregistrées");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(`Erreur lors de la sauvegarde : ${msg}`);
    } finally {
      setEditSaving(false);
    }
  }

  // ── Annulation rapide (sans motif, sans modal) ───────────────────────────
  async function quickCancel(evRow: string) {
    setCancelling(true);
    try {
      await fetch("/api/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: evRow, reason: "Annulation client", modePaiement: "" }),
      });
      setSelectedEvent(null);
      setCancelConfirm(false);
      loadData();
    } finally {
      setCancelling(false);
    }
  }

  // ── Mise à jour mode de paiement (même sur archivé) ─────────────────────
  async function updatePaymentMode(evRow: string, newMode: string) {
    setPaymentSaving(true);
    try {
      await fetch("/api/prestations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: evRow, updates: { modePaiement: newMode } }),
      });
      setPrestations(prev => prev.map(p =>
        p.row === evRow ? { ...p, modePaiement: newMode as Prestation["modePaiement"] } : p
      ));
      setSelectedEvent(prev => prev ? { ...prev, modePaiement: newMode as Prestation["modePaiement"] } : prev);
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
    <div className="min-h-screen bg-gray-50 flex">

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

        {/* Barre navigation */}
        <div className="bg-white border-b border-gray-200 px-2 sm:px-4 py-2.5 flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Bouton filtre prestataires - mobile only */}
          <button
            onClick={() => setFilterOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors md:hidden shrink-0"
            title="Filtrer par prestataire"
          >
            <SlidersHorizontal size={17} className="text-gray-600" />
          </button>
          <button onClick={navPrev} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <button onClick={navToday}
            className="px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors shrink-0">
            Auj.
          </button>
          <button onClick={navNext} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
          <h2 className="text-xs sm:text-sm font-semibold text-gray-800 ml-1 flex-1 truncate">
            {viewMode === "week" ? weekLabel : monthLabel}
          </h2>
          {/* Toggle semaine / mois */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium shrink-0">
            <button
              onClick={() => setViewMode("week")}
              className={`px-2 sm:px-3 py-1.5 transition-colors ${viewMode==="week" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              Sem.
            </button>
            <button
              onClick={() => { setViewMode("month"); setMonthDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)); }}
              className={`px-2 sm:px-3 py-1.5 transition-colors ${viewMode==="month" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              Mois
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Chargement…</div>
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
                          <div key={ev.row} className={`w-full rounded overflow-hidden ${isArchived ? "opacity-55" : ""}`}
                            style={{ backgroundColor: isArchived ? "#F3F4F6" : color.light }}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { setSelectedEvent(null); setCancelConfirm(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            {(() => {
              const ev    = selectedEvent;
              const pid   = idByNom[ev.prestataire];
              const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg:"#9CA3AF", light:"#F3F4F6", text:"#374151" };
              const isArchived = !!(ev as Prestation & { _archived?: boolean; archive_reason?: string })._archived;
              const archiveReason = (ev as Prestation & { _archived?: boolean; archive_reason?: string }).archive_reason;
              const inputCls = "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400";
              return (
                <>
                  {/* ── Header ── */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
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
                    <div className="flex items-center gap-2">
                      {!isArchived && (
                        editMode
                          ? <button onClick={() => setEditMode(false)} className="text-xs text-gray-400 hover:text-gray-600 font-medium">Annuler</button>
                          : <button
                              onClick={() => {
                                setEditForm({
                                  prenom: ev.prenom, nom: ev.nom, tel: ev.tel, email: ev.email,
                                  typePresta: ev.typePresta, adresse: ev.adresse, prix: ev.prix,
                                  prestataire: ev.prestataire, statut: ev.statut,
                                  heure: ev.heure, date: ev.date,
                                  message: ev.message, commentaire: ev.commentaire,
                                  modePaiement: ev.modePaiement,
                                });
                                setEditCp(""); setEditVille("");
                                setEditMode(true);
                              }}
                              className="text-xs text-blue-500 hover:text-blue-700 font-semibold"
                            >✏️ Modifier</button>
                      )}
                      <button onClick={() => { setSelectedEvent(null); setEditMode(false); setCancelConfirm(false); }}
                        className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
                    </div>
                  </div>

                  {/* ── Mode édition ── */}
                  {editMode ? (
                    <div className="space-y-3 mb-4">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Prénom</label>
                          <input className={inputCls} value={editForm.prenom ?? ""} onChange={e => setEditForm(f => ({ ...f, prenom: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Nom</label>
                          <input className={inputCls} value={editForm.nom ?? ""} onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Téléphone</label>
                        <input className={inputCls} value={editForm.tel ?? ""} onChange={e => setEditForm(f => ({ ...f, tel: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Email</label>
                        <input className={inputCls} value={editForm.email ?? ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Prestation</label>
                        <select className={inputCls} value={editForm.typePresta ?? ""} onChange={e => setEditForm(f => ({ ...f, typePresta: e.target.value }))}>
                          <option value="">— Choisir —</option>
                          {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Adresse</label>
                        <AddressAutocomplete
                          value={editForm.adresse ?? ""}
                          onChange={v => setEditForm(f => ({ ...f, adresse: v }))}
                          onSelect={(adresse, cp, ville) => {
                            setEditForm(f => ({ ...f, adresse }));
                            setEditCp(cp);
                            setEditVille(ville);
                          }}
                          inputCls={inputCls}
                        />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <input
                            className={inputCls}
                            placeholder="Code postal"
                            value={editCp}
                            onChange={e => setEditCp(e.target.value)}
                          />
                          <input
                            className={inputCls}
                            placeholder="Ville"
                            value={editVille}
                            onChange={e => setEditVille(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Date (JJ/MM/AAAA)</label>
                          <input className={inputCls} value={editForm.date ?? ""} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} placeholder="JJ/MM/AAAA" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Heure</label>
                          <input className={inputCls} value={editForm.heure ?? ""} onChange={e => setEditForm(f => ({ ...f, heure: e.target.value }))} placeholder="HH:MM" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Prix (€)</label>
                          <input className={inputCls} type="number" value={editForm.prix ?? ""} onChange={e => setEditForm(f => ({ ...f, prix: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Statut</label>
                          <select className={inputCls} value={editForm.statut ?? ""} onChange={e => setEditForm(f => ({ ...f, statut: e.target.value as Prestation["statut"] }))}>
                            {STATUTS.map(s => <option key={s} value={s}>{s || "—"}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Prestataire</label>
                        <select className={inputCls} value={editForm.prestataire ?? ""} onChange={e => setEditForm(f => ({ ...f, prestataire: e.target.value }))}>
                          <option value="">— Aucun —</option>
                          {prestataires.map(p => <option key={p.id} value={p.nom}>{p.nom}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Message client</label>
                        <textarea className={inputCls} rows={2} value={editForm.message ?? ""} onChange={e => setEditForm(f => ({ ...f, message: e.target.value }))} placeholder="Message du client…" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Note interne</label>
                        <textarea className={inputCls} rows={2} value={editForm.commentaire ?? ""} onChange={e => setEditForm(f => ({ ...f, commentaire: e.target.value }))} placeholder="Note interne…" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-2 block">Mode de paiement</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Espèces",           icon: "💵" },
                            { label: "Virement bancaire",  icon: "🏦" },
                            { label: "Lien de paiement",   icon: "🔗" },
                            { label: "Chèque",             icon: "📄" },
                            { label: "Carte sur place",    icon: "💳" },
                            { label: "Avance immédiate", icon: "⚡" },
                          ].map(({ label, icon }) => (
                            <button key={label} type="button"
                              onClick={() => setEditForm(f => ({ ...f, modePaiement: f.modePaiement === label ? undefined : label as Prestation["modePaiement"] }))}
                              className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                                editForm.modePaiement === label
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                              }`}>
                              <span>{icon}</span>
                              <span className="truncate">{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={saveEdit}
                        disabled={editSaving}
                        className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {editSaving ? "Enregistrement…" : "Enregistrer les modifications"}
                      </button>
                    </div>
                  ) : (
                    /* ── Mode affichage ── */
                    <>
                      {ev.clientId ? (
                        <button onClick={() => setFicheClientId(ev.clientId)}
                          className={`font-bold text-base mb-1 text-left hover:text-blue-600 transition-colors ${isArchived ? "line-through text-gray-400" : "text-gray-900"}`}
                          title="Ouvrir la fiche client">
                          {ev.prenom} {ev.nom}
                        </button>
                      ) : (
                        <h3 className={`font-bold text-base mb-1 ${isArchived ? "line-through text-gray-400" : "text-gray-900"}`}>{ev.prenom} {ev.nom}</h3>
                      )}
                      <p className="text-sm text-gray-500 mb-3">{ev.typePresta}</p>
                      <div className="space-y-1.5 text-sm text-gray-700">
                        {([
                          ["Date",     `${ev.date}${ev.heure ? ` à ${ev.heure}` : ""}`],
                          ["Adresse",  ev.adresse || null],
                          ["Statut",   ev.statut  || null],
                          ["Prix",     ev.prix     ? `${ev.prix} €` : null],
                          ["Tél",      ev.tel      || null],
                          ["Message",  ev.message  || null],
                          ["Note",     ev.commentaire || null],
                          ...(isArchived && archiveReason ? [["Motif", archiveReason]] : []),
                        ] as [string, string|null][]).filter(([,v]) => v).map(([label, val]) => (
                          <div key={label} className="flex gap-2">
                            <span className="text-gray-400 w-20 shrink-0">{label}</span>
                            <span className={label === "Motif" ? "text-gray-500 italic" : ""}>{val}</span>
                          </div>
                        ))}
                      </div>

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
                          <div className="mt-4 border-t border-gray-100 pt-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mode de paiement</p>
                              {paymentSaving && <span className="text-[10px] text-blue-400">Enregistrement…</span>}
                            </div>
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
                          </div>
                        );
                      })()}

                      {/* ── Fiscalité du client (pense-bête + adapte les relances) ── */}
                      {ev.clientId && (
                        <div className="mt-4 border-t border-gray-100 pt-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Avantage fiscal du client
                          </p>
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
                        </div>
                      )}

                      {/* ── Photos de l'intervention (prises par le prestataire) ── */}
                      {Array.isArray(ev.photos) && ev.photos.length > 0 && (
                        <div className="mt-4 border-t border-gray-100 pt-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📷 Photos de l&apos;intervention</p>
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
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <a key={p.path} href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={art} className="w-12 h-12 rounded-lg object-cover border border-gray-200" /></a>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Contact client (email / WhatsApp) ── */}
                      {!isArchived && (
                        <div className="mt-4 border-t border-gray-100 pt-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contacter le client</p>
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
                        </div>
                      )}
                    </>
                  )}
                  {!editMode && <div className="mt-4 flex flex-col gap-2">
                    {!isArchived && (<>
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
                          setArchiveReason("");
                          setArchivePayment("");
                          setArchiveComment("");
                          setSelectedEvent(null);
                        }}
                        className="w-full py-2 rounded-xl border border-orange-200 text-orange-600 text-sm font-medium hover:bg-orange-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        📦 Archiver ce RDV
                      </button>

                      {/* ── Rappel client : WhatsApp si numéro + copie toujours dispo ── */}
                      {(() => {
                        const rappelMsg =
                          `Bonjour ${ev.prenom || ""},\n\n` +
                          `Petit rappel de votre rendez-vous KinouClean 🙂\n\n` +
                          `🧹 ${ev.typePresta || "Prestation KinouClean"}\n` +
                          `📅 ${ev.date || "—"}${ev.heure ? ` à ${ev.heure}` : ""}\n` +
                          `📍 ${ev.adresse || "—"}\n` +
                          (ev.prix && ev.prix !== "0" ? `💶 Montant : ${ev.prix} €\n` : "") +
                          `\nEn cas d'empêchement, merci de nous prévenir au plus tôt.\n\nÀ très bientôt,\nL'équipe KinouClean`;
                        return (
                          <div className="flex flex-col gap-2">
                            {ev.tel && (
                              <a
                                href={`https://wa.me/${ev.tel.replace(/\s/g, "").replace(/^0/, "33")}?text=${encodeURIComponent(rappelMsg)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="w-full py-2 rounded-xl border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-50 transition-colors flex items-center justify-center gap-1.5"
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
                        );
                      })()}

                      {/* ── WhatsApp prestataire : envoyer la mission (avec réponse directe) ── */}
                      {ev.prestataire && (() => {
                        const prestataireObj = prestataires.find(p => p.nom === ev.prestataire);
                        const baseUrl   = typeof window !== "undefined" ? window.location.origin : "";
                        const acceptUrl = `${baseUrl}/api/mission/reponse?id=${ev.row}&action=accepter`;
                        const refusUrl  = `${baseUrl}/api/mission/reponse?id=${ev.row}&action=refuser`;
                        const msg = encodeURIComponent(
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
                        // Pas de numéro enregistré pour ce prestataire → on l'indique au lieu de masquer.
                        if (!prestataireObj?.tel) {
                          return (
                            <div className="w-full py-2 rounded-xl border border-dashed border-gray-200 text-gray-400 text-xs text-center px-2">
                              📱 Ajoute un n° à <span className="font-medium">{ev.prestataire}</span> (fiche Prestataires) pour lui envoyer la mission
                            </div>
                          );
                        }
                        const prestaTel = prestataireObj.tel.replace(/\s/g, "").replace(/^0/, "33");
                        return (
                          <a
                            href={`https://wa.me/${prestaTel}?text=${msg}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2 rounded-xl border border-green-200 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors flex items-center justify-center gap-1.5"
                          >
                            📱 Envoyer la mission à {ev.prestataire}
                          </a>
                        );
                      })()}
                    </>)}

                    {/* ── Avis client (affiché même si archivé) ── */}
                    {(ev.prenom || ev.nom) && (
                      <div className={`${!isArchived ? "border-t border-gray-100 pt-2" : ""} flex flex-col gap-2`}>
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
                        <button
                          onClick={() => {
                            const params = new URLSearchParams({ nom: `${ev.prenom} ${ev.nom}`.trim() });
                            if (ev.typePresta) params.set("prestation", ev.typePresta);
                            const avisUrl = `${window.location.origin}/avis/${ev.row}?${params.toString()}`;
                            const msg =
                              `Bonjour ${ev.prenom} 👋,\n\n` +
                              `J'espère que votre ${ev.typePresta ? `prestation de ${ev.typePresta}` : "prestation"} s'est très bien passée 😊.\n\n` +
                              `Votre satisfaction est notre priorité et nous serions ravis d'avoir votre retour !\n\n` +
                              `Si vous avez quelques instants, pourriez-vous laisser un avis ici ⭐ :\n${avisUrl}\n\n` +
                              `Merci infiniment pour votre confiance 🙏\n\nÀ très bientôt,\nL'équipe KinouClean`;
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
                  </div>}
                </>
              );
            })()}
          </div>
        </div>
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
          onSaved={() => { setCreateSlot(null); loadData(); }}
        />
      )}

      {/* ── Modal archiver RDV ───────────────────────────────────────────────── */}
      {archiveEv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setArchiveEv(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">📦 Archiver le RDV</h3>
              <button onClick={() => setArchiveEv(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{archiveEv.prenom} {archiveEv.nom}</span>
              {archiveEv.typePresta ? ` — ${archiveEv.typePresta}` : ""}
              {archiveEv.date ? ` (${archiveEv.date})` : ""}
            </p>

            {/* Raison */}
            <label className="text-xs font-medium text-gray-600 mb-2 block">Raison de l&apos;archivage</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {["Annulation client", "Prestation terminée", "Client injoignable", "Doublon"].map(r => (
                <button key={r} type="button"
                  onClick={() => setArchiveReason(r)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left ${
                    archiveReason === r
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-700 border-gray-200 hover:border-orange-300"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Autre raison…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={["Annulation client","Prestation terminée","Client injoignable","Doublon"].includes(archiveReason) ? "" : archiveReason}
              onChange={e => setArchiveReason(e.target.value)}
            />

            {/* Mode de paiement — masqué pour les annulations */}
            {isCancellationReason(archiveReason) ? (
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-3 flex items-center gap-2">
                <span className="text-lg">🚫</span>
                <p className="text-xs text-gray-500">Pas de paiement pour une annulation — non comptabilisé dans le CA</p>
              </div>
            ) : (
              <>
                <label className="text-xs font-medium text-gray-600 mb-2 block">
                  Mode de paiement <span className="text-orange-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: "Espèces", icon: "💵" },
                    { label: "Virement bancaire", icon: "🏦" },
                    { label: "Lien de paiement", icon: "🔗" },
                    { label: "Chèque", icon: "📄" },
                    { label: "Carte sur place", icon: "💳" },
                    { label: "Avance immédiate", icon: "⚡" },
                  ].map(({ label, icon }) => (
                    <button key={label} type="button"
                      onClick={() => setArchivePayment(label)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left flex items-center gap-1.5 ${
                        archivePayment === label
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
                      }`}>
                      <span>{icon}</span>{label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Commentaire optionnel */}
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Commentaire (optionnel)</label>
            <textarea
              rows={2}
              placeholder="Note interne…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={archiveComment}
              onChange={e => setArchiveComment(e.target.value)}
            />

            {/* Demande d'avis — proposée seulement si prestation réalisée (pas une annulation) */}
            {!isCancellationReason(archiveReason) && (
              avisGlobalActif ? (
                <label className="flex items-start gap-2.5 p-3 mb-4 rounded-xl border border-amber-200 bg-amber-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={archiveSendAvis}
                    onChange={e => setArchiveSendAvis(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 mt-0.5"
                  />
                  <span className="text-xs text-amber-800 leading-snug">
                    <strong>⭐ Envoyer la demande d&apos;avis à ce client</strong><br/>
                    <span className="text-amber-600">Décoche si le client n&apos;était pas satisfait (aucun email ne partira).</span>
                  </span>
                </label>
              ) : (
                <div className="p-3 mb-4 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-500">
                  ⏸️ Demandes d&apos;avis <strong>en pause</strong> — aucun email d&apos;avis ne sera envoyé. Réactive-les dans Configuration → Automatisations.
                </div>
              )
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={() => setArchiveEv(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button
                onClick={handleArchiveConfirm}
                disabled={!archiveReason.trim() || (!archivePayment && !isCancellationReason(archiveReason)) || archiving}
                className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors">
                {archiving ? "Archivage…" : "Archiver"}
              </button>
            </div>
          </div>
        </div>
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
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nouvelle date</label>
                <input
                  type="text"
                  placeholder="JJ/MM/AAAA"
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nouvelle heure</label>
                <input
                  type="text"
                  placeholder="HH:MM"
                  value={rescheduleHrs}
                  onChange={e => setRescheduleHrs(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
    </div>
  );
}
