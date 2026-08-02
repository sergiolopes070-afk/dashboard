import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";

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
    historique    JSONB DEFAULT '[]'::jsonb
  );
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToItem(r: Record<string, any>) {
  return {
    id           : r.id            as string,
    createdAt    : r.created_at    as string,
    nom          : r.nom           || "",
    categorie    : r.categorie     || "Matériel",
    unite        : r.unite         || "unité",
    quantite     : Number(r.quantite ?? 0),
    seuil        : Number(r.seuil ?? 0),
    prixUnitaire : r.prix_unitaire != null ? Number(r.prix_unitaire) : null,
    notes        : r.notes         || "",
    historique   : Array.isArray(r.historique) ? r.historique : [],
  };
}

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
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ needsSetup: true }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(rowToItem(data));
}
