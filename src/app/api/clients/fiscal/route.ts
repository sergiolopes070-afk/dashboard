import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getSettingJSON, setSettingRaw } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Préférence fiscale PAR CLIENT (avance immédiate / crédit d'impôt / aucun).
// Stockée dans la table `settings` (clé `fiscal_clients`, JSON) — aucune colonne
// à créer. Sert de pense-bête ET adapte le texte des relances.
//   { "<client_id>": "avance" | "credit" | "" }
const KEY = "fiscal_clients";
export type Fiscal = "" | "avance" | "credit";
type Map = Record<string, Fiscal>;

async function lire(): Promise<Map> {
  return getSettingJSON<Map>(KEY, {});
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

  const err = await setSettingRaw(KEY, JSON.stringify(map));
  if (err) return NextResponse.json({ error: err }, { status: 500 });

  return NextResponse.json({ success: true, fiscal: valide });
}
