// GET /api/banque/imports → derniers imports de relevés.
// Réservé à la session patron privée (404 sinon).
import { NextResponse } from "next/server";
import { requirePrive } from "@/lib/require-auth";
import { sb, reponseErreur, verifierErreur } from "@/lib/banque-serveur";

export const dynamic = "force-dynamic";

export async function GET() {
  const refus = await requirePrive();
  if (refus) return refus;
  try {
    const { data, error } = await sb().from("banque_imports")
      .select("id, compte, fichier, nb_lignes, nb_nouvelles, created_at")
      .order("created_at", { ascending: false }).limit(50);
    verifierErreur(error);
    return NextResponse.json(data || []);
  } catch (e) {
    return reponseErreur(e);
  }
}
