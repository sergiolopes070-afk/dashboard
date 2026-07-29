import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { sendConfirmationEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Envoi MANUEL du récapitulatif de confirmation depuis le dashboard (agenda /
// prestations). Reprend exactement le mail envoyé à la création : selon qu'un
// RDV est calé ou non, l'objet et le texte s'adaptent (géré dans le mailer).

// yyyy-mm-dd → dd/mm/yyyy (le mailer affiche la date telle quelle).
function isoToFr(d: string | null): string {
  if (!d) return "";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { prestationId } = await req.json() as { prestationId?: string };
  if (!prestationId) return NextResponse.json({ error: "prestationId requis" }, { status: 400 });

  const { data: p, error } = await supabase
    .from("prestations")
    .select("id, type_prestation, quantite, adresse, date_intervention, heure_intervention, prix, clients(prenom, email)")
    .eq("id", prestationId)
    .single();
  if (error || !p) return NextResponse.json({ error: "Prestation introuvable" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
  const email = client.email as string | undefined;
  if (!email) return NextResponse.json({ error: "Ce client n'a pas d'adresse email." }, { status: 400 });

  try {
    const ok = await sendConfirmationEmail(email, {
      prenom     : client.prenom || "",
      typePresta : p.type_prestation || "",
      quantite   : String(p.quantite ?? ""),
      adresse    : p.adresse || "",
      date       : isoToFr(p.date_intervention as string | null),
      heure      : ((p.heure_intervention as string) || "").substring(0, 5),
      prix       : p.prix != null ? String(p.prix) : "",
    });
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });
    return NextResponse.json({ success: true, email });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur d'envoi" }, { status: 500 });
  }
}
