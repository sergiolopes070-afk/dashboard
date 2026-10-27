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
    pathname.startsWith("/api/leads") ||       // webhook leads du site : protégé par x-api-key (serveur-à-serveur)
    pathname.startsWith("/api/avance") ||      // scan avance immédiate : session OU clé (comme le cron)
    pathname === "/api/stripe/webhook" ||      // Stripe : appel serveur-à-serveur, vérifié par signature
    pathname === "/api/mission/reponse" ||     // liens Accepter/Refuser envoyés aux prestataires (non connectés)
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

  // Espace réservé à la session patron privée : pour toute autre session, on sert
  // EXACTEMENT la même réponse qu'une URL inexistante (réécriture vers un chemin
  // qui n'existe pas → 404 standard de Next), sans redirection ni message dédié.
  // Chemin normalisé (décodage %xx répété, « // », « / » final, casse) pour que
  // /%62anque, /BANQUE, /banque// … soient traités comme /banque.
  const chemin = cheminNormalise(pathname);
  const zoneReservee =
    chemin === "/banque" || chemin.startsWith("/banque/") ||
    chemin === "/api/banque" || chemin.startsWith("/api/banque/");
  const introuvable = zoneReservee && !(sess && sess.role === "owner" && sess.prive === true);

  // Session glissante : ré-émettre un jeton frais (même rôle/pid/drapeau) à chaque requête.
  const response = introuvable
    ? NextResponse.rewrite(new URL(chemin.startsWith("/api/") ? "/api/__introuvable" : "/__introuvable", request.url))
    : NextResponse.next();
  if (sess && secret) {
    const fresh = await createSessionToken(secret, { role: sess.role, pid: sess.pid, prive: sess.prive === true });
    response.cookies.set(SESSION_COOKIE, fresh, sessionCookieOptions());
  }
  return response;
}

function cheminNormalise(p: string): string {
  let s = p;
  for (let i = 0; i < 3; i++) {
    try { const d = decodeURIComponent(s); if (d === s) break; s = d; } catch { break; }
  }
  s = s.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts|favicon.ico).*)"],
};
