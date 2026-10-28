"use client";
// Section privée « Banque » — import et analyse des relevés Qonto / Revolut.
// Rendu uniquement par app/(app)/banque/page.tsx (session patron privée).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, FileText, X, Loader2, TrendingDown, TrendingUp, BadgeEuro, Scale,
  ChevronLeft, ChevronRight, Search, ArrowLeftRight, Undo2, StickyNote, Wand2,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import FinancesTabs from "@/components/FinancesTabs";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { formatMontant } from "@/lib/finance";
import {
  CATEGORIES_BANQUE, CATEGORIE_ENCAISSEMENT, type CompteBanque, type MoisBanque, type OperationBanque,
} from "@/lib/banque";

// ─── Types des réponses API ──────────────────────────────────────────────────

interface Apercu {
  format: string; formatLibelle: string; compteDetecte: CompteBanque; compte: CompteBanque;
  nbLignes: number; nbNouvelles: number; nbDoublons: number; nbIgnorees: number;
  avertissement: string | null; ignoreesDetail: { ligne: number; raison: string }[];
  lignes: { date: string; libelle: string; contrepartie: string | null; montant: number; devise: string; categorie: string; interne: boolean; doublon: boolean }[];
}
interface ImportBanque { id: string; compte: CompteBanque | null; fichier: string | null; nb_lignes: number | null; nb_nouvelles: number | null; created_at: string; }
interface ReponseOperations { operations: OperationBanque[]; tronque: boolean; limite: number; total: number; }
interface Resume { annee: number; anneesDisponibles: number[]; devisesAutres: string[]; mois: MoisBanque[]; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const moisCourant = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const libelleMois = (m: string) => {
  const [a, mo] = m.split("-").map(Number);
  return new Date(a, mo - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};
const decalerMois = (m: string, n: number) => {
  const [a, mo] = m.split("-").map(Number);
  const d = new Date(a, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const frDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const eur = (n: number, signe = false) => formatMontant(n, { decimales: 2, signe });
const NOM_COMPTE: Record<CompteBanque, string> = { qonto: "Qonto", revolut: "Revolut" };
const BADGE_COMPTE: Record<CompteBanque, string> = {
  qonto: "bg-violet-100 text-violet-700 border-violet-200",
  revolut: "bg-sky-100 text-sky-700 border-sky-200",
};

async function lireJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erreur ${res.status}`);
  return data as T;
}

/** Lit le fichier en UTF-8, ou en Windows-1252 si l'UTF-8 est invalide (exports Excel). */
async function lireFichier(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 ${className}`}>{children}</div>;
}

function Kpi({ titre, valeur, sous, icone, ton }: { titre: string; valeur: string; sous?: React.ReactNode; icone: React.ReactNode; ton: "red" | "emerald" | "blue" | "orange" | "slate" }) {
  const fond = { red: "bg-red-50", emerald: "bg-emerald-50", blue: "bg-blue-50", orange: "bg-orange-50", slate: "bg-slate-50" }[ton];
  const pastille = { red: "bg-red-100 text-red-600", emerald: "bg-emerald-100 text-emerald-600", blue: "bg-blue-100 text-blue-600", orange: "bg-orange-100 text-orange-600", slate: "bg-slate-100 text-slate-600" }[ton];
  const texte = { red: "text-red-700", emerald: "text-emerald-700", blue: "text-blue-700", orange: "text-orange-700", slate: "text-slate-700" }[ton];
  return (
    <div className={`rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 border border-white shadow-sm ${fond}`}>
      <div className={`rounded-xl p-2.5 sm:p-3 flex-shrink-0 ${pastille}`}>{icone}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{titre}</p>
        <p className={`text-xl sm:text-2xl font-bold ${texte}`}>{valeur}</p>
        {sous && <div className="text-xs text-gray-400 mt-0.5">{sous}</div>}
      </div>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function BanqueView() {
  const toast = useToast();
  const [mois, setMois] = useState(moisCourant);
  const annee = Number(mois.slice(0, 4));

  const [resume, setResume]   = useState<Resume | null>(null);
  const [ops, setOps]         = useState<OperationBanque[]>([]);
  const [imports, setImports] = useState<ImportBanque[]>([]);
  const [tronque, setTronque] = useState<{ limite: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur]   = useState("");

  // Filtres de la liste
  const [fCompte, setFCompte]       = useState<"" | CompteBanque>("");
  const [fCategorie, setFCategorie] = useState("");
  const [fInterne, setFInterne]     = useState<"" | "0" | "1">("");
  const [recherche, setRecherche]   = useState("");

  const charger = useCallback(async () => {
    setLoading(true); setErreur("");
    try {
      const [r, o, i] = await Promise.all([
        fetch(`/api/banque/resume?annee=${annee}`).then(x => lireJson<Resume>(x)),
        fetch(`/api/banque/operations?mois=${mois}`).then(x => lireJson<ReponseOperations>(x)),
        fetch("/api/banque/imports").then(x => lireJson<ImportBanque[]>(x)),
      ]);
      setResume(r); setOps(o.operations); setImports(i);
      setTronque(o.tronque ? { limite: o.limite, total: o.total } : null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur de chargement");
    } finally { setLoading(false); }
  }, [annee, mois]);
  useEffect(() => { charger(); }, [charger]);

  const moisData = resume?.mois.find(m => m.mois === mois) ?? null;

  const opsFiltrees = useMemo(() => {
    const q = recherche.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return ops.filter(o =>
      (!fCompte || o.compte === fCompte) &&
      (!fCategorie || (o.categorie || "Autre") === fCategorie) &&
      (fInterne === "" || (fInterne === "1" ? o.interne : !o.interne)) &&
      (!q || `${o.libelle} ${o.contrepartie || ""} ${o.note || ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)));
  }, [ops, fCompte, fCategorie, fInterne, recherche]);

  // ── Mise à jour d'une opération (optimiste) ──
  const [similaireId, setSimilaireId] = useState<string | null>(null);
  async function patcher(o: OperationBanque, patch: Partial<Pick<OperationBanque, "categorie" | "interne" | "note">>, similaires = false) {
    if (similaires) {
      // Combien de lignes changeraient ? (hors modifiées à la main et virements appariés)
      try {
        const c = await lireJson<{ motif: string; nb: number }>(await fetch(`/api/banque/operations/${o.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ similaires: "compter" }),
        }));
        const cat = patch.categorie || o.categorie || "Autre";
        if (!window.confirm(`Créer la règle « ${c.motif} » → ${cat}${o.interne ? " (virement interne)" : ""} et modifier ${c.nb} autre${c.nb > 1 ? "s" : ""} opération${c.nb > 1 ? "s" : ""} ?\n\nLes opérations modifiées à la main et les virements appariés ne sont pas touchés.`)) return;
      } catch (e) { toast.error(e instanceof Error ? e.message : "Impossible de créer une règle"); return; }
    }
    const avant = ops;
    setOps(l => l.map(x => x.id === o.id ? { ...x, ...patch } : x));
    try {
      const r = await lireJson<{ operation: OperationBanque; regle?: string; nbModifiees?: number }>(
        await fetch(`/api/banque/operations/${o.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...patch, similaires }),
        }));
      if (similaires) {
        toast.success(`Règle « ${r.regle} » créée · ${r.nbModifiees ?? 0} autre${(r.nbModifiees ?? 0) > 1 ? "s" : ""} opération${(r.nbModifiees ?? 0) > 1 ? "s" : ""} mise${(r.nbModifiees ?? 0) > 1 ? "s" : ""} à jour`);
        setSimilaireId(null);
        charger();
      } else {
        setSimilaireId(o.id);
        if (patch.interne !== undefined || patch.categorie !== undefined) {
          fetch(`/api/banque/resume?annee=${annee}`).then(x => lireJson<Resume>(x)).then(setResume).catch(() => {});
        }
      }
    } catch (e) {
      setOps(avant);
      toast.error(e instanceof Error ? e.message : "Échec de l'enregistrement");
    }
  }

  async function deciderPaire(o: OperationBanque, paire: "confirmer" | "ignorer") {
    try {
      await lireJson(await fetch(`/api/banque/operations/${o.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paire }),
      }));
      toast.success(paire === "confirmer" ? "Virement interne confirmé" : "Suggestion ignorée");
      charger();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de l'enregistrement"); }
  }

  async function annulerImport(imp: ImportBanque) {
    if (!window.confirm(`Annuler cet import ? Ses ${imp.nb_nouvelles ?? 0} opération(s) seront supprimées.`)) return;
    try {
      const r = await lireJson<{ nbSupprimees: number; nbLiberees: number }>(await fetch(`/api/banque/imports/${imp.id}`, { method: "DELETE" }));
      toast.success(`Import annulé · ${r.nbSupprimees} opération(s) supprimée(s)${r.nbLiberees ? ` · ${r.nbLiberees} virement(s) apparié(s) libéré(s)` : ""}`);
      charger();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de l'annulation"); }
  }

  // ── Graphique annuel (barres CSS) ──
  const maxAnnuel = useMemo(() => Math.max(1, ...(resume?.mois ?? []).flatMap(m => [m.entrees, m.sorties])), [resume]);

  // ── Répartition par catégorie (mois) ──
  const repartition = useMemo(() => {
    const pc = moisData?.parCategorie ?? {};
    const sorties = Object.entries(pc).filter(([, v]) => v.sorties > 0).map(([k, v]) => ({ cat: k, v: v.sorties })).sort((a, b) => b.v - a.v);
    const entrees = Object.entries(pc).filter(([, v]) => v.entrees > 0).map(([k, v]) => ({ cat: k, v: v.entrees })).sort((a, b) => b.v - a.v);
    return { sorties, entrees };
  }, [moisData]);

  // ── Bénéfice réel = CA réalisé du dashboard − sorties bancaires (hors virements internes).
  // Les sorties remplacent les Dépenses saisies et les commissions (déjà payées par la
  // banque) : rien n'est compté deux fois. Seuls les mois ayant des opérations importées
  // comptent, sinon un mois vide afficherait tout le CA comme bénéfice.
  const benefice = useMemo(() => {
    if (!resume) return null;
    const calc = (m: MoisBanque) => m.nb > 0 && m.caDashboard != null ? { ca: m.caDashboard, sorties: m.sorties, net: m.caDashboard - m.sorties } : null;
    const duMois = moisData ? calc(moisData) : null;
    const jusqua = resume.annee === new Date().getFullYear() ? moisCourant() : `${resume.annee}-12`;
    const annuels = resume.mois.filter(m => m.mois <= jusqua).map(calc).filter((x): x is NonNullable<typeof x> => !!x);
    const annee = annuels.length ? annuels.reduce((s, x) => ({ ca: s.ca + x.ca, sorties: s.sorties + x.sorties, net: s.net + x.net }), { ca: 0, sorties: 0, net: 0 }) : null;
    return { duMois, annee, nbMois: annuels.length };
  }, [resume, moisData]);

  const tablesAbsentes = /Tables bancaires absentes/.test(erreur);

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar title="Banque" subtitle="Relevés Qonto & Revolut" onRefresh={charger} loading={loading} />
      <FinancesTabs />

      <div className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-6">
        {erreur && (
          <div className={`rounded-2xl p-4 text-sm border ${tablesAbsentes ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-700"}`}>{erreur}</div>
        )}

        {!tablesAbsentes && <ImportZone onImporte={charger} />}

        {!tablesAbsentes && imports.length > 0 && (
          <details className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 group">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700 select-none">
              Imports précédents <span className="text-gray-400 font-normal">({imports.length})</span>
            </summary>
            <ul className="mt-3 divide-y divide-gray-100">
              {imports.map(imp => (
                <li key={imp.id} className="py-2.5 flex flex-wrap items-center gap-2 text-sm">
                  {imp.compte && <span className={`text-xs px-2 py-0.5 rounded-full border ${BADGE_COMPTE[imp.compte]}`}>{NOM_COMPTE[imp.compte]}</span>}
                  <span className="text-gray-700 truncate max-w-[14rem]">{imp.fichier || "Relevé"}</span>
                  <span className="text-gray-400 text-xs">
                    {new Date(imp.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    {" · "}{imp.nb_nouvelles ?? 0} nouvelle(s) / {imp.nb_lignes ?? 0}
                  </span>
                  <button onClick={() => annulerImport(imp)}
                    className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                    <Undo2 size={13} /> Annuler cet import
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* ── Sélecteur de mois ── */}
        <Card className="!p-3 sm:!p-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setMois(m => decalerMois(m, -1))} aria-label="Mois précédent"
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
            <p className="flex-1 text-center font-semibold text-gray-800 capitalize">{libelleMois(mois)}</p>
            <button onClick={() => setMois(m => decalerMois(m, 1))} aria-label="Mois suivant"
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"><ChevronRight size={18} /></button>
            {mois !== moisCourant() && (
              <button onClick={() => setMois(moisCourant())} className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600">Ce mois</button>
            )}
          </div>
        </Card>

        {/* ── KPI du mois ── */}
        {loading && !resume ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : moisData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Kpi titre="Sorties (hors virements internes)" valeur={eur(moisData.sorties)} ton="red" icone={<TrendingDown size={20} />}
              sous={moisData.internes > 0 ? <>Virements internes exclus : {eur(moisData.internes)}</> : undefined} />
            <Kpi titre="Entrées (hors virements internes)" valeur={eur(moisData.entrees)} ton="emerald" icone={<TrendingUp size={20} />}
              sous={<>dont encaissements clients : {eur(moisData.encaissementsClients)}</>} />
            <Kpi titre="Net bancaire" valeur={eur(moisData.net, true)} ton={moisData.net >= 0 ? "blue" : "orange"} icone={<Scale size={20} />}
              sous="Entrées − sorties du mois" />
            <Kpi titre="CA dashboard vs encaissé banque" ton="slate" icone={<BadgeEuro size={20} />}
              valeur={moisData.caDashboard == null ? "—" : eur(moisData.caDashboard)}
              sous={moisData.caDashboard == null ? "CA du tableau de bord indisponible" : (
                <>Encaissé ({CATEGORIE_ENCAISSEMENT.toLowerCase()}) : {eur(moisData.encaissementsClients)}
                  {" · "}écart {eur(moisData.encaissementsClients - moisData.caDashboard, true)}</>
              )} />
          </div>
        )}
        {resume && resume.devisesAutres.length > 0 && (
          <p className="text-xs text-amber-700">Attention : opérations en {resume.devisesAutres.join(", ")} additionnées telles quelles (sans conversion).</p>
        )}

        {/* ── Bénéfice réel (CA dashboard − sorties bancaires) ── */}
        {benefice && (
          <Card className="!p-0 overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 sm:pt-5">
              <h3 className="font-semibold text-gray-800">Bénéfice réel</h3>
              <p className="text-xs text-gray-400 mt-0.5">CA réalisé du dashboard − sorties bancaires (virements internes exclus). Les dépenses saisies et les commissions ne sont pas recomptées : elles sont déjà dans les sorties.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 mt-3 border-t border-gray-100">
              {([
                { titre: <span className="capitalize">{libelleMois(mois)}</span>, v: benefice.duMois, vide: "Aucun relevé importé pour ce mois" },
                { titre: <>Année {annee}{benefice.nbMois > 0 && <span className="text-gray-400 font-normal"> · {benefice.nbMois} mois importé{benefice.nbMois > 1 ? "s" : ""}</span>}</>, v: benefice.annee, vide: "Aucun relevé importé cette année" },
              ]).map((b, i) => (
                <div key={i} className="p-4 sm:p-5">
                  <p className="text-xs text-gray-500 font-medium">{b.titre}</p>
                  {b.v ? (
                    <>
                      <p className={`text-2xl font-bold mt-1 ${b.v.net >= 0 ? "text-emerald-700" : "text-orange-700"}`}>{eur(b.v.net, true)}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        CA {eur(b.v.ca)} − sorties {eur(b.v.sorties)}
                        {b.v.ca > 0 && <> · marge {Math.round((b.v.net / b.v.ca) * 100)} %</>}
                      </p>
                    </>
                  ) : <p className="text-sm text-gray-400 mt-2">{b.vide}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Année + répartition ── */}
        {resume && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card>
              <h3 className="font-semibold text-gray-800 mb-1">Entrées / sorties {annee}</h3>
              <p className="text-xs text-gray-400 mb-4">Hors virements internes · touche un mois pour l&apos;ouvrir</p>
              <div className="flex items-end gap-1 sm:gap-1.5 h-40">
                {resume.mois.map((m, i) => (
                  <button key={m.mois} onClick={() => setMois(m.mois)} title={`${MOIS_FR[i]} : +${eur(m.entrees)} / −${eur(m.sorties)}`}
                    className={`flex-1 h-full flex flex-col items-center justify-end gap-1 rounded-lg ${m.mois === mois ? "bg-blue-50" : ""}`}>
                    <div className="w-full flex-1 flex items-end justify-center gap-0.5 px-0.5">
                      <div className="w-1/2 rounded-t bg-emerald-400" style={{ height: m.entrees > 0 ? `${Math.max(3, (m.entrees / maxAnnuel) * 100)}%` : "2px" }} />
                      <div className="w-1/2 rounded-t bg-red-400" style={{ height: m.sorties > 0 ? `${Math.max(3, (m.sorties / maxAnnuel) * 100)}%` : "2px" }} />
                    </div>
                    <span className={`text-[10px] ${m.mois === mois ? "text-blue-600 font-semibold" : "text-gray-400"}`}>{MOIS_FR[i].slice(0, 3)}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />Entrées</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />Sorties</span>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold text-gray-800 mb-4">Sorties par catégorie · <span className="capitalize">{libelleMois(mois)}</span></h3>
              {repartition.sorties.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune sortie ce mois-ci.</p>
              ) : (
                <ul className="space-y-2.5">
                  {repartition.sorties.map(({ cat, v }) => (
                    <li key={cat}>
                      <button onClick={() => setFCategorie(c => c === cat ? "" : cat)} className="w-full text-left">
                        <div className="flex justify-between text-sm mb-1">
                          <span className={`truncate ${fCategorie === cat ? "text-blue-600 font-semibold" : "text-gray-700"}`}>{cat}</span>
                          <span className="text-gray-600 font-medium ml-2 whitespace-nowrap">{eur(v)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.max(2, (v / repartition.sorties[0].v) * 100)}%` }} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {repartition.entrees.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-2">Entrées</p>
                  <ul className="space-y-1">
                    {repartition.entrees.map(({ cat, v }) => (
                      <li key={cat} className="flex justify-between text-sm">
                        <span className="text-gray-600 truncate">{cat}</span>
                        <span className="text-emerald-700 font-medium ml-2 whitespace-nowrap">{eur(v)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Opérations ── */}
        {!tablesAbsentes && (
          <Card className="!p-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-800">Opérations <span className="text-gray-400 font-normal text-sm">({opsFiltrees.length}/{ops.length})</span></h3>
              </div>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un libellé, une note…"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select value={fCompte} onChange={e => setFCompte(e.target.value as "" | CompteBanque)} className="border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white">
                  <option value="">Tous comptes</option>
                  <option value="qonto">Qonto</option>
                  <option value="revolut">Revolut</option>
                </select>
                <select value={fCategorie} onChange={e => setFCategorie(e.target.value)} className="border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white">
                  <option value="">Catégories</option>
                  {CATEGORIES_BANQUE.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={fInterne} onChange={e => setFInterne(e.target.value as "" | "0" | "1")} className="border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white">
                  <option value="">Tout</option>
                  <option value="0">Hors internes</option>
                  <option value="1">Virements internes</option>
                </select>
              </div>
            </div>

            {tronque && (
              <p className="px-4 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-100">
                Affichage limité à {tronque.limite} opérations (sur {tronque.total}) — affine les filtres.
              </p>
            )}
            {ops.some(o => o.interne_suggere) && (
              <p className="px-4 py-2 text-xs bg-blue-50 text-blue-800 border-b border-blue-100">
                {ops.filter(o => o.interne_suggere).length} opération(s) ressemblent à un virement entre tes comptes : confirme ou ignore ci-dessous.
              </p>
            )}
            {loading && ops.length === 0 ? (
              <div className="p-4 space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : opsFiltrees.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">Aucune opération{ops.length ? " pour ces filtres" : " ce mois-ci — importe un relevé"}.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {opsFiltrees.map(o => (
                  <LigneOperation key={o.id} o={o}
                    proposerSimilaires={similaireId === o.id}
                    onPatch={(p, sim) => patcher(o, p, sim)}
                    onPaire={d => deciderPaire(o, d)} />
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Ligne d'opération ───────────────────────────────────────────────────────

function LigneOperation({ o, proposerSimilaires, onPatch, onPaire }: {
  o: OperationBanque;
  proposerSimilaires: boolean;
  onPatch: (p: Partial<Pick<OperationBanque, "categorie" | "interne" | "note">>, similaires?: boolean) => void;
  onPaire: (d: "confirmer" | "ignorer") => void;
}) {
  const sortie = o.montant < 0;
  return (
    <li className={`px-4 py-3 ${o.interne ? "bg-gray-50/70" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400 tabular-nums">{frDate(o.date)}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${BADGE_COMPTE[o.compte]}`}>{NOM_COMPTE[o.compte]}</span>
            {o.interne && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">Virement interne</span>}
            {o.interne_suggere && !o.interne && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Virement interne ?</span>}
          </div>
          <p className={`text-sm font-medium truncate mt-0.5 ${o.interne ? "text-gray-500" : "text-gray-800"}`} title={o.libelle}>{o.libelle}</p>
          {o.contrepartie && o.contrepartie !== o.libelle && <p className="text-xs text-gray-400 truncate">{o.contrepartie}</p>}
          {o.note && <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1"><StickyNote size={11} /> {o.note}</p>}
        </div>
        <p className={`text-sm font-bold tabular-nums whitespace-nowrap ${o.interne ? "text-gray-400" : sortie ? "text-red-600" : "text-emerald-600"}`}>
          {formatMontant(o.montant, { decimales: 2, signe: true })}{o.devise && o.devise !== "EUR" ? ` ${o.devise}` : ""}
        </p>
      </div>
      {o.interne_suggere && !o.interne && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-blue-50 p-2">
          <span className="text-xs text-blue-800 flex-1 min-w-[10rem]">Même montant en sens inverse sur l&apos;autre compte, à 3 jours près.</span>
          <button onClick={() => onPaire("confirmer")} className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Confirmer virement interne</button>
          <button onClick={() => onPaire("ignorer")} className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-100">Ignorer</button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={o.categorie || "Autre"} onChange={e => onPatch({ categorie: e.target.value })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white max-w-[13rem]">
          {CATEGORIES_BANQUE.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => onPatch({ interne: !o.interne })} aria-pressed={o.interne}
          className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border ${o.interne ? "bg-gray-700 text-white border-gray-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          <ArrowLeftRight size={12} /> Virement interne
        </button>
        <button onClick={() => {
            const n = window.prompt("Note sur cette opération", o.note || "");
            if (n !== null) onPatch({ note: n });
          }}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          <StickyNote size={12} /> Note
        </button>
        {proposerSimilaires && (
          <button onClick={() => onPatch({ categorie: o.categorie || "Autre", interne: o.interne }, true)}
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <Wand2 size={12} /> Appliquer aux similaires + créer une règle
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Zone d'import ───────────────────────────────────────────────────────────

function ImportZone({ onImporte }: { onImporte: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<{ nom: string; texte: string } | null>(null);
  const [compte, setCompte]   = useState<CompteBanque | null>(null);
  const [apercu, setApercu]   = useState<Apercu | null>(null);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");

  const demanderApercu = useCallback(async (f: { nom: string; texte: string }, c: CompteBanque | null) => {
    setBusy(true); setErr("");
    try {
      const a = await lireJson<Apercu>(await fetch("/api/banque/import?apercu=1", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: f.texte, fichier: f.nom, ...(c ? { compte: c } : {}) }),
      }));
      setApercu(a); setCompte(a.compte);
    } catch (e) { setApercu(null); setErr(e instanceof Error ? e.message : "Lecture impossible"); }
    finally { setBusy(false); }
  }, []);

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const texte = await lireFichier(f);
    const nf = { nom: f.name, texte };
    setFichier(nf); setCompte(null);
    demanderApercu(nf, null);
  }

  function reinitialiser() { setFichier(null); setApercu(null); setCompte(null); setErr(""); }

  async function importer() {
    if (!fichier || !compte) return;
    setBusy(true); setErr("");
    try {
      const r = await lireJson<{ nbNouvelles: number; nbDoublons: number; virementsApparies: number; virementsSuggeres: number }>(await fetch("/api/banque/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: fichier.texte, fichier: fichier.nom, compte }),
      }));
      toast.success(`${r.nbNouvelles} opération(s) importée(s)${r.nbDoublons ? ` · ${r.nbDoublons} doublon(s) ignoré(s)` : ""}${r.virementsApparies ? ` · ${r.virementsApparies} virement(s) interne(s) détecté(s)` : ""}${r.virementsSuggeres ? ` · ${r.virementsSuggeres} à confirmer` : ""}`);
      reinitialiser();
      onImporte();
    } catch (e) { setErr(e instanceof Error ? e.message : "Échec de l'import"); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Upload size={16} className="text-blue-500" /> Importer un relevé
        </div>
        <span className="text-xs text-gray-400">CSV exporté depuis Qonto ou Revolut — les doublons sont ignorés.</span>
        <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={choisir} />
        {!fichier && (
          <button onClick={() => inputRef.current?.click()}
            className="sm:ml-auto w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <FileText size={15} /> Choisir un fichier
          </button>
        )}
      </div>

      {fichier && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FileText size={15} className="text-gray-400" />
            <span className="font-medium text-gray-700 truncate max-w-[14rem]">{fichier.nom}</span>
            {apercu && <span className="text-xs text-gray-400">Format détecté : {apercu.formatLibelle}</span>}
            <button onClick={reinitialiser} aria-label="Retirer le fichier" className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
          </div>

          {apercu && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Compte :</span>
                {(["qonto", "revolut"] as CompteBanque[]).map(c => (
                  <button key={c} disabled={busy}
                    onClick={() => { if (c !== compte) { setCompte(c); demanderApercu(fichier, c); } }}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${compte === c ? BADGE_COMPTE[c] + " font-semibold" : "border-gray-200 text-gray-500"}`}>
                    {NOM_COMPTE[c]}{apercu.compteDetecte === c ? " (détecté)" : ""}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-lg font-bold text-emerald-700">{apercu.nbNouvelles}</p><p className="text-[11px] text-gray-500">nouvelle(s)</p></div>
                <div className="rounded-xl bg-gray-50 p-2.5"><p className="text-lg font-bold text-gray-600">{apercu.nbDoublons}</p><p className="text-[11px] text-gray-500">déjà importée(s)</p></div>
                <div className="rounded-xl bg-amber-50 p-2.5"><p className="text-lg font-bold text-amber-700">{apercu.nbIgnorees}</p><p className="text-[11px] text-gray-500">ignorée(s)*</p></div>
              </div>
              <p className="text-[11px] text-gray-400">* opérations non finalisées (en attente, refusées, annulées), montants ambigus ou lignes illisibles.</p>
              {apercu.ignoreesDetail.length > 0 && (
                <details className="text-xs text-gray-600">
                  <summary className="cursor-pointer text-amber-700">Voir les lignes ignorées</summary>
                  <ul className="mt-1 space-y-0.5 max-h-32 overflow-auto">
                    {apercu.ignoreesDetail.map(d => <li key={d.ligne}>Ligne {d.ligne} : {d.raison}</li>)}
                  </ul>
                  {apercu.nbIgnorees > apercu.ignoreesDetail.length && <p className="text-gray-400 mt-1">… et {apercu.nbIgnorees - apercu.ignoreesDetail.length} autres.</p>}
                </details>
              )}
              {apercu.avertissement && (
                <p className="text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-2.5">{apercu.avertissement}</p>
              )}

              <div className="max-h-72 overflow-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr><th className="text-left px-2 py-2">Date</th><th className="text-left px-2 py-2">Libellé</th><th className="text-right px-2 py-2">Montant</th><th className="text-left px-2 py-2 hidden sm:table-cell">Catégorie</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {apercu.lignes.slice(0, 200).map((l, i) => (
                      <tr key={i} className={l.doublon ? "opacity-40" : ""}>
                        <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">{frDate(l.date)}</td>
                        <td className="px-2 py-1.5 text-gray-700 max-w-[10rem] sm:max-w-xs truncate">
                          {l.libelle}
                          {l.doublon && <span className="ml-1 text-gray-400">(déjà là)</span>}
                          {l.interne && <span className="ml-1 text-gray-500">↔ interne</span>}
                        </td>
                        <td className={`px-2 py-1.5 text-right whitespace-nowrap font-medium ${l.montant < 0 ? "text-red-600" : "text-emerald-600"}`}>{formatMontant(l.montant, { decimales: 2, signe: true })}</td>
                        <td className="px-2 py-1.5 text-gray-500 hidden sm:table-cell">{l.categorie}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {apercu.lignes.length > 200 && <p className="text-[11px] text-gray-400 p-2">… et {apercu.lignes.length - 200} autres lignes.</p>}
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button onClick={reinitialiser} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
                <button onClick={importer} disabled={busy || apercu.nbNouvelles === 0}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {busy && <Loader2 size={15} className="animate-spin" />}
                  {apercu.nbNouvelles === 0 ? "Rien de nouveau à importer" : `Importer ${apercu.nbNouvelles} opération(s) sur ${NOM_COMPTE[compte || apercu.compte]}`}
                </button>
              </div>
            </>
          )}
          {busy && !apercu && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={15} className="animate-spin" /> Lecture du relevé…</p>}
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        </div>
      )}
    </Card>
  );
}
