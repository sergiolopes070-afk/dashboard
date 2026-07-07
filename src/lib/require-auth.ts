// ─────────────────────────────────────────────────────────────────────────────
// requireAuth() — garde d'authentification pour les route handlers (runtime Node).
//
// Vérifie le jeton de session signé (voir src/lib/auth.ts). À appeler EN TÊTE de
// chaque handler de route protégée :
//
//   const unauth = await requireAuth();
//   if (unauth) return unauth;   // → 401 sans exécuter la logique
//
// Fichier séparé de auth.ts car il importe next/headers (indisponible dans le
// middleware Edge). auth.ts reste, lui, compatible Edge.
// ─────────────────────────────────────────────────────────────────────────────
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function requireAuth(): Promise<NextResponse | null> {
  const secret = process.env.AUTH_SECRET;
  const token  = cookies().get(SESSION_COOKIE)?.value;

  if (!secret || !(await verifySessionToken(token, secret))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}
