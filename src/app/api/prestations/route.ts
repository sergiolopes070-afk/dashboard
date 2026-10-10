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
    const { action, fromId, date, heure } = await req.json() as { action?: string; fromId?: string; date?: string; heure?: string };
    if (action !== "reprogram2") return NextResponse.json({ error: "action invalide" }, { status: 400 });
    if (!fromId || !date) return NextResponse.json({ error: "fromId et date requis" }, { status: 400 });
    if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

    const { data: orig } = await supabase
      .from("prestations").select("client_id, type_prestation, quantite, adresse").eq("id", fromId).single();
    if (!orig?.client_id) return NextResponse.json({ error: "RDV d'origine introuvable" }, { status: 404 });

    // insertPrestationForClient attend une date FR (dd/mm/yyyy).
    const dateFr = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : date;
    const id = await insertPrestationForClient(orig.client_id as string, {
      typePresta: (orig.type_prestation as string) || "Prestation",
      quantite  : String(orig.quantite ?? "1"),
      adresse   : (orig.adresse as string) || "",
      date      : dateFr,
      heure     : heure || "",
      prix      : "0",
      message   : PASSAGE2_TAG + " (offre fidélité)",
    });
    return NextResponse.json({ success: true, id });
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
