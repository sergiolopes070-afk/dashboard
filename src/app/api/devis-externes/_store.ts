// ─────────────────────────────────────────────────────────────────────────────
// Devis EXTERNES (créés hors dashboard et envoyés à la main par email) — simple
// pense-bête rattaché à un client OU à un prospect.
//
// Stockage : table `settings` (clé/valeur JSON, comme fiscal_clients ou
// prospects_suivi) → AUCUNE migration. Une clé par fiche :
//   devis_externes:client:<clientId>     → DevisExterne[]
//   devis_externes:prospect:<prospectId> → DevisExterne[]
// Pièces jointes : bucket public existant `depenses`, dossier dédié
//   devis-externes/<kind>/<id>/<fichier>
// À la conversion prospect → client, la liste est COPIÉE vers la clé du client
// (transferDevisExternes, idempotent : dédoublonné par id ; la copie prospect reste).
// ─────────────────────────────────────────────────────────────────────────────
import { getSettingJSON, majSettingJSON } from "@/lib/settings";
import { supabase } from "@/lib/supabase";

export const BUCKET = "depenses";
export const FOLDER = "devis-externes";

export type DevisKind = "client" | "prospect";
export type DevisStatut = "envoye" | "accepte" | "refuse";

export interface DevisFichier { url: string; path: string; nom: string; type: string }
export interface DevisExterne {
  id       : string;
  date     : string;          // date d'envoi, YYYY-MM-DD
  montant  : string;          // TTC, optionnel ("" si non renseigné)
  intitule : string;
  statut   : DevisStatut;
  note     : string;
  fichier? : DevisFichier;
  createdAt: string;          // ISO
  origine? : "prospect";      // copié depuis la fiche prospect à la conversion
  // Envoi par email depuis le dashboard (POST /api/devis-externes/send)
  envoyeLe?   : string;       // ISO du dernier envoi
  envoyeA?    : string;       // adresse du dernier envoi
  envoisCount?: number;       // nombre d'envois
}

const STATUTS: DevisStatut[] = ["envoye", "accepte", "refuse"];

export function parseKind(v: unknown): DevisKind | null {
  return v === "client" || v === "prospect" ? v : null;
}
// Id de fiche (uuid) — on refuse tout le reste pour ne pas fabriquer de clé arbitraire.
export function validId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
}

const key = (kind: DevisKind, id: string) => `devis_externes:${kind}:${id}`;

export async function listDevis(kind: DevisKind, id: string): Promise<DevisExterne[]> {
  const list = await getSettingJSON<DevisExterne[]>(key(kind, id), []);
  return Array.isArray(list) ? list : [];
}

// Relecture fraîche → modification → écriture (voir majSettingJSON). Lève une
// erreur si la lecture ou l'écriture échoue (rien n'est écrasé).
export async function majDevis(kind: DevisKind, id: string, maj: (list: DevisExterne[]) => DevisExterne[] | void): Promise<DevisExterne[]> {
  return majSettingJSON<DevisExterne[]>(key(kind, id), [], l => {
    const list = Array.isArray(l) ? l : [];
    return maj(list) ?? list;
  });
}

// Nettoie / normalise une saisie (création ou modification partielle).
export function sanitize(input: Record<string, unknown>, base?: DevisExterne): DevisExterne {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const pick = <T,>(field: string, fallback: T, conv: (v: unknown) => T): T =>
    input[field] !== undefined ? conv(input[field]) : fallback;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

  const date = pick("date", base?.date ?? today, v => {
    const s = str(v, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (base?.date ?? today);
  });
  const montant = pick("montant", base?.montant ?? "", v => {
    const s = str(String(v ?? ""), 20).replace(",", ".");
    const n = parseFloat(s);
    return s && !isNaN(n) && n >= 0 ? String(Number(n.toFixed(2))) : "";
  });
  const statut = pick("statut", base?.statut ?? "envoye", v =>
    STATUTS.includes(v as DevisStatut) ? (v as DevisStatut) : (base?.statut ?? "envoye"));

  let fichier = base?.fichier;
  if (input.fichier !== undefined) {
    const f = input.fichier as Partial<DevisFichier> | null;
    fichier = f && typeof f.url === "string" && typeof f.path === "string" && f.path.startsWith(`${FOLDER}/`)
      ? { url: f.url, path: f.path, nom: str(f.nom, 200) || "devis", type: str(f.type, 100) }
      : undefined;
  }

  return {
    id       : base?.id ?? crypto.randomUUID(),
    date,
    montant,
    intitule : pick("intitule", base?.intitule ?? "", v => str(v, 300)),
    statut,
    note     : pick("note", base?.note ?? "", v => str(v, 2000)),
    ...(fichier ? { fichier } : {}),
    createdAt: base?.createdAt ?? new Date().toISOString(),
    ...(base?.origine ? { origine: base.origine } : {}),
    // Historique d'envoi : jamais modifiable par la saisie, seulement conservé.
    ...(base?.envoyeLe ? { envoyeLe: base.envoyeLe } : {}),
    ...(base?.envoyeA ? { envoyeA: base.envoyeA } : {}),
    ...(base?.envoisCount ? { envoisCount: base.envoisCount } : {}),
  };
}

// Supprime un fichier du bucket (best effort, limité au dossier dédié).
export async function removeFile(path: string | undefined): Promise<void> {
  if (!supabase || !path || !path.startsWith(`${FOLDER}/`)) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* best effort */ }
}

// Copie les devis externes d'un prospect vers un client (conversion). Idempotent.
// Renvoie le nombre de devis copiés.
export async function transferDevisExternes(prospectId: string, clientId: string): Promise<number> {
  if (!validId(prospectId) || !validId(clientId)) return 0;
  const from = await listDevis("prospect", prospectId);
  if (from.length === 0) return 0;
  let nb = 0;
  try {
    await majDevis("client", clientId, to => {
      const known = new Set(to.map(d => d.id));
      const added = from.filter(d => !known.has(d.id)).map(d => ({ ...d, origine: "prospect" as const }));
      nb = added.length;
      if (added.length > 0) return [...added, ...to];
    });
  } catch (e) { console.error("[devis-externes] transfert KO :", e instanceof Error ? e.message : e); return 0; }
  return nb;
}

// Retrouve le client créé à partir d'un prospect (email, sinon téléphone, sinon
// prénom + nom — le plus récent). Utilisé quand la conversion passe par le
// formulaire « Nouveau client » (qui ne renvoie pas l'id du client créé).
export async function findClientForProspect(p: { email?: string | null; tel?: string | null; prenom?: string | null; nom?: string | null }): Promise<string | null> {
  if (!supabase) return null;
  const tries: [string, string][] = [];
  if (p.email) tries.push(["email", p.email]);
  if (p.tel) tries.push(["tel", p.tel]);
  for (const [col, val] of tries) {
    const { data } = await supabase.from("clients").select("id").eq(col, val).order("created_at", { ascending: false }).limit(1);
    if (data?.[0]?.id) return data[0].id as string;
  }
  if (p.prenom) {
    const { data } = await supabase.from("clients").select("id")
      .eq("prenom", p.prenom).eq("nom", p.nom || "").order("created_at", { ascending: false }).limit(1);
    if (data?.[0]?.id) return data[0].id as string;
  }
  return null;
}
