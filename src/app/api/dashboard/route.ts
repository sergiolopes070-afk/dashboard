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
    return NextResponse.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
