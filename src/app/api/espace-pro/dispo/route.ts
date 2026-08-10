import { NextResponse } from "next/server";
import { requirePresta } from "@/lib/require-auth";
import { getPrestataireIndispos, togglePrestataireIndispo } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// GET → { indispos: ["YYYY-MM-DD", …] } du prestataire connecté.
export async function GET() {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  const indispos = await getPrestataireIndispos(auth.pid);
  return NextResponse.json({ indispos });
}

// POST { date, bloquer } → pose/retire un jour de congé (prestataire connecté).
export async function POST(req: Request) {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  const { date, bloquer } = await req.json() as { date?: string; bloquer?: boolean };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  try {
    const indispos = await togglePrestataireIndispo(auth.pid, date, !!bloquer);
    return NextResponse.json({ indispos });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
