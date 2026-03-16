import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RESEND_FROM || "KinouClean <noreply@kinouclean.fr>";

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
              <table cellpadding="0" cellspacing="0" style="display:inline-block;background:#1a1a2e;border-radius:10px;padding:14px 28px;">
                <tr>
                  <td style="color:#4a7fd4;font-size:20px;font-weight:bold;letter-spacing:1px;">
                    🧹 Kinouclean
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
                    <div style="color:#4a7fd4;font-size:13px;font-weight:bold;">🧹 Kinouclean</div>
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
    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY non configuré – email non envoyé");
      return NextResponse.json({ skipped: true });
    }

    const html = buildEmailHtml({ prenom: prenom || "Client", typePresta, quantite, adresse, date, heure, prix });

    const result = await resend.emails.send({
      from   : FROM,
      to     : email,
      subject: "✅ Confirmation de votre demande – KinouClean",
      html,
    });

    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
