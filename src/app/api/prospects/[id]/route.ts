import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { appendPrestation } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// ─── PATCH — mettre à jour un prospect ────────────────────────────────────────
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const { id } = params;
  const body = await req.json();

  // Ajout d'un commentaire interne
  if (body.addComment) {
    const { data: current } = await supabase
      .from("prospects")
      .select("commentaires")
      .eq("id", id)
      .single();

    const existing = Array.isArray(current?.commentaires) ? current.commentaires : [];
    const newComment = {
      id   : crypto.randomUUID(),
      date : new Date().toISOString(),
      texte: body.addComment,
    };
    const { error } = await supabase
      .from("prospects")
      .update({
        commentaires: [...existing, newComment],
        updated_at  : new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, comment: newComment });
  }

  // Mise à jour standard (statut, date_relance, notes, champs contact…)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.genre       !== undefined) patch.genre        = body.genre || null;
  if (body.statut      !== undefined) patch.statut       = body.statut;
  if (body.dateRelance !== undefined) patch.date_relance = body.dateRelance || null;
  if (body.notes       !== undefined) patch.notes        = body.notes;
  if (body.prenom      !== undefined) patch.prenom       = body.prenom;
  if (body.nom         !== undefined) patch.nom          = body.nom;
  if (body.tel         !== undefined) patch.tel          = body.tel;
  if (body.email       !== undefined) patch.email        = body.email;
  if (body.typePresta  !== undefined) patch.type_presta  = body.typePresta;
  if (body.adresse     !== undefined) patch.adresse      = body.adresse;
  if (body.budget      !== undefined) patch.budget       = body.budget;
  if (body.source        !== undefined) patch.source        = body.source;
  if (body.relanceSteps  !== undefined) patch.relance_steps = Array.isArray(body.relanceSteps) ? body.relanceSteps.join(",") : "";

  const { error } = await supabase.from("prospects").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ─── DELETE — supprimer un prospect ───────────────────────────────────────────
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const { error } = await supabase.from("prospects").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ─── POST — convertir en client ───────────────────────────────────────────────
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const { id } = params;
  const body = await req.json();

  // Récupère les données du prospect
  const { data: prospect, error: fetchErr } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  // Crée le client + la prestation via la fonction existante
  const prestationId = await appendPrestation({
    prenom     : prospect.prenom,
    nom        : prospect.nom,
    tel        : prospect.tel     || "",
    email      : prospect.email   || "",
    typePresta : body.typePresta  || prospect.type_presta || "",
    quantite   : "1",
    adresse    : body.adresse     || prospect.adresse || "",
    date       : body.date        || "",
    heure      : body.heure       || "",
    message    : prospect.notes   || "",
    prix       : body.prix        || "",
    prestataire: body.prestataire || "",
    statut     : body.prestataire ? "EMAIL ENVOYÉ" : "",
    commentaire: `Converti depuis prospect. ${prospect.notes || ""}`.trim(),
  });

  // Marque le prospect comme CONVERTI
  await supabase
    .from("prospects")
    .update({ statut: "CONVERTI", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ success: true, prestationId });
}
