// ─────────────────────────────────────────────────────────────────────────────
// Cache mémoire « stale-while-revalidate » partagé entre les pages (sans dépendance).
//
// But : quand on revient sur une page déjà visitée dans la même session, on
// affiche INSTANTANÉMENT les dernières données connues, pendant qu'une
// revalidation se fait en arrière-plan. Zéro écran blanc, zéro attente perçue.
//
// Le cache vit en mémoire (Map au niveau module) : il persiste tant que l'onglet
// reste ouvert (navigation SPA) et se réinitialise à un rechargement complet.
// Aucune donnée sensible n'est persistée sur disque.
// ─────────────────────────────────────────────────────────────────────────────

const store = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheHas(key: string): boolean {
  return store.has(key);
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, value);
}

// Clés de cache centralisées (évite les fautes de frappe).
// Prefetch : réchauffe le cache (ex. au survol d'un lien) si pas déjà présent.
// Ne relance pas un fetch déjà en cours. Silencieux en cas d'échec.
const inflight = new Set<string>();
export async function cachePrefetch(
  key: string,
  url: string,
  transform?: (data: unknown) => unknown,
): Promise<void> {
  if (cacheHas(key) || inflight.has(key)) return;
  inflight.add(key);
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      cacheSet(key, transform ? transform(data) : data);
    }
  } catch {
    /* prefetch best-effort : on ignore les erreurs */
  } finally {
    inflight.delete(key);
  }
}

export const CACHE_KEYS = {
  prestations : "prestations",
  prestataires: "prestataires",
  prospects   : "prospects",
  depenses    : "depenses",
  archive     : "archive",
  agenda      : "agenda",       // liste fusionnée (prestations + archivés) propre à l'agenda
  stock       : "stock",
} as const;
