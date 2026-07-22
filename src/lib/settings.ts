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
