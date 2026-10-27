// ─────────────────────────────────────────────────────────────────────────────
// Relevés bancaires (section privée) — accès Supabase côté serveur uniquement.
// Utilisé EXCLUSIVEMENT par les routes /api/banque/* (gardées par requirePrive).
// Tables : banque_operations, banque_regles, banque_imports (supabase/banque.sql).
// ─────────────────────────────────────────────────────────────────────────────
import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  type CompteBanque, type LigneReleve, type OperationBanque, type RegleBanque,
  normaliser, regleApplicable, categorieHeuristique, estInterneParNom, indiceVirementInterne,
} from "@/lib/banque";

export const MSG_TABLES_ABSENTES = "Tables bancaires absentes : exécute supabase/banque.sql";

type ErreurSb = { code?: string; message?: string } | null | undefined;

/** Erreur Supabase « table inexistante » (Postgres 42P01 / PostgREST PGRST205). */
export function tableAbsente(e: ErreurSb): boolean {
  if (!e) return false;
  return e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST200"
    || /does not exist|schema cache|could not find the table/i.test(e.message || "");
}

/** Réponse d'erreur JSON (503 + message clair si les tables manquent). */
export function reponseErreur(e: unknown): NextResponse {
  const err = e as ErreurSb;
  if (tableAbsente(err)) return NextResponse.json({ error: MSG_TABLES_ABSENTES, tablesAbsentes: true }, { status: 503 });
  const message = e instanceof Error ? e.message : (err?.message || "Erreur inconnue");
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Lève l'erreur Supabase telle quelle (pour reponseErreur). */
function verifier(e: ErreurSb) {
  if (e) throw Object.assign(new Error(e.message || "Erreur Supabase"), { code: e.code });
}

export function sb() {
  if (!supabase) throw new Error("Supabase non configuré");
  return supabase;
}

// ─── Empreinte anti-doublon ──────────────────────────────────────────────────
// Si la banque fournit un identifiant de transaction (Qonto « Transaction ID »,
// Revolut Business « ID ») : sha256(compte | id | identifiant | occurrence).
// Sinon : sha256(compte | date | montant | libellé normalisé | n° d'occurrence) —
// l'indice d'occurrence distingue deux lignes identiques le même jour.
export function avecEmpreintes<T extends LigneReleve>(compte: CompteBanque, lignes: T[]): (T & { empreinte: string })[] {
  const vus = new Map<string, number>();
  return lignes.map(l => {
    const base = l.idBanque
      ? `${compte}|id|${l.idBanque}`
      : `${compte}|${l.date}|${l.montant.toFixed(2)}|${normaliser(l.libelle)}`;
    const occ = vus.get(base) || 0;
    vus.set(base, occ + 1);
    return { ...l, empreinte: createHash("sha256").update(`${base}|${occ}`).digest("hex") };
  });
}

// ─── Lectures ────────────────────────────────────────────────────────────────

export async function chargerRegles(): Promise<RegleBanque[]> {
  const { data, error } = await sb().from("banque_regles").select("id, motif, categorie, interne");
  verifier(error);
  return (data || []) as RegleBanque[];
}

/** Empreintes déjà en base parmi celles fournies. */
export async function empreintesExistantes(liste: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < liste.length; i += 100) {
    const { data, error } = await sb().from("banque_operations").select("empreinte").in("empreinte", liste.slice(i, i + 100));
    verifier(error);
    for (const r of data || []) out.add(r.empreinte as string);
  }
  return out;
}

const COLS_OP = "id, compte, date, libelle, contrepartie, montant, devise, categorie, interne, note, empreinte, import_id, type_op, interne_suggere, paire_id, manuel, created_at";

/** Toutes les opérations (pagination par 1000), filtrées optionnellement sur une période. */
export async function chargerOperations(f: { du?: string; au?: string; compte?: string; importId?: string } = {}): Promise<OperationBanque[]> {
  const out: OperationBanque[] = [];
  for (let page = 0; page < 50; page++) {
    let q = sb().from("banque_operations").select(COLS_OP);
    if (f.du) q = q.gte("date", f.du);
    if (f.au) q = q.lte("date", f.au);
    if (f.compte) q = q.eq("compte", f.compte);
    if (f.importId) q = q.eq("import_id", f.importId);
    const { data, error } = await q.order("date", { ascending: false }).order("id").range(page * 1000, page * 1000 + 999);
    verifier(error);
    const lot = (data || []).map(r => ({ ...r, montant: Number(r.montant) })) as OperationBanque[];
    out.push(...lot);
    if (lot.length < 1000) break;
  }
  return out;
}

// ─── Préparation d'un import ─────────────────────────────────────────────────

export interface LignePreparee extends LigneReleve {
  empreinte: string;
  categorie: string;
  interne: boolean;
  regle: boolean;   // une règle utilisateur a décidé (catégorie + interne)
}

/** Règles d'abord, puis heuristiques (catégorie + virement interne par le nom). */
export function preparer(compte: CompteBanque, lignes: LigneReleve[], regles: RegleBanque[]): LignePreparee[] {
  return avecEmpreintes(compte, lignes).map(l => {
    const r = regleApplicable(l, regles);
    if (r) return { ...l, categorie: r.categorie, interne: !!r.interne, regle: true };
    return { ...l, categorie: categorieHeuristique(l, compte), interne: estInterneParNom(l, compte), regle: false };
  });
}

/** Nombre d'opérations déjà en base sur ce compte entre deux dates (incluses). */
export async function nbOperationsPeriode(compte: CompteBanque, du: string, au: string): Promise<number> {
  const { count, error } = await sb().from("banque_operations").select("id", { count: "exact", head: true })
    .eq("compte", compte).gte("date", du).lte("date", au);
  verifier(error);
  return count || 0;
}

// ─── Appariement des virements internes Qonto ↔ Revolut ─────────────────────
// Pour chaque NOUVELLE opération : même devise, montant opposé au centime sur
// l'AUTRE compte, à ± 3 jours ; aucune des deux déjà appariée ni écartée par une
// règle « non interne ». La paire est mémorisée (paire_id sur les 2 lignes).
//  • appliquée (interne = true) seulement s'il existe un INDICE en plus du
//    montant/date (autre banque ou mes sociétés citées, type Revolut
//    EXCHANGE / TOPUP, « virement interne », « transfer to »…) et qu'aucune des
//    deux lignes n'a été modifiée à la main ;
//  • sinon simple suggestion (interne_suggere = true) à confirmer dans l'écran.
const JOUR_MS = 86_400_000;
const ecartJours = (a: string, b: string) => Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / JOUR_MS;
const deviseDe = (o: OperationBanque) => (o.devise || "EUR").toUpperCase();

export async function apparierVirements(nouveauxIds: string[]): Promise<{ appliques: number; suggeres: number }> {
  const res = { appliques: 0, suggeres: 0 };
  if (!nouveauxIds.length) return res;
  const nouveaux = new Set(nouveauxIds);
  const [ops, regles] = await Promise.all([chargerOperations(), chargerRegles()]);
  const eligible = (o: OperationBanque) => {
    if (o.paire_id) return false;
    const r = regleApplicable(o, regles);
    return !(r && !r.interne);
  };
  const libres = ops.filter(eligible);
  const pris = new Set<string>();
  for (const o of libres) {
    if (!nouveaux.has(o.id) || pris.has(o.id)) continue;
    let best: OperationBanque | null = null, bestEcart = Infinity;
    for (const c of libres) {
      if (c.compte === o.compte || pris.has(c.id) || c.id === o.id || deviseDe(c) !== deviseDe(o)) continue;
      if (Math.round(c.montant * 100) !== -Math.round(o.montant * 100)) continue;
      const e = ecartJours(o.date, c.date);
      if (e <= 3 && e < bestEcart) { best = c; bestEcart = e; }
    }
    if (!best) continue;
    pris.add(o.id); pris.add(best.id);
    const indice = indiceVirementInterne({ ...o, typeOp: o.type_op }, o.compte) || indiceVirementInterne({ ...best, typeOp: best.type_op }, best.compte);
    const auto = indice && !o.manuel && !best.manuel;
    const paire_id = randomUUID();
    const patch = auto ? { interne: true, interne_suggere: false, paire_id } : { interne_suggere: true, paire_id };
    const { error } = await sb().from("banque_operations").update(patch).in("id", [o.id, best.id]);
    verifier(error);
    if (auto) res.appliques++; else res.suggeres++;
  }
  return res;
}

/**
 * Annulation d'un import : les lignes d'AUTRES imports appariées à ses opérations
 * sont libérées (paire_id = null, plus de suggestion) et leur « interne » revient
 * à sa valeur propre (règle, sinon détection par le nom ; false par défaut).
 */
export async function libererContreparties(importId: string): Promise<number> {
  const ops = await chargerOperations({ importId });
  const paires = Array.from(new Set(ops.map(o => o.paire_id).filter((x): x is string => !!x)));
  if (!paires.length) return 0;
  const regles = await chargerRegles();
  let n = 0;
  for (let i = 0; i < paires.length; i += 100) {
    const { data, error } = await sb().from("banque_operations").select(COLS_OP).in("paire_id", paires.slice(i, i + 100));
    verifier(error);
    for (const r of data || []) {
      const c = { ...r, montant: Number(r.montant) } as OperationBanque;
      if (c.import_id === importId) continue;
      const regle = regleApplicable(c, regles);
      const interne = regle ? !!regle.interne : estInterneParNom({ ...c, typeOp: c.type_op || "" }, c.compte);
      const { error: e2 } = await sb().from("banque_operations").update({ interne, paire_id: null, interne_suggere: false }).eq("id", c.id);
      verifier(e2);
      n++;
    }
  }
  return n;
}

export async function mettreAJourParIds(ids: string[], patch: Partial<Pick<OperationBanque, "categorie" | "interne" | "interne_suggere" | "paire_id" | "manuel">>) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb().from("banque_operations").update(patch).in("id", ids.slice(i, i + 200));
    verifier(error);
  }
}

export { verifier as verifierErreur };
