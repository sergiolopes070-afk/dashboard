import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { appendPrestation } from "@/lib/sheets";
import { transferDevisExternes, findClientForProspect } from "@/app/api/devis-externes/_store";

export const dynamic = "force-dynamic";

// ─── PATCH — mettre à jour un prospect ────────────────────────────────────────
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const { id } = params;
  const body = await req.json();

  // Ajout d'un commentaire interne. Ajouter une note = une action a eu lieu → on
  // le marque « à recontacter » et on le sort de « Nouveau ». MAIS si une date de
  // relance FUTURE est déjà posée (relance déjà programmée), on la conserve — on
  // ne ramène pas un prospect déjà planifié dans l'onglet « aujourd'hui ».
  if (body.addComment) {
    const { data: current } = await supabase
      .from("prospects")
      .select("commentaires, statut, date_relance")
      .eq("id", id)
      .single();

    const existing = Array.isArray(current?.commentaires) ? current.commentaires : [];
    const newComment = {
      id   : crypto.randomUUID(),
      date : new Date().toISOString(),
      texte: body.addComment,
    };
    const today = new Date().toISOString().split("T")[0];
    const curDate = current?.date_relance ? String(current.date_relance).slice(0, 10) : "";
    // On ne touche la date que si aucune n'est posée, ou si elle est déjà passée/aujourd'hui.
    const newDate = (!curDate || curDate <= today) ? today : curDate;
    const nouveauStatut = (current?.statut === "NOUVEAU") ? "CONTACTÉ" : (current?.statut as string);
    const { error } = await supabase
      .from("prospects")
      .update({
        commentaires: [...existing, newComment],
        date_relance: newDate,
        statut      : nouveauStatut,
        updated_at  : new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, comment: newComment, dateRelance: newDate, statut: nouveauStatut });
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
  if (body.besoins     !== undefined) patch.besoins      = body.besoins; // prestations souhaitées (JSONB)
  if (body.source        !== undefined) patch.source        = body.source;
  if (body.relanceSteps  !== undefined) patch.relance_steps = Array.isArray(body.relanceSteps) ? body.relanceSteps.join(",") : "";
  if (body.commentaires  !== undefined) patch.commentaires  = body.commentaires;

  const { error } = await supabase.from("prospects").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Conversion via le formulaire « Nouveau client » : on retrouve le client créé et
  // on y copie les devis externes du prospect (best effort, ne bloque jamais).
  let devisTransferes = 0;
  if (body.statut === "CONVERTI") {
    try {
      // clientId fourni par le formulaire (fiche réellement créée/retrouvée) → prioritaire.
      let clientId: string | null = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
      if (!clientId) {
        const { data: pr } = await supabase.from("prospects").select("prenom, nom, email, tel").eq("id", id).limit(1);
        clientId = pr?.[0] ? await findClientForProspect(pr[0]) : null;
      }
      if (clientId) devisTransferes = await transferDevisExternes(id, clientId);
    } catch (e) { console.error("[prospects] transfert devis externes :", e); }
  }
  return NextResponse.json({ success: true, devisTransferes });
}

// ─── DELETE — supprimer un prospect ───────────────────────────────────────────
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const { error } = await supabase.from("prospects").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ─── POST — convertir en client ───────────────────────────────────────────────
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
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

  // Copie les devis externes du prospect sur la fiche du client (best effort).
  try {
    const { data: pre } = await supabase.from("prestations").select("client_id").eq("id", prestationId).limit(1);
    const clientId = pre?.[0]?.client_id as string | undefined;
    if (clientId) await transferDevisExternes(id, clientId);
  } catch (e) { console.error("[prospects] transfert devis externes :", e); }

  // Marque le prospect comme CONVERTI
  await supabase
    .from("prospects")
    .update({ statut: "CONVERTI", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ success: true, prestationId });
}
