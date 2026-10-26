// ─────────────────────────────────────────────────────────────────────────────
// Lecture/écriture FIABLE des réglages (table `settings`, clé/valeur JSONB).
//
// ⚠️ Bug d'hébergement constaté (20/07/2026) : les réponses PostgREST de type
// « objet unique » (.single()/.maybeSingle()) sont servies depuis un cache qui
// ne s'invalide pas après une écriture → lectures périmées. Les lectures en
// TABLEAU (.select().limit(1)), elles, renvoient toujours la valeur à jour.
// On lit donc TOUJOURS en tableau ici. (Les écritures, elles, persistent bien.)
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "./supabase";

/** Valeur brute d'un réglage (lecture fraîche, jamais mise en cache). */
export async function getSettingRaw(key: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("settings").select("value").eq("key", key).limit(1);
  return (data?.[0]?.value as string) ?? null;
}

/** Réglage JSON (avec repli si absent/illisible). */
export async function getSettingJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await getSettingRaw(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Écrit un réglage (upsert sur la clé). Renvoie un message d'erreur ou null. */
export async function setSettingRaw(key: string, value: string): Promise<string | null> {
  if (!supabase) return "Supabase non configuré";
  const { error } = await supabase.from("settings").upsert({ key, value }, { onConflict: "key" });
  return error ? error.message : null;
}

/**
 * Lecture STRICTE d'un réglage JSON : `null` si la lecture échoue (erreur
 * Supabase ou JSON illisible), `fallback` seulement si la clé est vraiment absente.
 * À utiliser avant toute réécriture d'un blob partagé : écrire un `{}` de repli
 * issu d'une lecture ratée effacerait toutes les entrées.
 */
export async function lireSettingJSONStrict<T>(key: string, fallback: T): Promise<T | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("settings").select("value").eq("key", key).limit(1);
  if (error) return null;
  const raw = data?.[0]?.value as string | null | undefined;
  if (raw == null || raw === "") return fallback;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * Lecture FRAÎCHE → modification → écriture d'un réglage JSON, au plus près de
 * l'écriture (une autre route ou le cron a pu écrire entre-temps). Lève une
 * erreur si la lecture échoue (rien n'est écrit) ou si l'écriture échoue.
 */
export async function majSettingJSON<T>(key: string, fallback: T, maj: (v: T) => T | void): Promise<T> {
  const cur = await lireSettingJSONStrict<T>(key, fallback);
  if (cur == null) throw new Error(`lecture de « ${key} » impossible (rien n'a été écrit)`);
  const next = (maj(cur) ?? cur) as T;
  const err = await setSettingRaw(key, JSON.stringify(next));
  if (err) throw new Error(`« ${key} » non enregistré : ${err}`);
  return next;
}
