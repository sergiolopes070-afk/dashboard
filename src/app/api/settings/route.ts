import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Lit tous les settings depuis Supabase (table key/value) */
export async function GET() {
  // Vérifier d'abord les env vars (priorité)
  const fromEnv: Record<string, string> = {};
  if (process.env.GMAIL_USER)          fromEnv.gmail_user           = process.env.GMAIL_USER;
  if (process.env.GMAIL_APP_PASSWORD)  fromEnv.gmail_app_password   = "***configured***";
  if (process.env.STRIPE_SECRET_KEY)   fromEnv.stripe_secret_key    = "***configured***";
  if (process.env.STRIPE_PUBLISHABLE_KEY) fromEnv.stripe_publishable_key = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!supabase) return NextResponse.json(fromEnv);

  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) return NextResponse.json(fromEnv); // table pas encore créée → on retourne les env vars

  const fromDB: Record<string, string> = {};
  for (const row of data || []) {
    fromDB[row.key as string] = row.value as string;
  }

  // Env vars ont priorité sur DB
  return NextResponse.json({ ...fromDB, ...fromEnv });
}

/** Sauvegarde des settings dans Supabase */
export async function PUT(req: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });

  const body = await req.json() as Record<string, string>;
  const entries = Object.entries(body);

  for (const [key, value] of entries) {
    if (!value) {
      // Supprimer la clé si valeur vide
      await supabase.from("settings").delete().eq("key", key);
      continue;
    }
    const { error } = await supabase
      .from("settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
