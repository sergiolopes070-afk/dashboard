import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Active / désactive la demande d'avis automatique pour UNE prestation.
// L'état est stocké dans la table `settings` (clé `emails_auto_etat`, JSON),
// comme le reste du suivi anti-doublon — aucune colonne à créer.
const ETAT_KEY = "emails_auto_etat";
type EtatPresta = { relance?: number; avisEnvoye?: boolean; avisAnnule?: boolean };
type Etat = Record<string, EtatPresta>;

async function lireEtat(): Promise<Etat> {
  if (!supabase) return {};
  const { data } = await supabase.from("settings").select("value").eq("key", ETAT_KEY).maybeSingle();
  try { return data?.value ? (JSON.parse(data.value as string) as Etat) : {}; }
  catch { return {}; }
}

// GET ?id=<prestationId> → { avisAnnule: boolean }
export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const etat = await lireEtat();
  return NextResponse.json({ avisAnnule: !!etat[id]?.avisAnnule });
}

// POST { prestationId, annule } → met à jour l'état
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { prestationId, annule } = await req.json() as { prestationId?: string; annule?: boolean };
  if (!prestationId) return NextResponse.json({ error: "prestationId requis" }, { status: 400 });

  const etat = await lireEtat();
  etat[prestationId] = { ...(etat[prestationId] ?? {}), avisAnnule: !!annule };

  const { error } = await supabase.from("settings").upsert({ key: ETAT_KEY, value: JSON.stringify(etat) }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, avisAnnule: !!annule });
}
