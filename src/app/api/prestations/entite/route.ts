import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { Entite, ENTITES, ENTITE_OVERRIDE_KEY } from "@/lib/entite";

export const dynamic = "force-dynamic";

// Correction MANUELLE de l'entité par prestation. Par défaut l'entité est
// déduite du type (getEntite) ; cette table ne stocke QUE les exceptions.
// Stockée dans `settings` (clé `entite_override`, JSON) — aucune colonne à créer.
//   { "<prestation_id>": "Kinouclean SAS" | "Kinourent" }
const KEY = ENTITE_OVERRIDE_KEY;
type Map = Record<string, Entite>;

async function lire(): Promise<Map> {
  if (!supabase) return {};
  const { data } = await supabase.from("settings").select("value").eq("key", KEY).maybeSingle();
  try { return data?.value ? (JSON.parse(data.value as string) as Map) : {}; }
  catch { return {}; }
}

// GET → { overrides } (map complète)
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ overrides: {} });

  return NextResponse.json({ overrides: await lire() });
}

// POST { prestationId, entite } → enregistre (entite vide/null = revenir à l'auto)
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { prestationId, entite } = await req.json() as { prestationId?: string; entite?: string | null };
  if (!prestationId) return NextResponse.json({ error: "prestationId requis" }, { status: 400 });

  const map = await lire();
  if (entite && ENTITES.includes(entite as Entite)) map[prestationId] = entite as Entite;
  else delete map[prestationId]; // vide → suppression de l'exception (retour à l'auto)

  const { error } = await supabase.from("settings").upsert({ key: KEY, value: JSON.stringify(map) }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, overrides: map });
}
