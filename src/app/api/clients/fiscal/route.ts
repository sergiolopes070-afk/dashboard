import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Préférence fiscale PAR CLIENT (avance immédiate / crédit d'impôt / aucun).
// Stockée dans la table `settings` (clé `fiscal_clients`, JSON) — aucune colonne
// à créer. Sert de pense-bête ET adapte le texte des relances.
//   { "<client_id>": "avance" | "credit" | "" }
const KEY = "fiscal_clients";
export type Fiscal = "" | "avance" | "credit";
type Map = Record<string, Fiscal>;

async function lire(): Promise<Map> {
  if (!supabase) return {};
  const { data } = await supabase.from("settings").select("value").eq("key", KEY).maybeSingle();
  try { return data?.value ? (JSON.parse(data.value as string) as Map) : {}; }
  catch { return {}; }
}

// GET ?clientId=<id> → { fiscal }
export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requis" }, { status: 400 });

  const map = await lire();
  return NextResponse.json({ fiscal: map[clientId] ?? "" });
}

// POST { clientId, fiscal } → enregistre
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { clientId, fiscal } = await req.json() as { clientId?: string; fiscal?: Fiscal };
  if (!clientId) return NextResponse.json({ error: "clientId requis" }, { status: 400 });

  const valide: Fiscal = fiscal === "avance" || fiscal === "credit" ? fiscal : "";
  const map = await lire();
  if (valide) map[clientId] = valide;
  else delete map[clientId];

  const { error } = await supabase.from("settings").upsert({ key: KEY, value: JSON.stringify(map) }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, fiscal: valide });
}
