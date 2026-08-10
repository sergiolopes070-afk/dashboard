// ─────────────────────────────────────────────────────────────────────────────
// Auth — jeton de session signé (HMAC-SHA256) avec expiration intégrée.
//
// Le jeton a la forme  "<expMs>.<signatureHex>"  où la signature couvre <expMs>.
// L'expiration fait donc partie de la charge signée : la modifier invalide la
// signature. Implémenté avec la Web Crypto API (globalThis.crypto.subtle) pour
// être compatible à la fois avec le middleware Edge et les route handlers Node.
//
// Clé de signature : AUTH_SECRET (variable d'env déjà existante, aucune nouvelle).
// ─────────────────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "auth_session";

// Durée de session : 7 jours (usage quotidien). Ré-émise à chaque requête active
// (session glissante) via le middleware, pour ne pas déconnecter en pleine session.
export const SESSION_DAYS    = 7;
export const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const SESSION_MS             = SESSION_SECONDS * 1000;

// Options du cookie de session — httpOnly, secure (en prod), sameSite Lax.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure  : process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path    : "/",
    maxAge  : SESSION_SECONDS,
  };
}

// ─── Helpers bas niveau ────────────────────────────────────────────────────────
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToHex(new Uint8Array(sig));
}

// Comparaison à temps constant (évite les fuites par timing).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── API publique ──────────────────────────────────────────────────────────────

// Identité portée par le jeton : rôle (patron/prestataire) + id prestataire.
export type SessionRole = "owner" | "presta";
export interface Session { role: SessionRole; pid: string; }

// Crée un jeton signé valable SESSION_DAYS jours. Le rôle + l'id prestataire
// font partie de la charge signée (les modifier invalide la signature).
// Format de charge : "<expMs>:<role>:<pid>" (aucun point → sépare proprement du sig).
export async function createSessionToken(
  secret: string,
  opts: { role?: SessionRole; pid?: string } = {},
  now: number = Date.now(),
): Promise<string> {
  const exp = now + SESSION_MS;
  const payload = `${exp}:${opts.role || "owner"}:${opts.pid || ""}`;
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

// Lit et vérifie le jeton → renvoie {role, pid} si valide, sinon null.
export async function readSessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = Date.now(),
): Promise<Session | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);

  const expected = await hmacHex(secret, payload);
  if (!safeEqual(sig, expected)) return null;

  const parts = payload.split(":");
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp <= now) return null;
  const role = (parts[1] === "presta" ? "presta" : "owner") as SessionRole;
  const pid  = parts[2] || "";
  return { role, pid };
}

// Vérifie la signature ET l'expiration. Renvoie false si absent / falsifié / expiré.
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  return (await readSessionToken(token, secret, now)) !== null;
}

// Hash déterministe d'un code d'accès prestataire (peppéré par AUTH_SECRET).
export async function hashCode(secret: string, login: string, code: string): Promise<string> {
  return hmacHex(secret, `presta-code:${login.toLowerCase()}:${code}`);
}
