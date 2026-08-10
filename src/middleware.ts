import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken, createSessionToken, sessionCookieOptions } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;

  // Laisser passer les assets statiques et les routes publiques / à secret propre.
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/avis") ||
    pathname.startsWith("/api/cron") ||        // cron : protégé par CRON_SECRET, pas par la session
    pathname === "/api/stripe/webhook" ||      // Stripe : appel serveur-à-serveur, vérifié par signature
    pathname.startsWith("/avis") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    // Assets PWA publics (icône + manifeste) : accessibles sans connexion.
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon")
  ) {
    return NextResponse.next();
  }

  const sess = secret ? await readSessionToken(session, secret) : null;

  // Pas connecté → rediriger vers /login
  if (!sess && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Déjà connecté sur /login → rediriger vers l'espace adapté au rôle.
  if (sess && pathname === "/login") {
    return NextResponse.redirect(new URL(sess.role === "presta" ? "/espace-pro" : "/", request.url));
  }

  // ── Cloisonnement par rôle ─────────────────────────────────────────────────
  // Le prestataire n'accède QU'À son espace (pages + API dédiées) et à /api/auth.
  if (sess && sess.role === "presta") {
    const autorise = pathname.startsWith("/espace-pro") || pathname.startsWith("/api/espace-pro");
    if (!autorise) return NextResponse.redirect(new URL("/espace-pro", request.url));
  }

  // Session glissante : ré-émettre un jeton frais (même rôle/pid) à chaque requête.
  const response = NextResponse.next();
  if (sess && secret) {
    const fresh = await createSessionToken(secret, { role: sess.role, pid: sess.pid });
    response.cookies.set(SESSION_COOKIE, fresh, sessionCookieOptions());
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts|favicon.ico).*)"],
};
