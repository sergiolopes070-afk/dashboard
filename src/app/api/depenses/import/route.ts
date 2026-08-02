import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createDepenses } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// Import groupé de dépenses (depuis un relevé bancaire). Le tri/anti-doublon et
// l'aperçu sont faits côté client ; ici on insère la sélection validée.
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const body = await req.json() as { depenses?: unknown };
    const list = Array.isArray(body.depenses) ? body.depenses : [];
    if (!list.length) return NextResponse.json({ error: "Aucune dépense à importer" }, { status: 400 });

    // Nettoyage / validation minimale de chaque ligne.
    const rows = list.map((d) => {
      const x = d as Record<string, unknown>;
      return {
        nom       : String(x.nom || "").slice(0, 200),
        categorie : String(x.categorie || "Autre"),
        montant   : Number(x.montant) || 0,
        type      : x.type === "mensuel" ? "mensuel" as const : "ponctuel" as const,
        date      : String(x.date || "").slice(0, 10),
        notes     : x.notes ? String(x.notes).slice(0, 500) : undefined,
      };
    }).filter(r => r.nom && r.montant > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date));

    if (!rows.length) return NextResponse.json({ error: "Lignes invalides" }, { status: 400 });

    const imported = await createDepenses(rows);
    return NextResponse.json({ success: true, imported });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
