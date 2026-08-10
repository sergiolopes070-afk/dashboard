import { NextResponse } from "next/server";
import { requirePresta } from "@/lib/require-auth";
import { getPrestataireIndispos, setPrestataireIndispo } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// GET → { indispos: [{date, debut, fin}, …] } du prestataire connecté.
export async function GET() {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ indispos: await getPrestataireIndispos(auth.pid) });
}

// POST { date, debut?, fin?, bloquer } → ajoute/retire une indispo (jour entier
// si debut/fin vides, sinon créneau). Prestataire connecté uniquement.
export async function POST(req: Request) {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  const b = await req.json() as { date?: string; debut?: string; fin?: string; bloquer?: boolean };
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  const hm = /^\d{2}:\d{2}$/;
  const debut = b.debut && hm.test(b.debut) ? b.debut : "";
  const fin = b.fin && hm.test(b.fin) ? b.fin : "";
  try {
    const indispos = await setPrestataireIndispo(auth.pid, { date: b.date, debut, fin }, !!b.bloquer);
    return NextResponse.json({ indispos });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
