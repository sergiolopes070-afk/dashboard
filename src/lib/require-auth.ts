// ─────────────────────────────────────────────────────────────────────────────
// Gardes d'authentification pour les route handlers (runtime Node).
//   • requireAuth()   → réservé au PATRON (rôle owner). 401 sinon.
//   • requirePresta() → réservé au PRESTATAIRE connecté ; renvoie son id.
//   • requirePrive()  → réservé à la session patron PRIVÉE ; 404 neutre sinon
//                       (indiscernable d'une route inexistante).
// ─────────────────────────────────────────────────────────────────────────────
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken, type Session } from "@/lib/auth";

export async function requireAuth(): Promise<NextResponse | null> {
  const secret = process.env.AUTH_SECRET;
  const token  = cookies().get(SESSION_COOKIE)?.value;
  const sess   = secret ? await readSessionToken(token, secret) : null;
  if (!sess || sess.role !== "owner") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}

// Renvoie { pid } si un prestataire est connecté, sinon une réponse 401.
export async function requirePresta(): Promise<{ pid: string } | NextResponse> {
  const secret = process.env.AUTH_SECRET;
  const token  = cookies().get(SESSION_COOKIE)?.value;
  const sess   = secret ? await readSessionToken(token, secret) : null;
  if (!sess || sess.role !== "presta" || !sess.pid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return { pid: sess.pid };
}

// Session courante (server components / route handlers), null si absente/invalide.
export async function lireSession(): Promise<Session | null> {
  const secret = process.env.AUTH_SECRET;
  const token  = cookies().get(SESSION_COOKIE)?.value;
  return secret ? await readSessionToken(token, secret) : null;
}

// Vrai uniquement pour la session patron privée.
export async function estSessionPrivee(): Promise<boolean> {
  const sess = await lireSession();
  return !!sess && sess.role === "owner" && sess.prive === true;
}

// Onglet supplémentaire des Finances (components/FinancesShell) : uniquement
// pour la session patron privée, sinon null (rien n'est envoyé au navigateur).
export async function ongletFinancesExtra(): Promise<{ href: string; label: string } | null> {
  return (await estSessionPrivee()) ? { href: "/banque", label: "Banque" } : null;
}

// Garde des routes privées : null si OK, sinon un 404 sans contenu (pas de
// 401/403, aucun libellé) — le middleware sert déjà un 404 standard en amont,
// ceci n'est qu'une seconde barrière.
export async function requirePrive(): Promise<NextResponse | null> {
  if (await estSessionPrivee()) return null;
  return new NextResponse(null, { status: 404 });
}
