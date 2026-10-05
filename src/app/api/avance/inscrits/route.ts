import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getInscrits } from "@/lib/avanceInscrits";

export const dynamic = "force-dynamic";

// Renvoie les identifiants (tél + email normalisés) des clients inscrits à
// l'avance immédiate, pour afficher le statut « inscrit » dans l'agenda.
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const inscrits = await getInscrits();
  return NextResponse.json({
    tels  : inscrits.map(i => i.tel).filter(Boolean),
    emails: inscrits.map(i => i.email).filter(Boolean),
  });
}
