import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { rowToItem } from "../route";

export const dynamic = "force-dynamic";

// PATCH : soit une édition de champs { updates: {...} }, soit un mouvement de
// stock { mouvement: { type: 'entree'|'sortie', quantite, motif } } qui ajuste la
// quantité et journalise l'opération dans `historique`.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const id = params.id;
  const body = await req.json();

  // ── Mouvement de stock ────────────────────────────────────────────────────
  if (body.mouvement) {
    const { type, quantite, motif } = body.mouvement as { type: string; quantite: number; motif?: string };
    const q = Number(quantite);
    if (!["entree", "sortie"].includes(type) || !(q > 0)) {
      return NextResponse.json({ error: "Mouvement invalide" }, { status: 400 });
    }
    const { data: cur, error: e1 } = await supabase.from("stock_items").select("quantite, historique").eq("id", id).single();
    if (e1 || !cur) return NextResponse.json({ error: "Article introuvable" }, { status: 404 });

    const avant = Number(cur.quantite ?? 0);
    const apres = type === "entree" ? avant + q : Math.max(0, avant - q);
    const hist = Array.isArray(cur.historique) ? cur.historique : [];
    const entry = { date: new Date().toISOString(), type, quantite: q, motif: motif || "", avant, apres };
    const historique = [entry, ...hist].slice(0, 50); // on garde les 50 derniers mouvements

    const { data, error } = await supabase
      .from("stock_items")
      .update({ quantite: apres, historique, updated_at: new Date().toISOString() })
      .eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(rowToItem(data));
  }

  // ── Édition de champs ─────────────────────────────────────────────────────
  const u = body.updates || body;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (u.nom !== undefined)          patch.nom = String(u.nom).trim();
  if (u.categorie !== undefined)    patch.categorie = u.categorie;
  if (u.unite !== undefined)        patch.unite = u.unite;
  if (u.quantite !== undefined)     patch.quantite = Number(u.quantite) || 0;
  if (u.seuil !== undefined)        patch.seuil = Number(u.seuil) || 0;
  if (u.prixUnitaire !== undefined) patch.prix_unitaire = u.prixUnitaire !== "" && u.prixUnitaire != null ? Number(u.prixUnitaire) : null;
  if (u.notes !== undefined)        patch.notes = u.notes || null;
  if (u.conso !== undefined)        patch.conso = (u.conso && typeof u.conso === "object") ? u.conso : {};

  const { data, error } = await supabase.from("stock_items").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(rowToItem(data));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const { error } = await supabase.from("stock_items").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
