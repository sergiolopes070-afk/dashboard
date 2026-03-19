import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FROM_NAME = "KinouClean";

/** Lit un setting depuis Supabase (fallback si env var absente) */
async function getSetting(key: string, envFallback?: string): Promise<string | null> {
  if (envFallback) return envFallback;
  if (!supabase) return null;
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) || null;
}

/** Crée un transporteur Gmail SMTP (env vars ou Supabase settings) */
async function getGmailTransporter() {
  const user = await getSetting("gmail_user", process.env.GMAIL_USER);
  const pass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) return null;
  return { transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }), user };
}

function buildEmailHtml(data: {
  prenom    : string;
  typePresta: string;
  quantite  : string;
  adresse   : string;
  date      : string;
  heure     : string;
  prix      : string;
}) {
  const { prenom, typePresta, quantite, adresse, date, heure, prix } = data;
  const prestation = [typePresta, quantite ? `(x${quantite})` : ""].filter(Boolean).join(" ");
  const dateStr    = [date, heure].filter(Boolean).join(" à ");
  const prixStr    = prix ? `${prix} €` : "—";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmation de prestation – KinouClean</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

          <!-- HEADER -->
          <tr>
            <td style="background:#2a3694;padding:36px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="display:inline-block;background:#1a1a2e;border-radius:10px;padding:16px 32px;">
                <tr>
                  <td align="center">
                    <img
                      src="https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f"
                      alt="KinouClean"
                      width="160"
                      style="display:block;max-width:160px;height:auto;"
                    />
                    <p style="margin:8px 0 0;color:#4a7fd4;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">
                      Service de nettoyage professionnel
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#1e1e2e;padding:40px 40px 32px;">

              <h2 style="margin:0 0 16px;color:#4a7fd4;font-size:26px;font-weight:700;">
                Bonjour ${prenom},
              </h2>

              <p style="margin:0 0 28px;color:#a0a0b0;font-size:15px;line-height:1.6;">
                Merci pour votre demande de prestation. Nous l'avons bien reçue et reviendrons
                vers vous rapidement pour confirmer les détails.
              </p>

              <!-- TABLE RECAP -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr>
                    <th style="background:#2a3694;color:#ffffff;font-size:13px;font-weight:700;text-align:left;padding:12px 16px;width:40%;">Détail</th>
                    <th style="background:#2a3694;color:#ffffff;font-size:13px;font-weight:700;text-align:left;padding:12px 16px;">Information</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid #2a2a3e;">
                    <td style="padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;background:#252535;">Prestation</td>
                    <td style="padding:14px 16px;color:#d0d0e0;font-size:14px;background:#252535;">${prestation || "—"}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #2a2a3e;">
                    <td style="padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;background:#1e1e2e;">Adresse</td>
                    <td style="padding:14px 16px;color:#d0d0e0;font-size:14px;background:#1e1e2e;">${adresse || "—"}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #2a2a3e;">
                    <td style="padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;background:#252535;">Date souhaitée</td>
                    <td style="padding:14px 16px;color:#d0d0e0;font-size:14px;background:#252535;">${dateStr || "—"}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;background:#1e1e2e;">Prix estimé</td>
                    <td style="padding:14px 16px;color:#ffffff;font-weight:700;font-size:14px;background:#1e1e2e;">${prixStr}</td>
                  </tr>
                </tbody>
              </table>

              <p style="margin:28px 0 0;color:#a0a0b0;font-size:14px;">
                Pour toute question, n'hésitez pas à nous contacter.
              </p>

              <!-- SEPARATOR -->
              <hr style="border:none;border-top:1px solid #2a3694;margin:32px 0;" />

              <!-- SIGNATURE -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:20px;vertical-align:middle;">
                    <img
                      src="https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f"
                      alt="KinouClean"
                      width="80"
                      style="display:block;max-width:80px;height:auto;"
                    />
                  </td>
                  <td style="border-left:3px solid #2a3694;padding-left:20px;vertical-align:middle;">
                    <p style="margin:0;color:#ffffff;font-weight:700;font-size:14px;">Gomes Lopes Sergio</p>
                    <p style="margin:2px 0 8px;color:#4a7fd4;font-size:13px;font-weight:600;">KinouClean</p>
                    <p style="margin:0;color:#a0a0b0;font-size:13px;">Tél. : 01 70 25 39 85</p>
                    <p style="margin:2px 0;color:#a0a0b0;font-size:13px;">200 Rue de la Croix Nivert, 75015 Paris</p>
                    <p style="margin:2px 0;color:#a0a0b0;font-size:13px;">Île-de-France</p>
                  </td>
                </tr>
              </table>

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
    const body = await req.json();
    const { email, prenom, typePresta, quantite, adresse, date, heure, prix } = body;

    if (!email) {
      return NextResponse.json({ error: "Email requis" }, { status: 400 });
    }

    const html    = buildEmailHtml({ prenom: prenom || "Client", typePresta, quantite, adresse, date, heure, prix });
    const subject = "✅ Confirmation de votre demande – KinouClean";

    // ── Priorité 1 : Gmail SMTP ──────────────────────────────────────────────
    const gmailResult = await getGmailTransporter();
    if (gmailResult) {
      await gmailResult.transporter.sendMail({
        from   : `"${FROM_NAME}" <${gmailResult.user}>`,
        to     : email,
        subject,
        html,
      });
      return NextResponse.json({ success: true, via: "gmail" });
    }

    // ── Priorité 2 : Resend (fallback) ───────────────────────────────────────
    if (!process.env.RESEND_API_KEY) {
      console.warn("Aucun service email configuré (GMAIL_USER ou RESEND_API_KEY manquant)");
      return NextResponse.json({ skipped: true });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from   : process.env.RESEND_FROM || `KinouClean <noreply@kinouclean.fr>`,
      to     : email,
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
