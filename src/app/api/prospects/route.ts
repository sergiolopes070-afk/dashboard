import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/*
  SQL à exécuter une seule fois dans Supabase → SQL Editor :

  CREATE TABLE IF NOT EXISTS prospects (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    prenom       TEXT NOT NULL,
    nom          TEXT NOT NULL,
    tel          TEXT,
    email        TEXT,
    source       TEXT,
    type_presta  TEXT,
    adresse      TEXT,
    budget       TEXT,
    statut       TEXT DEFAULT 'NOUVEAU',
    date_relance DATE,
    notes        TEXT,
    commentaires JSONB DEFAULT '[]'::jsonb
  );
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProspect(r: Record<string, any>) {
  return {
    id          : r.id          as string,
    createdAt   : r.created_at  as string,
    updatedAt   : r.updated_at  as string,
    prenom      : r.prenom      || "",
    nom         : r.nom         || "",
    tel         : r.tel         || "",
    email       : r.email       || "",
    source      : r.source      || "",
    typePresta  : r.type_presta || "",
    adresse     : r.adresse     || "",
    budget      : r.budget      || "",
    statut      : r.statut      || "NOUVEAU",
    dateRelance : r.date_relance || "",
    notes       : r.notes       || "",
    commentaires: Array.isArray(r.commentaires) ? r.commentaires : [],
  };
}

export async function GET() {
  if (!supabase) return NextResponse.json([]);
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data || []).map(rowToProspect));
}

export async function POST(req: Request) {
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const body = await req.json();
  const { prenom, nom, tel, email, source, typePresta, adresse, budget, notes } = body;
  if (!prenom || !nom) return NextResponse.json({ error: "Prénom et nom requis" }, { status: 400 });

  const { data, error } = await supabase
    .from("prospects")
    .insert({
      prenom, nom,
      tel        : tel        || null,
      email      : email      || null,
      source     : source     || null,
      type_presta: typePresta || null,
      adresse    : adresse    || null,
      budget     : budget     || null,
      notes      : notes      || null,
      statut     : "NOUVEAU",
      commentaires: [],
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(rowToProspect(data));
}
