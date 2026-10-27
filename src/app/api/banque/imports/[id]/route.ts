// DELETE /api/banque/imports/:id → annule un import (supprime ses opérations).
// Réservé à la session patron privée (404 sinon).
import { NextResponse } from "next/server";
import { requirePrive } from "@/lib/require-auth";
import { sb, libererContreparties, reponseErreur, verifierErreur } from "@/lib/banque-serveur";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const refus = await requirePrive();
  if (refus) return refus;
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  try {
    // D'abord libérer les lignes d'autres imports appariées à celles-ci.
    const liberees = await libererContreparties(params.id);
    const { data, error } = await sb().from("banque_operations").delete().eq("import_id", params.id).select("id");
    verifierErreur(error);
    const { error: e2 } = await sb().from("banque_imports").delete().eq("id", params.id);
    verifierErreur(e2);
    return NextResponse.json({ success: true, nbSupprimees: (data || []).length, nbLiberees: liberees });
  } catch (e) {
    return reponseErreur(e);
  }
}
