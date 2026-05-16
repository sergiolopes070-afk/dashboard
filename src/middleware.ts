import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("auth_session")?.value;
  const secret = process.env.AUTH_SECRET;

  console.log("[MIDDLEWARE]", pathname, "| session:", session ? "EXISTS" : "NONE", "| secret:", secret ? "SET" : "NOT SET");

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

  const isAuthenticated = session && secret && session === secret;

  // Pas connecté → rediriger vers /login
  if (!isAuthenticated && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Déjà connecté → rediriger vers le dashboard
  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts|favicon.ico).*)"],
};
