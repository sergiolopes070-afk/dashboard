import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { listDevis, saveDevis, sanitize, removeFile, parseKind, validId, type DevisExterne } from "./_store";

export const dynamic = "force-dynamic";

// Devis externes d'une fiche client / prospect (voir ./_store.ts pour le stockage).
//   GET    ?kind=client|prospect&id=<id>             → { devis }
//   POST   { kind, id, devis: {date, montant, intitule, statut, note, fichier} } → { devis, list }
//   PATCH  { kind, id, devisId, updates }             → { devis, list }
//   DELETE { kind, id, devisId }                      → { list } (supprime aussi la pièce jointe)

// Après une conversion, la fiche client et la fiche prospect pointent vers le MÊME
// fichier : on ne le supprime du bucket que s'il n'est pas partagé.
//   • côté client  : copie issue du prospect → le prospect la référence encore.
//   • côté prospect : prospect converti → le client en a (probablement) une copie.
async function fileIsExclusive(kind: "client" | "prospect", id: string, d: DevisExterne): Promise<boolean> {
  if (kind === "client") return d.origine !== "prospect";
  if (!supabase) return false;
  const { data } = await supabase.from("prospects").select("statut").eq("id", id).limit(1);
  return data?.[0]?.statut !== "CONVERTI";
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  const kind = parseKind(sp.get("kind"));
  const id = sp.get("id");
  if (!kind || !validId(id)) return badRequest("kind / id invalides");
  const list = await listDevis(kind, id);
  list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  return NextResponse.json({ devis: list });
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  const body = await req.json().catch(() => ({})) as { kind?: string; id?: string; devis?: Record<string, unknown> };
  const kind = parseKind(body.kind);
  if (!kind || !validId(body.id)) return badRequest("kind / id invalides");
  const devis = sanitize(body.devis || {});
  if (!devis.intitule && !devis.fichier) return badRequest("Indique au moins un intitulé ou joins le devis.");

  const list = await listDevis(kind, body.id);
  const next = [devis, ...list];
  const err = await saveDevis(kind, body.id, next);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ devis, list: next });
}

export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  const body = await req.json().catch(() => ({})) as { kind?: string; id?: string; devisId?: string; updates?: Record<string, unknown> };
  const kind = parseKind(body.kind);
  if (!kind || !validId(body.id) || !body.devisId) return badRequest("Paramètres manquants");

  const list = await listDevis(kind, body.id);
  const cur = list.find(d => d.id === body.devisId);
  if (!cur) return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });
  const updated = sanitize(body.updates || {}, cur);
  // Pièce jointe remplacée ou retirée → on supprime l'ancien fichier.
  if (cur.fichier && cur.fichier.path !== updated.fichier?.path && await fileIsExclusive(kind, body.id, cur)) await removeFile(cur.fichier.path);
  const next = list.map(d => (d.id === cur.id ? updated : d));
  const err = await saveDevis(kind, body.id, next);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ devis: updated, list: next });
}

export async function DELETE(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  const body = await req.json().catch(() => ({})) as { kind?: string; id?: string; devisId?: string };
  const kind = parseKind(body.kind);
  if (!kind || !validId(body.id) || !body.devisId) return badRequest("Paramètres manquants");

  const list = await listDevis(kind, body.id);
  const cur = list.find(d => d.id === body.devisId);
  if (!cur) return NextResponse.json({ list });
  const next = list.filter(d => d.id !== cur.id);
  const err = await saveDevis(kind, body.id, next);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  if (cur.fichier && await fileIsExclusive(kind, body.id, cur)) await removeFile(cur.fichier.path);
  return NextResponse.json({ list: next });
}
