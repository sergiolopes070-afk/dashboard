import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { buildProspectDevis } from "@/lib/prospectDevis";

export const dynamic = "force-dynamic";

// Génère le devis premium d'un prospect (HTML prêt à imprimer en PDF).
// La logique (lignes, numéro stable, dispositif avance/crédit) est partagée avec
// l'envoi par email via src/lib/prospectDevis.ts.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const res = await buildProspectDevis(params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  return new NextResponse(res.devis.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
