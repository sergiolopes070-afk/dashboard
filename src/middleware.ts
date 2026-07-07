import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, createSessionToken, sessionCookieOptions } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;

  // Laisser passer les assets statiques et les routes d'auth API
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/avis") ||
    pathname.startsWith("/avis") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Vérifie la signature HMAC + l'expiration du jeton.
  const isAuthenticated = !!secret && await verifySessionToken(session, secret);

  // Pas connecté → rediriger vers /login
  if (!isAuthenticated && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Déjà connecté → rediriger vers le dashboard
  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Session glissante : ré-émettre un jeton frais à chaque requête active,
  // pour ne pas déconnecter l'utilisateur en pleine session de travail.
  const response = NextResponse.next();
  if (isAuthenticated && secret) {
    const fresh = await createSessionToken(secret);
    response.cookies.set(SESSION_COOKIE, fresh, sessionCookieOptions());
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts|favicon.ico).*)"],
};
