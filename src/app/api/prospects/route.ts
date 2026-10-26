import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getSettingJSON } from "@/lib/settings";
import { telCle, emailCle } from "@/lib/avanceMatch";

export const dynamic = "force-dynamic";

/*
  SQL à exécuter une seule fois dans Supabase → SQL Editor :

  CREATE TABLE IF NOT EXISTS prospects (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    genre        TEXT,
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
    genre       : r.genre       || "",
    prenom      : r.prenom      || "",
    nom         : r.nom         || "",
    tel         : r.tel         || "",
    email       : r.email       || "",
    source      : r.source      || "",
    typePresta  : r.type_presta || "",
    adresse     : r.adresse     || "",
    budget      : r.budget      || "",
    statut      : r.statut      || "NOUVEAU",
    dateRelance  : r.date_relance  || "",
    relanceSteps : r.relance_steps ? String(r.relance_steps).split(",").filter(Boolean) : [],
    notes        : r.notes        || "",
    commentaires : Array.isArray(r.commentaires) ? r.commentaires : [],
    besoins      : Array.isArray(r.besoins) ? r.besoins : [],
  };
}

// ─── Doublon prospect ↔ client ────────────────────────────────────────────────
// Un prospect dont l'email ou le téléphone (9 derniers chiffres) correspond à une
// fiche client existante → { id, nom } pour afficher « Déjà client : <nom> ».
type DejaClient = { id: string; nom: string } | null;
async function indexClients(): Promise<(p: { email?: string | null; tel?: string | null }) => DejaClient> {
  const vide = () => null;
  if (!supabase) return vide;
  const { data, error } = await supabase.from("clients").select("id, prenom, nom, email, tel")
    .order("created_at", { ascending: false });
  if (error || !data) return vide;
  const parEmail = new Map<string, DejaClient>();
  const parTel   = new Map<string, DejaClient>();
  for (const c of data) {
    const v = { id: c.id as string, nom: `${c.prenom || ""} ${c.nom || ""}`.trim() || "client" };
    const e = emailCle(c.email as string), t = telCle(c.tel as string);
    if (e && !parEmail.has(e)) parEmail.set(e, v);
    if (t.length === 9 && !parTel.has(t)) parTel.set(t, v);
  }
  return p => {
    const e = emailCle(p.email), t = telCle(p.tel);
    return (e && parEmail.get(e)) || (t.length === 9 && parTel.get(t)) || null;
  };
}

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json([]);
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const [suivi, dejaClientDe] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSettingJSON<Record<string, any>>("prospects_suivi", {}),
    indexClients().catch(() => () => null as DejaClient),
  ]);
  return NextResponse.json((data || []).map(r => ({
    ...rowToProspect(r), suivi: suivi[r.id as string] || {}, dejaClient: dejaClientDe(r),
  })));
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const body = await req.json();
  const { genre, prenom, nom, tel, email, source, typePresta, adresse, budget, notes, besoins } = body;
  if (!prenom) return NextResponse.json({ error: "Le prénom est requis" }, { status: 400 });

  const { data, error } = await supabase
    .from("prospects")
    .insert({
      genre      : genre      || null,
      prenom, nom : nom || "",
      tel        : tel        || null,
      email      : email      || null,
      source     : source     || null,
      type_presta: typePresta || null,
      adresse    : adresse    || null,
      budget     : budget     || null,
      notes      : notes      || null,
      besoins    : Array.isArray(besoins) ? besoins : [],
      statut     : "NOUVEAU",
      commentaires: [],
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Déjà client ? (même email / téléphone) → l'UI prévient « Déjà client : <nom> ».
  const dejaClient = await indexClients().then(f => f({ email, tel })).catch(() => null);
  return NextResponse.json({ ...rowToProspect(data), dejaClient });
}
