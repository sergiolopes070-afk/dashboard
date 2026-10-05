import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { buildProspectDevis } from "@/lib/prospectDevis";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // rendu PDF (Chromium) possible

// Génère le devis premium d'un prospect.
//   • défaut            → HTML (aperçu rapide, imprimable).
//   • ?pdf=1            → vrai PDF A4 (même rendu que la pièce jointe email).
// La logique (lignes, numéro stable, dispositif avance/crédit) est partagée avec
// l'envoi par email via src/lib/prospectDevis.ts.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const res = await buildProspectDevis(params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  const wantPdf = new URL(req.url).searchParams.get("pdf") === "1";
  if (wantPdf) {
    const { renderDevisPdf } = await import("@/lib/devisPdf");
    const pdf = await renderDevisPdf(res.devis.data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Devis-KinouClean-${res.devis.num}.pdf"`,
      },
    });
  }

  return new NextResponse(res.devis.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
