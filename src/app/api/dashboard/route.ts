import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getDashboardStats } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const stats = await getDashboardStats();
    // L'accueil et Pilotage n'affichent jamais les photos d'intervention : elles
    // représentaient la moitié du poids de la réponse (historique complet).
    const sansPhotos = <T extends { photos?: unknown }>(l: T[]) => l.map(({ photos: _photos, ...p }) => p); // eslint-disable-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ ...stats, prestations: sansPhotos(stats.prestations), archive: sansPhotos(stats.archive) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
