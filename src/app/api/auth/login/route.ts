import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  const validEmail = process.env.AUTH_EMAIL;
  const validPassword = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!validEmail || !validPassword || !secret) {
    return NextResponse.json(
      { error: "Configuration manquante côté serveur" },
      { status: 500 }
    );
  }

  if (email !== validEmail || password !== validPassword) {
    return NextResponse.json(
      { error: "Adresse mail ou mot de passe incorrect" },
      { status: 401 }
    );
  }

  // Cookie = jeton signé (HMAC-SHA256) avec expiration intégrée dans la charge signée.
  const token = await createSessionToken(secret);
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

  return response;
}
