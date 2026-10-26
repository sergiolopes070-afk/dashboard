// fetch qui échoue vraiment : lève une Error avec le message (FR) renvoyé par
// le serveur ({ error }) quand la réponse n'est pas 2xx. Évite les
// « enregistré ✅ » affichés alors que la sauvegarde a échoué.
export async function fetchOk(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const j = await res.clone().json().catch(() => ({} as { error?: string }));
    throw new Error((j && typeof j.error === "string" && j.error) || `Erreur serveur (${res.status})`);
  }
  return res;
}

/** Raccourci JSON : envoie `body` en JSON avec la méthode donnée. */
export function fetchJsonOk(url: string, method: string, body: unknown): Promise<Response> {
  return fetchOk(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
