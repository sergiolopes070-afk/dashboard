import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const DEST_EMAIL = "kinouclean@gmail.com";

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

function buildAvisHtml(data: {
  clientName: string;
  prestation: string;
  rating: number;
  comment: string;
}) {
  const { clientName, prestation, rating, comment } = data;
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.6);">
        <tr>
          <td style="background:#2a3694;padding:28px 32px;text-align:center;">
            <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">⚠️ Avis ${rating}/5 reçu</p>
            <p style="margin:6px 0 0;color:#a0b0ff;font-size:14px;">KinouClean — Avis client</p>
          </td>
        </tr>
        <tr>
          <td style="background:#1e1e2e;padding:32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:12px 16px;background:#252535;border-radius:10px;margin-bottom:12px;">
                  <p style="margin:0;color:#a0a0b0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Client</p>
                  <p style="margin:4px 0 0;color:#fff;font-size:16px;font-weight:700;">${clientName}</p>
                </td>
              </tr>
              <tr><td style="height:10px;"></td></tr>
              <tr>
                <td style="padding:12px 16px;background:#252535;border-radius:10px;">
                  <p style="margin:0;color:#a0a0b0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Prestation</p>
                  <p style="margin:4px 0 0;color:#fff;font-size:15px;">${prestation || "—"}</p>
                </td>
              </tr>
              <tr><td style="height:10px;"></td></tr>
              <tr>
                <td style="padding:12px 16px;background:#252535;border-radius:10px;text-align:center;">
                  <p style="margin:0;color:#a0a0b0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Note</p>
                  <p style="margin:8px 0 0;color:#f59e0b;font-size:32px;letter-spacing:4px;">${stars}</p>
                  <p style="margin:4px 0 0;color:#fff;font-weight:700;font-size:18px;">${rating} / 5</p>
                </td>
              </tr>
              ${comment ? `
              <tr><td style="height:10px;"></td></tr>
              <tr>
                <td style="padding:16px;background:#13131f;border-radius:10px;border-left:3px solid #2a3694;">
                  <p style="margin:0;color:#a0a0b0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Commentaire</p>
                  <p style="margin:8px 0 0;color:#d0d0e0;font-size:14px;line-height:1.6;">${comment.replace(/\n/g, "<br/>")}</p>
                </td>
              </tr>` : ""}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { clientId, clientName, prestation, rating, comment } = body as {
      clientId: string; clientName: string; prestation: string;
      rating: number; comment: string;
    };

    if (!rating) {
      return NextResponse.json({ error: "rating requis" }, { status: 400 });
    }

    // ≥ 4 étoiles → on redirige vers Google, pas d'email
    if (rating >= 4) {
      return NextResponse.json({ success: true, action: "redirect" });
    }

    // ≤ 3 étoiles → envoyer email à kinouclean@gmail.com
    const html    = buildAvisHtml({ clientName, prestation, rating, comment });
    const subject = `⚠️ Avis ${rating}/5 – ${clientName}`;

    // Priorité 1 : Gmail SMTP
    const gmailResult = await getGmailTransporter();
    if (gmailResult) {
      await gmailResult.transporter.sendMail({
        from   : `"KinouClean Avis" <${gmailResult.user}>`,
        to     : DEST_EMAIL,
        subject,
        html,
      });
      return NextResponse.json({ success: true, via: "gmail" });
    }

    // Priorité 2 : Resend
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ skipped: true });
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from   : process.env.RESEND_FROM || "KinouClean <noreply@kinouclean.fr>",
      to     : DEST_EMAIL,
      subject,
      html,
    });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ success: true, via: "resend" });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
