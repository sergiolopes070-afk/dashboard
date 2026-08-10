// ─────────────────────────────────────────────────────────────────────────────
// Gardes d'authentification pour les route handlers (runtime Node).
//   • requireAuth()   → réservé au PATRON (rôle owner). 401 sinon.
//   • requirePresta() → réservé au PRESTATAIRE connecté ; renvoie son id.
// ─────────────────────────────────────────────────────────────────────────────
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";

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
