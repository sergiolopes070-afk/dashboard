import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE, hashCode } from "@/lib/auth";
import { getPrestataireByLogin } from "@/lib/sheets";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json() as { email?: string; password?: string };
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Configuration manquante côté serveur" }, { status: 500 });

  const id = (email || "").trim();
  const code = (password || "").trim();

  // 1) Patron : email + mot de passe (variables d'env).
  if (id && code && id === process.env.AUTH_EMAIL && code === process.env.AUTH_PASSWORD) {
    const token = await createSessionToken(secret, { role: "owner" });
    const res = NextResponse.json({ success: true, role: "owner" });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }

  // 2) Prestataire : identifiant + code (haché en base).
  try {
    const p = await getPrestataireByLogin(id);
    if (p && p.codeHash && code) {
      const h = await hashCode(secret, p.login, code);
      if (h === p.codeHash) {
        const token = await createSessionToken(secret, { role: "presta", pid: p.id });
        const res = NextResponse.json({ success: true, role: "presta" });
        res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
        return res;
      }
    }
  } catch { /* on retombe sur l'erreur générique ci-dessous */ }

  return NextResponse.json({ error: "Identifiant ou code incorrect" }, { status: 401 });
}
