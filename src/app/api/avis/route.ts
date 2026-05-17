import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const OWNER_EMAIL = "kinouclean@gmail.com";
const FROM_NAME = "KinouClean";

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

function buildAvisEmailHtml(clientName: string, prestation: string, rating: number, comment: string) {
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><title>Avis client – KinouClean</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
          <tr>
            <td style="background:#2a3694;padding:28px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="display:inline-block;background:#1a1a2e;border-radius:10px;padding:14px 28px;">
                <tr>
                  <td align="center">
                    <img src="https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f" alt="KinouClean" width="140" style="display:block;" />
                    <p style="margin:6px 0 0;color:#4a7fd4;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Avis client confidentiel</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#1e1e2e;padding:36px 40px;">
              <h2 style="margin:0 0 8px;color:#f87171;font-size:22px;">Nouvel avis négatif reçu</h2>
              <p style="margin:0 0 24px;color:#a0a0b0;font-size:14px;">Ce retour est confidentiel — il n'a pas été publié.</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;">
                <tr>
                  <td style="background:#252535;padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;width:40%;">Client</td>
                  <td style="background:#252535;padding:14px 16px;color:#d0d0e0;font-size:14px;">${clientName}</td>
                </tr>
                ${prestation ? `<tr>
                  <td style="background:#1e1e2e;padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;border-top:1px solid #2a2a3e;">Prestation</td>
                  <td style="background:#1e1e2e;padding:14px 16px;color:#d0d0e0;font-size:14px;border-top:1px solid #2a2a3e;">${prestation}</td>
                </tr>` : ""}
                <tr>
                  <td style="background:#252535;padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;border-top:1px solid #2a2a3e;">Note</td>
                  <td style="background:#252535;padding:14px 16px;color:#fbbf24;font-size:18px;border-top:1px solid #2a2a3e;">${stars} (${rating}/5)</td>
                </tr>
                <tr>
                  <td style="background:#1e1e2e;padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;border-top:1px solid #2a2a3e;vertical-align:top;">Commentaire</td>
                  <td style="background:#1e1e2e;padding:14px 16px;color:#d0d0e0;font-size:14px;border-top:1px solid #2a2a3e;">${comment || "<em style='color:#666'>Aucun commentaire</em>"}</td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #2a3694;margin:28px 0;" />
              <p style="margin:0;color:#4a7fd4;font-size:13px;font-weight:600;">KinouClean — Avis interne automatique</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(req: Request) {
  try {
    const { clientName, prestation, rating, comment } = await req.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Note invalide" }, { status: 400 });
    }

    // 4-5 étoiles → frontend gère la redirection Google
    if (rating >= 4) {
      return NextResponse.json({ success: true, action: "redirect" });
    }

    // 1-3 étoiles → email confidentiel vers le propriétaire
    const html = buildAvisEmailHtml(clientName || "Inconnu", prestation || "", rating, comment || "");
    const subject = `⚠️ Avis ${rating}/5 – ${clientName || "Client inconnu"}`;

    const gmailResult = await getGmailTransporter();
    if (gmailResult) {
      await gmailResult.transporter.sendMail({
        from: `"${FROM_NAME}" <${gmailResult.user}>`,
        to: OWNER_EMAIL,
        subject,
        html,
      });
      return NextResponse.json({ success: true, via: "gmail" });
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn("Aucun service email configuré pour les avis");
      return NextResponse.json({ success: true, skipped: true });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM || `KinouClean <noreply@kinouclean.fr>`,
      to: OWNER_EMAIL,
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
