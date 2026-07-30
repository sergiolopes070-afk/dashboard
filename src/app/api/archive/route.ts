import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getArchive, archivePrestation, deletePrestation } from "@/lib/sheets";
import { getSettingJSON, setSettingRaw } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Retire une prestation du suivi des relances (settings/emails_auto_etat) : une
// prestation archivée ou supprimée ne doit plus figer un badge « Relance x/3 ».
type EtatPresta = { relance?: number; relanceStart?: string; avisEnvoye?: boolean; avisAnnule?: boolean };
async function clearRelanceTracking(id: string) {
  try {
    const etat = await getSettingJSON<Record<string, EtatPresta>>("emails_auto_etat", {});
    if (etat[id]) { delete etat[id]; await setSettingRaw("emails_auto_etat", JSON.stringify(etat)); }
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
    const { id, reason, modePaiement } = await req.json();
    if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
    await archivePrestation(id, reason || "", modePaiement || "");
    await clearRelanceTracking(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
