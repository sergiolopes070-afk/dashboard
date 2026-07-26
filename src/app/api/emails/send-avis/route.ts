import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getGmailTransporter, buildAvisHtml, AVIS_OBJET } from "@/lib/mailer";
import { getSettingRaw } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Envoie MANUELLEMENT la demande d'avis à un client (déclenché à l'archivage,
// après confirmation). Ne s'envoie jamais tout seul.

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  // Interrupteur global (Configuration) : demandes d'avis en pause → on n'envoie rien.
  if (await getSettingRaw("avis_actif") === "false") {
    return NextResponse.json({ paused: true, message: "Demandes d'avis en pause (Configuration)" });
  }

  const { prestationId } = await req.json() as { prestationId?: string };
  if (!prestationId) return NextResponse.json({ error: "prestationId requis" }, { status: 400 });

  const { data: p, error } = await supabase
    .from("prestations")
    .select("id, type_prestation, client_id, clients(id, prenom, nom, email)")
    .eq("id", prestationId)
    .single();

  if (error || !p) return NextResponse.json({ error: "Prestation introuvable" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
  const email    = client.email || null;
  const clientId = client.id || p.client_id;

  if (!email)    return NextResponse.json({ error: "Ce client n'a pas d'adresse email" }, { status: 400 });
  if (!clientId) return NextResponse.json({ error: "Client introuvable" }, { status: 400 });

  const gmail = await getGmailTransporter();
  if (!gmail) {
    return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)" }, { status: 503 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  const lienParams = new URLSearchParams({ nom: `${client.prenom || ""} ${client.nom || ""}`.trim() });
  if (p.type_prestation) lienParams.set("prestation", p.type_prestation);
  const lienBase = `${baseUrl}/avis/${clientId}?${lienParams.toString()}`;

  try {
    await gmail.transporter.sendMail({
      from   : `"KinouClean" <${gmail.user}>`,
      to     : email,
      subject: AVIS_OBJET,
      html   : buildAvisHtml({ prenom: client.prenom || "", typePresta: p.type_prestation || "", lienBase }),
    });
    return NextResponse.json({ success: true, email });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur d'envoi" }, { status: 500 });
  }
}
