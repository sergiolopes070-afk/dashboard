import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const fromEnv: Record<string, string> = {};
  if (process.env.GMAIL_USER)             fromEnv.gmail_user             = process.env.GMAIL_USER;
  if (process.env.GMAIL_APP_PASSWORD)     fromEnv.gmail_app_password     = "***";
  if (process.env.STRIPE_SECRET_KEY)      fromEnv.stripe_secret_key      = "***";
  if (process.env.STRIPE_PUBLISHABLE_KEY) fromEnv.stripe_publishable_key = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!supabase) {
    return NextResponse.json({ ...fromEnv, _supabase: false, _tableReady: false });
  }

  const { data, error } = await supabase.from("settings").select("key, value");

  if (error) {
    // Table inexistante ou autre erreur Supabase
    return NextResponse.json({ ...fromEnv, _supabase: true, _tableReady: false, _error: error.message });
  }

  const fromDB: Record<string, string> = {};
  for (const row of data || []) {
    fromDB[row.key as string] = row.value as string;
  }

  return NextResponse.json({ ...fromDB, ...fromEnv, _supabase: true, _tableReady: true });
}

export async function PUT(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) {
    return NextResponse.json({ error: "Supabase non configuré — ajoutez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local" }, { status: 500 });
  }

  const body = await req.json() as Record<string, string>;

  for (const [key, value] of Object.entries(body)) {
    if (!value) {
      await supabase.from("settings").delete().eq("key", key);
      continue;
    }
    const { error } = await supabase
      .from("settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({
          error: "La table 'settings' n'existe pas encore. Exécutez le SQL indiqué dans la page Configuration.",
          needsSetup: true,
        }, { status: 500 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
