import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getPrestations, updatePrestation, deletePrestation, insertPrestationForClient } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Marqueur stocké dans `message` pour reconnaître un 2ème passage (offre fidélité).
const PASSAGE2_TAG = "2ème passage gratuit";

// Crée un 2ème passage GRATUIT pour le même client à partir d'un RDV existant.
// POST { action: "reprogram2", fromId, date (YYYY-MM-DD|dd/mm/yyyy), heure? }
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const body = await req.json() as { action?: string; fromId?: string; date?: string; heure?: string; prestataire?: string; typePresta?: string; prix?: string; quantite?: string };
    const { action, fromId } = body;
    if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
    if (!fromId) return NextResponse.json({ error: "fromId requis" }, { status: 400 });

    const { data: orig } = await supabase
      .from("prestations").select("client_id, type_prestation, quantite, adresse, date_intervention, heure_intervention, prestataires(nom)").eq("id", fromId).single();
    if (!orig?.client_id) return NextResponse.json({ error: "RDV d'origine introuvable" }, { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origPrestaNom = (Array.isArray(orig.prestataires) ? orig.prestataires[0]?.nom : (orig.prestataires as any)?.nom) as string | undefined;
    const toFr = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : d;

    // Reprogrammer un 2ème passage GRATUIT (offre fidélité).
    if (action === "reprogram2") {
      if (!body.date) return NextResponse.json({ error: "date requise" }, { status: 400 });
      const id = await insertPrestationForClient(orig.client_id as string, {
        typePresta: (orig.type_prestation as string) || "Prestation",
        quantite  : String(orig.quantite ?? "1"),
        adresse   : (orig.adresse as string) || "",
        date      : toFr(body.date), heure: body.heure || "",
        prix      : "0",
        message   : PASSAGE2_TAG + " (offre fidélité)",
      });
      if (body.prestataire) { try { await updatePrestation(id, { prestataire: body.prestataire }); } catch { /* non bloquant */ } }
      return NextResponse.json({ success: true, id });
    }

    // Ajouter une prestation au MÊME client / même créneau (RDV déjà programmé).
    if (action === "add_prestation") {
      const origDate = orig.date_intervention ? toFr(String(orig.date_intervention)) : "";
      const origHeure = ((orig.heure_intervention as string) || "").substring(0, 5);
      const id = await insertPrestationForClient(orig.client_id as string, {
        typePresta: (body.typePresta as string) || "Prestation",
        quantite  : (body.quantite as string) || "1",
        adresse   : (orig.adresse as string) || "",
        date      : body.date ? toFr(body.date) : origDate,
        heure     : body.heure || origHeure,
        prix      : (body.prix as string) || "",
      });
      const presta = body.prestataire || origPrestaNom;
      if (presta) { try { await updatePrestation(id, { prestataire: presta }); } catch { /* non bloquant */ } }
      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: "action invalide" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const data = await getPrestations();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const { row, updates } = body as {
      row: string;
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

export async function DELETE(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await deletePrestation(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
