import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import nodemailer from "nodemailer";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Envoie MANUELLEMENT la demande d'avis à un client (déclenché à l'archivage,
// après confirmation). Ne s'envoie jamais tout seul.

async function getSetting(key: string, envFallback?: string): Promise<string | null> {
  if (envFallback) return envFallback;
  if (!supabase) return null;
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) || null;
}

async function getGmailTransporter() {
  const user = await getSetting("gmail_user", process.env.GMAIL_USER);
  const pass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) return null;
  return { transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }), user };
}

function buildAvisHtml(d: { prenom: string; typePresta: string; lien: string }): string {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#1C3557;padding:28px 32px;">
          <div style="color:#ffffff;font-size:20px;font-weight:bold;">KinouClean</div>
          <div style="color:rgba(255,255,255,0.6);font-size:11px;letter-spacing:2px;margin-top:4px;">NETTOYAGE PROFESSIONNEL À DOMICILE</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;color:#1F2937;margin:0 0 16px;">Bonjour ${d.prenom || ""},</p>
          <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 20px;">
            Merci de votre confiance pour votre prestation${d.typePresta ? ` de ${d.typePresta.toLowerCase()}` : ""} ✨.
            Votre satisfaction est notre priorité — auriez-vous un instant pour partager votre avis ?
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
            <a href="${d.lien}" style="display:inline-block;background:#F97316;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:10px;">⭐ Laisser mon avis</a>
          </td></tr></table>
          <p style="font-size:13px;color:#9CA3AF;line-height:1.6;margin:0 0 20px;text-align:center;">Cela ne prend qu'une minute et nous aide énormément 🙏</p>
          <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0;">À très bientôt,<br/><strong>L'équipe KinouClean</strong></p>
        </td></tr>
        <tr><td style="background:#1C3557;padding:16px 32px;text-align:center;">
          <div style="color:rgba(255,255,255,0.6);font-size:11px;">KinouClean · Organisme agréé SAP n° D3289580</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

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
  const lien = `${baseUrl}/avis/${clientId}?${lienParams.toString()}`;

  try {
    await gmail.transporter.sendMail({
      from   : `"KinouClean" <${gmail.user}>`,
      to     : email,
      subject: "Votre avis compte pour nous ⭐",
      html   : buildAvisHtml({ prenom: client.prenom || "", typePresta: p.type_prestation || "", lien }),
    });
    return NextResponse.json({ success: true, email });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur d'envoi" }, { status: 500 });
  }
}
