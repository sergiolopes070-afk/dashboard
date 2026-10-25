import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getInscrits } from "@/lib/avanceInscrits";
import { telCle, nomCle } from "@/lib/avanceMatch";

export const dynamic = "force-dynamic";

// Renvoie les identifiants (tél + email + nom normalisés) des clients inscrits à
// l'avance immédiate, pour afficher le badge « inscrit » (agenda, clients, accueil…).
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const inscrits = await getInscrits();
  return NextResponse.json({
    tels  : inscrits.map(i => telCle(i.tel)).filter(Boolean),
    emails: inscrits.map(i => i.email).filter(Boolean),
    noms  : inscrits.map(i => nomCle(i.nom)).filter(Boolean),
  });
}
