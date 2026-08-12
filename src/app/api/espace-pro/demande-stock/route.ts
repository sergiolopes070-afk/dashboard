import { NextResponse } from "next/server";
import { requirePresta } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { addDemande } from "@/lib/demandes";

export const dynamic = "force-dynamic";

// POST { categorie, quantite?, details } — le prestataire connecté demande du
// matériel. La demande remonte sur le tableau de bord du patron.
export async function POST(req: Request) {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;

  const b = await req.json() as { categorie?: string; quantite?: string; details?: string };
  const categorie = (b.categorie || "Autre").slice(0, 40);
  const details = (b.details || "").slice(0, 400).trim();
  const quantite = (b.quantite || "").slice(0, 40).trim();
  if (!details && categorie === "Autre") return NextResponse.json({ error: "Précise ta demande" }, { status: 400 });

  // Nom du prestataire pour l'affichage côté patron.
  let nom = "";
  if (supabase) {
    const { data } = await supabase.from("prestataires").select("nom").eq("id", auth.pid).maybeSingle();
    nom = (data?.nom as string) || "";
  }

  try {
    const demande = await addDemande({ prestataireId: auth.pid, prestataireNom: nom, categorie, quantite, details });
    return NextResponse.json({ demande });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
