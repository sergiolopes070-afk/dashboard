"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, X, SlidersHorizontal } from "lucide-react";
import { Prestation, Prestataire, StatutClient } from "@/lib/constants";

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

// ─── Options prestation ───────────────────────────────────────────────────────
const TYPES_PRESTA = [
  "Ménage", "Repassage", "Vitres", "Débarras",
  "Après travaux", "Bureaux", "Lavage Canapé", "Lavage véhicule", "Autre",
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface CreateForm {
  prenom: string; nom: string; tel: string; email: string;
  typePresta: string; adresse: string; codePostal: string; ville: string;
  prix: string; prestataire: string; statut: StatutClient; message: string;
  date: string; heure: string;
}

const EMPTY_FORM: CreateForm = {
  prenom:"", nom:"", tel:"", email:"",
  typePresta:"", adresse:"", codePostal:"", ville:"",
  prix:"", prestataire:"", statut:"", message:"",
  date:"", heure:"",
};

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
                            className="w-full text-left px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-2 hover:brightness-95 transition-all"
                            style={{ backgroundColor: color.light, color: color.text }}
                          >
                            <span className="font-bold" style={{ color: color.bg }}>{ev.heure}</span>
                            <span className="font-semibold text-gray-800 truncate">{ev.prenom} {ev.nom}</span>
                            {ev.typePresta && <span className="text-gray-500 truncate hidden sm:block">{ev.typePresta}</span>}
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

// ─── Composant QuickCreate ────────────────────────────────────────────────────
function QuickCreateModal({
  initial, prestataires,
  onClose, onSaved,
}: {
  initial: { date: string; heure: string };
  prestataires: Prestataire[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CreateForm>({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const { villes, loading: cpLoading } = useVilleFromCP(form.codePostal);

  const set = (k: keyof CreateForm, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  // Auto-sélectionner la ville si une seule option
  useEffect(() => {
    if (villes.length === 1) set("ville", villes[0]);
  }, [villes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.prenom || !form.nom) { setError("Prénom et nom requis."); return; }
    setSaving(true); setError("");
    try {
      const fullAdresse = [
        form.adresse,
        [form.codePostal, form.ville].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, adresse: fullAdresse }),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      onSaved();
    } catch {
      setError("Impossible de sauvegarder. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
              <Plus size={14} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-gray-900">Nouvelle prestation</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Date / Heure */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Date</label>
              <input type="text" placeholder="JJ/MM/AAAA"
                value={form.date} onChange={e => set("date", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Heure</label>
              <input type="text" placeholder="HH:MM"
                value={form.heure} onChange={e => set("heure", e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* ── Client ── */}
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Client</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Prénom *</label>
              <input value={form.prenom} onChange={e => set("prenom", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Nom *</label>
              <input value={form.nom} onChange={e => set("nom", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Téléphone</label>
              <input value={form.tel} onChange={e => set("tel", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* ── Adresse ── */}
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Adresse</div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Rue / Numéro</label>
            <input value={form.adresse} onChange={e => set("adresse", e.target.value)}
              placeholder="12 rue de la Paix" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Code postal</label>
              <input value={form.codePostal} onChange={e => set("codePostal", e.target.value)}
                placeholder="75001" maxLength={5} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Ville {cpLoading && <span className="text-blue-400">…</span>}
              </label>
              {villes.length > 1 ? (
                <select value={form.ville} onChange={e => set("ville", e.target.value)} className={inputCls}>
                  <option value="">— Choisir —</option>
                  {villes.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input value={form.ville} onChange={e => set("ville", e.target.value)}
                  placeholder="Paris" className={inputCls} />
              )}
            </div>
          </div>

          {/* ── Prestation ── */}
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Prestation</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Type de prestation</label>
              <select value={form.typePresta} onChange={e => set("typePresta", e.target.value)} className={inputCls}>
                <option value="">— Sélectionner —</option>
                {TYPES_PRESTA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Prix (€)</label>
              <input type="number" value={form.prix} onChange={e => set("prix", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Prestataire</label>
              <select value={form.prestataire} onChange={e => set("prestataire", e.target.value)} className={inputCls}>
                <option value="">— Aucun —</option>
                {prestataires.map(p => (
                  <option key={p.id} value={p.nom}>{p.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Statut</label>
              <select value={form.statut} onChange={e => set("statut", e.target.value as StatutClient)} className={inputCls}>
                {STATUTS.map(s => <option key={s} value={s}>{s || "— Aucun —"}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
            <textarea rows={2} value={form.message} onChange={e => set("message", e.target.value)}
              className={`${inputCls} resize-none`} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Enregistrement…" : "Créer la prestation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function AgendaPage() {
  const [prestations,  setPrestations]  = useState<Prestation[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [weekStart,    setWeekStart]    = useState<Date>(() => getMondayOfWeek(new Date()));
  const [monthDate,    setMonthDate]    = useState<Date>(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [viewMode,     setViewMode]     = useState<"week"|"month">("week");
  const [checked,      setChecked]      = useState<Record<string, boolean>>({});
  const [showSansPresta, setShowSansPresta] = useState(true);
  const [selectedEvent,   setSelectedEvent]   = useState<Prestation | null>(null);
  const [createSlot,      setCreateSlot]      = useState<{ date: string; heure: string } | null>(null);
  const [selectedMonthDay, setSelectedMonthDay] = useState<Date | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadData = () => {
    Promise.all([
      fetch("/api/prestations").then(r => r.json()),
      fetch("/api/prestataires").then(r => r.json()),
    ]).then(([prestas, prestas2]) => {
      setPrestations(Array.isArray(prestas) ? prestas : []);
      setPrestataires(Array.isArray(prestas2) ? prestas2 : []);
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
      const pid = idByNom[p.prestataire];
      if (p.prestataire && pid) return checked[pid] ?? false;
      return showSansPresta;
    }),
    [prestations, checked, showSansPresta, idByNom]
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
                  return (
                    <div
                      key={di}
                      className={`flex-1 border-l border-gray-100 relative cursor-pointer group ${isToday ? "bg-blue-50/20" : "bg-white"}`}
                      style={{ height: `${(HOUR_END - HOUR_START) * HOUR_PX}px` }}
                      onClick={e => handleSlotClick(e, day)}
                      title="Cliquer pour créer une prestation"
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

                      {/* Events */}
                      {events.map((ev, ei) => {
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
                            onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                            className="absolute rounded-md text-left text-xs overflow-hidden shadow-sm hover:brightness-95 transition-all"
                            style={{
                              top   : `${top_ + 1}px`,
                              height: `${Math.max(h_ - 2, 22)}px`,
                              left  : overlap > 0 ? "calc(50% + 2px)" : "3px",
                              width : overlap > 0 ? "calc(50% - 4px)" : "calc(100% - 6px)",
                              backgroundColor: color.light,
                              borderLeft     : `3px solid ${color.bg}`,
                              zIndex: 10 + ei,
                            }}
                          >
                            <div className="px-1.5 py-1 h-full flex flex-col overflow-hidden">
                              {ev.heure && (
                                <span className="font-bold leading-tight truncate" style={{ color: color.bg }}>{ev.heure}</span>
                              )}
                              <span className="font-semibold leading-tight truncate text-gray-800">{ev.prenom} {ev.nom}</span>
                              {h_ > 36 && <span className="text-gray-500 leading-tight truncate">{ev.typePresta}</span>}
                              {h_ > 52 && ev.prestataire && (
                                <span className="leading-tight truncate font-medium" style={{ color: color.text }}>{ev.prestataire}</span>
                              )}
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
                        const pid   = idByNom[ev.prestataire];
                        const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg:"#9CA3AF", light:"#F3F4F6", text:"#374151" };
                        return (
                          <button
                            key={ev.row}
                            onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                            className="w-full text-left px-1.5 py-0.5 rounded text-xs truncate font-medium"
                            style={{ backgroundColor: color.light, color: color.text }}
                          >
                            {ev.heure && <span className="font-bold mr-1">{ev.heure}</span>}
                            {ev.prenom} {ev.nom}
                          </button>
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
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5"
            onClick={e => e.stopPropagation()}>
            {(() => {
              const ev    = selectedEvent;
              const pid   = idByNom[ev.prestataire];
              const color = pid ? (colorMap[pid] ?? PALETTE[0]) : { bg:"#9CA3AF", light:"#F3F4F6", text:"#374151" };
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: color.light, color: color.text }}>
                      {ev.prestataire || "Sans prestataire"}
                    </div>
                    <button onClick={() => setSelectedEvent(null)}
                      className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
                  </div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">{ev.prenom} {ev.nom}</h3>
                  <p className="text-sm text-gray-500 mb-3">{ev.typePresta}</p>
                  <div className="space-y-1.5 text-sm text-gray-700">
                    {([
                      ["Date",    `${ev.date}${ev.heure ? ` à ${ev.heure}` : ""}`],
                      ["Adresse", ev.adresse || null],
                      ["Statut",  ev.statut  || null],
                      ["Prix",    ev.prix     ? `${ev.prix} €` : null],
                      ["Tél",     ev.tel      || null],
                      ["Note",    ev.commentaire || null],
                    ] as [string, string|null][]).filter(([,v]) => v).map(([label, val]) => (
                      <div key={label} className="flex gap-2">
                        <span className="text-gray-400 w-20 shrink-0">{label}</span>
                        <span>{val}</span>
                      </div>
                    ))}
                  </div>
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
        <QuickCreateModal
          initial={createSlot}
          prestataires={prestataires}
          onClose={() => setCreateSlot(null)}
          onSaved={() => { setCreateSlot(null); loadData(); }}
        />
      )}
    </div>
  );
}
