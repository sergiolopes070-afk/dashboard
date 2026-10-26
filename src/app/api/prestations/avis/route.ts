import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { majSettingJSON } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Met à jour MANUELLEMENT la satisfaction (colonne) et/ou le flag « avis laissé »
// (réglage avis_laisse) d'une prestation — y compris APRÈS archivage. Sert aux
// primes prestataire (chaque avis obtenu = prime) sans ré-archiver la prestation.
// POST { id, avisLaisse?: boolean, satisfaction?: number|"" }
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { id, avisLaisse, satisfaction } = await req.json() as { id?: string; avisLaisse?: boolean; satisfaction?: number | string };
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  if (satisfaction !== undefined) {
    const val = satisfaction === "" || satisfaction == null ? null : (parseInt(String(satisfaction)) || null);
    try { await supabase.from("prestations").update({ satisfaction: val }).eq("id", id); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 }); }
  }

  if (avisLaisse !== undefined) {
    try {
      await majSettingJSON<Record<string, boolean>>("avis_laisse", {}, map => { if (avisLaisse) map[id] = true; else delete map[id]; });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 }); }
  }

  return NextResponse.json({ ok: true });
}
