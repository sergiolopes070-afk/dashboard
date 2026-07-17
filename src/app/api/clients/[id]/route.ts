import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { insertPrestationForClient } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const CANCELLATION_REASONS = ["Annulation client", "Client injoignable", "Doublon"];
const isCancelled = (r: string | null) => CANCELLATION_REASONS.some(c => (r || "").startsWith(c));

function isoToFr(s: string | null): string {
  if (!s) return "";
  const p = s.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

// Renvoie une fiche client complète (coordonnées + TOUT l'historique, archivé inclus).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { data: client, error } = await supabase
    .from("clients")
    .select("id, nom, prenom, tel, email, adresse, tags, notes, created_at")
    .eq("id", params.id)
    .single();

  if (error || !client) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const { data: prestas } = await supabase
    .from("prestations")
    .select("id, type_prestation, date_intervention, heure_intervention, prix, mode_paiement, statut, archive, archive_reason, prestataires(nom)")
    .eq("client_id", params.id)
    .order("date_intervention", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = prestas || [];
  const prestations = rows.map(p => ({
    row         : p.id as string,
    typePresta  : p.type_prestation || "",
    date        : isoToFr(p.date_intervention),
    heure       : (p.heure_intervention || "").substring(0, 5),
    prix        : p.prix != null ? String(p.prix) : "",
    prestataire : Array.isArray(p.prestataires) ? (p.prestataires[0]?.nom || "") : (p.prestataires?.nom || ""),
    modePaiement: p.mode_paiement || "",
    statut      : p.statut || "",
    archived    : !!p.archive,
  }));

  const totalCA = rows
    .filter(p => !(p.archive && isCancelled(p.archive_reason)))
    .reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);

  const dates = prestations.map(p => p.date).filter(Boolean);
  const derniere = dates.sort((a, b) => (a < b ? 1 : -1))[0] || "";

  return NextResponse.json({
    clientId   : client.id,
    nom        : client.nom    || "",
    prenom     : client.prenom || "",
    tel        : client.tel    || "",
    email      : client.email  || "",
    adresse    : client.adresse || "",
    prestations,
    totalCA,
    derniere,
    creeLe     : client.created_at || "",
    tags       : Array.isArray(client.tags) ? client.tags : [],
    notes      : Array.isArray(client.notes) ? client.notes : [],
  });
}

// POST : ajoute un nouveau RDV / prestation à ce client (reprogrammation).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const b = await req.json() as { typePresta?: string; date?: string; heure?: string; prix?: string; message?: string };
    const id = await insertPrestationForClient(params.id, {
      typePresta: b.typePresta || "",
      date      : b.date       || "",
      heure     : b.heure      || "",
      prix      : b.prix       || "",
      message   : b.message    || "",
    });
    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
