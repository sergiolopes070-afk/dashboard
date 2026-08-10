import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { setPrestataireAccess, getPrestataireByLogin } from "@/lib/sheets";
import { hashCode } from "@/lib/auth";

export const dynamic = "force-dynamic";

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);

// POST { id, login? } — (ré)génère l'identifiant + un code à 6 chiffres pour un
// prestataire. Le code EN CLAIR n'est renvoyé qu'une fois (le patron le transmet) ;
// seule sa version hachée est stockée. Réservé au patron.
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "AUTH_SECRET manquant" }, { status: 500 });

  const { id, login: loginInput } = await req.json() as { id?: string; login?: string };
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: p, error } = await supabase.from("prestataires").select("nom, login").eq("id", id).single();
  if (error || !p) return NextResponse.json({ error: "Prestataire introuvable" }, { status: 404 });

  let login = (loginInput || (p.login as string) || slug(p.nom as string) || "presta").trim();
  // Unicité de l'identifiant (sauf si c'est déjà celui de ce prestataire).
  const existing = await getPrestataireByLogin(login);
  if (existing && existing.id !== id) login = `${login}${Math.floor(Date.now() % 1000)}`;

  // Code à 6 chiffres, aléatoire cryptographique.
  const buf = new Uint32Array(1); crypto.getRandomValues(buf);
  const code = String(100000 + (buf[0] % 900000));

  const h = await hashCode(secret, login, code);
  await setPrestataireAccess(id, login, h);

  // ⚠️ `code` renvoyé une seule fois — non stocké en clair.
  return NextResponse.json({ login, code });
}
