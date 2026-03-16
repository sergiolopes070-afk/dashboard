import { NextResponse } from "next/server";
import { appendPrestation, updatePrestation } from "@/lib/sheets";
import { SHEET_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

// POST : ajouter un nouveau client / prestation
export async function POST(req: Request) {
  try {
    const body = await req.json();
    await appendPrestation({
      nom       : body.nom        || "",
      prenom    : body.prenom     || "",
      tel       : body.tel        || "",
      email     : body.email      || "",
      typePresta: body.typePresta || "",
      quantite  : body.quantite   || "",
      adresse   : body.adresse    || "",
      date      : body.date       || "",
      heure     : body.heure      || "",
      message   : body.message    || "",
      prix      : body.prix       || "",
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH : modifier les infos client sur toutes ses prestations
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { rows, updates } = body as {
      rows: number[];
      updates: Record<string, string>;
    };
    if (!rows?.length || !updates) {
      return NextResponse.json({ error: "rows et updates requis" }, { status: 400 });
    }
    await Promise.all(rows.map((row) => updatePrestation(row, updates, SHEET_NAME)));
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
