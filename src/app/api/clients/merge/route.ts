import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Fusionne une ou plusieurs fiches clients dupliquées dans une fiche "maître".
// Étapes (dans l'ordre, pour ne rien perdre) :
//   1. Réattribue TOUTES les prestations des doublons à la fiche maître.
//   2. Fusionne notes (dédupliquées) et tags (union) dans la maître.
//   3. Supprime les fiches doublons (désormais sans prestation).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { keepId, mergeIds } = await req.json() as { keepId?: string; mergeIds?: string[] };
  if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
    return NextResponse.json({ error: "keepId et mergeIds requis" }, { status: 400 });
  }
  const doublons = mergeIds.filter(id => id && id !== keepId);
  if (doublons.length === 0) return NextResponse.json({ error: "Aucun doublon distinct" }, { status: 400 });

  // Charge la fiche maître + les doublons (pour fusionner notes/tags)
  const { data: fiches, error: e1 } = await supabase
    .from("clients")
    .select("id, notes, tags")
    .in("id", [keepId, ...doublons]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const master: any = (fiches || []).find(f => f.id === keepId);
  if (!master) return NextResponse.json({ error: "Fiche maître introuvable" }, { status: 404 });

  // 1. Réattribue les prestations des doublons à la maître
  const { error: e2 } = await supabase
    .from("prestations")
    .update({ client_id: keepId })
    .in("client_id", doublons);
  if (e2) return NextResponse.json({ error: `Réattribution: ${e2.message}` }, { status: 500 });

  // 2. Fusionne notes (dédupliquées par id) + tags (union)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notesMap = new Map<string, any>();
  for (const f of (fiches || [])) {
    const notes = Array.isArray(f.notes) ? f.notes : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const n of notes) if (n?.id) notesMap.set(n.id, n);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notesFusion = Array.from(notesMap.values()).sort((a: any, b: any) => (a.date < b.date ? 1 : -1));

  const tagsSet = new Set<string>();
  for (const f of (fiches || [])) {
    const tags = Array.isArray(f.tags) ? f.tags : [];
    for (const t of tags) if (t) tagsSet.add(t);
  }

  const { error: e3 } = await supabase
    .from("clients")
    .update({ notes: notesFusion, tags: Array.from(tagsSet) })
    .eq("id", keepId);
  if (e3) return NextResponse.json({ error: `Fusion notes/tags: ${e3.message}` }, { status: 500 });

  // 3. Supprime les fiches doublons (sans prestation désormais)
  const { error: e4 } = await supabase.from("clients").delete().in("id", doublons);
  if (e4) return NextResponse.json({ error: `Suppression doublons: ${e4.message}` }, { status: 500 });

  return NextResponse.json({ success: true, fusionnees: doublons.length });
}
