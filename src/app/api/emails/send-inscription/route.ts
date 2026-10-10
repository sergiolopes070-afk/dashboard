import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { sendInscriptionAvanceEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Envoi MANUEL d'un rappel d'inscription à l'avance immédiate (sans détails de RDV).
// Invite le client à finaliser son inscription via son lien personnel déjà reçu.
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { prestationId } = await req.json() as { prestationId?: string };
  if (!prestationId) return NextResponse.json({ error: "prestationId requis" }, { status: 400 });

  const { data: p, error } = await supabase
    .from("prestations")
    .select("id, clients(prenom, email)")
    .eq("id", prestationId)
    .single();
  if (error || !p) return NextResponse.json({ error: "Prestation introuvable" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
  const email = client.email as string | undefined;
  if (!email) return NextResponse.json({ error: "Ce client n'a pas d'adresse email." }, { status: 400 });

  try {
    const ok = await sendInscriptionAvanceEmail(email, { prenom: client.prenom || "" });
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });
    return NextResponse.json({ success: true, email });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur d'envoi" }, { status: 500 });
  }
}
