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

// Prefetch des données d'une page (par son href) : réchauffe le cache avant même
// la navigation (survol / toucher d'un lien du menu, ou temps mort de l'accueil).
// Chaque entrée stocke exactement le format que la page lit dans le cache.
const PREFETCH: Record<string, { key: string; url: string; transform?: (d: unknown) => unknown }> = {
  "/prospects":    { key: CACHE_KEYS.prospects,    url: "/api/prospects" },
  "/depenses":     { key: CACHE_KEYS.depenses,     url: "/api/depenses" },
  "/stock":        { key: CACHE_KEYS.stock,        url: "/api/stock" },
  "/prestataires": { key: CACHE_KEYS.prestataires, url: "/api/prestataires" },
  "/prestations":  { key: CACHE_KEYS.prestations,  url: "/api/prestations" },
  "/clients":      { key: "clients-full",          url: "/api/clients" }, // même clé que la page Clients
  "/archive":      { key: CACHE_KEYS.archive,      url: "/api/archive", transform: (d) => (Array.isArray(d) ? [...d].reverse() : d) },
};

export function prefetchPage(href: string): void {
  const p = PREFETCH[href];
  if (p) cachePrefetch(p.key, p.url, p.transform);
}
