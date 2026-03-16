import { NextResponse } from "next/server";
import { getPrestations, updatePrestation } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getPrestations();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { row, updates } = body as {
      row: number;
      updates: Record<string, string>;
      sheet?: string;
    };
    if (!row || !updates) {
      return NextResponse.json({ error: "row et updates requis" }, { status: 400 });
    }
    await updatePrestation(row, updates);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
