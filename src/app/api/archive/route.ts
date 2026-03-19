import { NextResponse } from "next/server";
import { getArchive, archivePrestation } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getArchive();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Archive une prestation : set archive = true + raison
export async function POST(req: Request) {
  try {
    const { id, raison } = await req.json() as { id: string; raison: string };
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await archivePrestation(id, raison || "");
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
