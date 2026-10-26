import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getArchive, archivePrestation, deletePrestation } from "@/lib/sheets";
import { lireSettingJSONStrict, majSettingJSON } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { consommerStockPourPrestation } from "@/lib/stockConso";
import { estAnnulation } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Annulation (estAnnulation, constants) : la prestation n'a PAS eu lieu → aucune consommation de stock.

// Retire une prestation du suivi des relances (settings/emails_auto_etat) : une
// prestation archivée ou supprimée ne doit plus figer un badge « Relance x/3 ».
type EtatPresta = { relance?: number; relanceStart?: string; avisEnvoye?: boolean; avisAnnule?: boolean };
async function clearRelanceTracking(id: string) {
  try {
    // Lecture stricte : illisible → on n'écrit rien (un {} de repli effacerait tout le suivi).
    const etat = await lireSettingJSONStrict<Record<string, EtatPresta>>("emails_auto_etat", {});
    if (etat?.[id]) await majSettingJSON<Record<string, EtatPresta>>("emails_auto_etat", {}, e => { delete e[id]; });
  } catch (e) { console.error("clearRelanceTracking:", e); }
}

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const data = await getArchive();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
    await deletePrestation(id);
    await clearRelanceTracking(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const { id, reason, modePaiement, satisfaction, avisLaisse } = await req.json();
    if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });

    // Type de la prestation (avant archivage) pour la consommation de stock.
    let typePresta = "";
    if (supabase) {
      const { data } = await supabase.from("prestations").select("type_prestation").eq("id", id).maybeSingle();
      typePresta = (data?.type_prestation as string) || "";
    }

    // Motif obligatoire : un motif vide n'est pas une annulation (estAnnulation) →
    // il compterait dans le CA et consommerait du stock sans que ce soit voulu.
    const motif = typeof reason === "string" ? reason.trim() : "";
    if (!motif) return NextResponse.json({ error: "Motif d'archivage manquant" }, { status: 400 });

    await archivePrestation(id, motif, modePaiement || "");
    await clearRelanceTracking(id);

    // Satisfaction (colonne) + « a laissé un avis » (réglage avis_laisse) saisis à l'archivage.
    if (supabase && satisfaction != null && satisfaction !== "") {
      try { await supabase.from("prestations").update({ satisfaction: parseInt(String(satisfaction)) || null }).eq("id", id); } catch { /* non bloquant */ }
    }
    if (avisLaisse != null) {
      try {
        // Relecture fraîche, refus si illisible (un {} de repli effacerait toutes les entrées).
        await majSettingJSON<Record<string, boolean>>("avis_laisse", {}, map => { if (avisLaisse) map[id] = true; else delete map[id]; });
      } catch { /* non bloquant */ }
    }

    // Clôture réelle (pas une annulation) → décrémente le stock selon les recettes.
    if (typePresta && !estAnnulation(motif)) {
      await consommerStockPourPrestation(typePresta);
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
