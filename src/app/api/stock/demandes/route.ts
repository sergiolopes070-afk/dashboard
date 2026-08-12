import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getDemandes, setDemandeStatut, removeDemande } from "@/lib/demandes";

export const dynamic = "force-dynamic";

// Côté PATRON : liste / traite / supprime les demandes de matériel des prestataires.
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  return NextResponse.json({ demandes: await getDemandes() });
}

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { id, statut } = await req.json() as { id?: string; statut?: "NOUVELLE" | "TRAITEE" };
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const demandes = await setDemandeStatut(id, statut === "TRAITEE" ? "TRAITEE" : "NOUVELLE");
  return NextResponse.json({ demandes });
}

export async function DELETE(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { id } = await req.json() as { id?: string };
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const demandes = await removeDemande(id);
  return NextResponse.json({ demandes });
}
