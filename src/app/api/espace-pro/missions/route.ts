import { NextResponse } from "next/server";
import { requirePresta } from "@/lib/require-auth";
import { getMissionsForPrestataire } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// Missions du prestataire CONNECTÉ (id issu de sa session) — jamais de prix.
export async function GET() {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  try {
    const missions = await getMissionsForPrestataire(auth.pid);
    return NextResponse.json(missions);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
