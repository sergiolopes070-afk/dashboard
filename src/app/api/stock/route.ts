import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { rowToItem } from "@/lib/stockItem";

export const dynamic = "force-dynamic";

/*
  SQL à exécuter une seule fois dans Supabase → SQL Editor :

  CREATE TABLE IF NOT EXISTS stock_items (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    nom           TEXT NOT NULL,
    categorie     TEXT DEFAULT 'Matériel',
    unite         TEXT DEFAULT 'unité',
    quantite      NUMERIC DEFAULT 0,
    seuil         NUMERIC DEFAULT 0,
    prix_unitaire NUMERIC,
    notes         TEXT,
    historique    JSONB DEFAULT '[]'::jsonb,
    conso         JSONB DEFAULT '{}'::jsonb
  );
  -- conso = dose consommée par type de prestation, ex. {"Lavage véhicule": 0.15}
  -- → à la clôture d'un RDV, le produit se décrémente automatiquement.
*/

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json([]);
  const { data, error } = await supabase
    .from("stock_items")
    .select("*")
    .order("nom", { ascending: true });
  if (error) {
    // Table pas encore créée → la page affiche le SQL à exécuter.
    if (error.code === "42P01") return NextResponse.json({ needsSetup: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((data || []).map(rowToItem));
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const b = await req.json();
  if (!b.nom || !String(b.nom).trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });

  const { data, error } = await supabase
    .from("stock_items")
    .insert({
      nom          : String(b.nom).trim(),
      categorie    : b.categorie || "Matériel",
      unite        : b.unite || "unité",
      quantite     : Number(b.quantite) || 0,
      seuil        : Number(b.seuil) || 0,
      prix_unitaire: b.prixUnitaire != null && b.prixUnitaire !== "" ? Number(b.prixUnitaire) : null,
      notes        : b.notes || null,
      historique   : [],
      conso        : (b.conso && typeof b.conso === "object") ? b.conso : {},
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ needsSetup: true }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(rowToItem(data));
}
