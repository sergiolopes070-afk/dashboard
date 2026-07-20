import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import nodemailer from "nodemailer";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

async function getSetting(key: string, envFallback?: string): Promise<string | null> {
  if (envFallback) return envFallback;
  if (!supabase) return null;
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string) || null;
}

// ─── Email prestataire ────────────────────────────────────────────────────────

function buildPrestataireEmail(d: {
  prestataireName: string;
  clientName: string;
  clientTel: string;
  typePresta: string;
  prix: string;
  date: string;
  adresse: string;
}) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

        <!-- HEADER VERT -->
        <tr>
          <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px;text-align:center;">
            <div style="font-size:48px;line-height:1;margin-bottom:12px;">✅</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Paiement confirmé !</h1>
            <p style="margin:8px 0 0;color:#bbf7d0;font-size:13px;">Le client a réglé sa prestation en ligne</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#1e1e2e;padding:36px 40px 32px;">
            <p style="margin:0 0 20px;color:#a0a0b0;font-size:15px;line-height:1.6;">
              Bonjour <strong style="color:#fff;">${d.prestataireName}</strong>,
            </p>
            <p style="margin:0 0 28px;color:#a0a0b0;font-size:14px;line-height:1.7;">
              Bonne nouvelle 🎉 Le client <strong style="color:#fff;">${d.clientName}</strong> vient de régler
              sa prestation en ligne. Vous pouvez procéder à l'intervention selon les informations ci-dessous.
            </p>

            <!-- RECAP TABLE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;">
              <thead>
                <tr>
                  <th colspan="2" style="background:#16a34a;color:#fff;font-size:13px;font-weight:700;text-align:left;padding:12px 16px;">
                    Détails de la mission
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom:1px solid #2a2a3e;">
                  <td style="padding:12px 16px;color:#a0a0b0;font-size:13px;width:140px;background:#252535;">Prestation</td>
                  <td style="padding:12px 16px;color:#fff;font-size:14px;font-weight:600;background:#252535;">${d.typePresta}</td>
                </tr>
                <tr style="border-bottom:1px solid #2a2a3e;">
                  <td style="padding:12px 16px;color:#a0a0b0;font-size:13px;background:#1e1e2e;">Montant réglé</td>
                  <td style="padding:12px 16px;color:#22c55e;font-size:15px;font-weight:700;background:#1e1e2e;">${d.prix} €</td>
                </tr>
                <tr style="border-bottom:1px solid #2a2a3e;">
                  <td style="padding:12px 16px;color:#a0a0b0;font-size:13px;background:#252535;">Client</td>
                  <td style="padding:12px 16px;color:#fff;font-size:13px;background:#252535;">${d.clientName}${d.clientTel ? ` · ${d.clientTel}` : ""}</td>
                </tr>
                <tr style="border-bottom:1px solid #2a2a3e;">
                  <td style="padding:12px 16px;color:#a0a0b0;font-size:13px;background:#1e1e2e;">Date</td>
                  <td style="padding:12px 16px;color:#fff;font-size:13px;background:#1e1e2e;">${d.date}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;color:#a0a0b0;font-size:13px;background:#252535;">Adresse</td>
                  <td style="padding:12px 16px;color:#fff;font-size:13px;background:#252535;">${d.adresse || "—"}</td>
                </tr>
              </tbody>
            </table>

            <hr style="border:none;border-top:1px solid #2a3694;margin:28px 0;"/>
            <p style="margin:0;color:#a0a0b0;font-size:13px;text-align:center;">
              KinouClean · Tél. 06 20 79 97 47 · 200 Rue de la Croix Nivert, 75015 Paris
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig     = req.headers.get("stripe-signature");

  const secretKey = await getSetting("stripe_secret_key", process.env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe non configuré" }, { status: 400 });
  }

  const stripe        = new Stripe(secretKey, { apiVersion: "2026-02-25.clover" });
  const webhookSecret = await getSetting("stripe_webhook_secret", process.env.STRIPE_WEBHOOK_SECRET);

  // SÉCURITÉ : la signature Stripe est OBLIGATOIRE. Sans elle, n'importe qui
  // pourrait poster un faux « paiement confirmé » et marquer une prestation payée.
  // On refuse donc explicitement au lieu d'accepter un événement non vérifié.
  if (!webhookSecret) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET manquant — appel refusé.");
    return NextResponse.json(
      { error: "Webhook non configuré (secret de signature manquant)." },
      { status: 503 },
    );
  }
  if (!sig) {
    return NextResponse.json({ error: "Signature Stripe absente" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature invalide:", err);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  // ── Paiement confirmé ─────────────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session     = event.data.object as Stripe.Checkout.Session;
    const prestationId = session.metadata?.prestation_id;

    if (!prestationId || !supabase) {
      return NextResponse.json({ received: true });
    }

    // 1. Marquer la prestation PAYÉE
    await supabase
      .from("prestations")
      .update({ statut: "PAYÉ" })
      .eq("id", prestationId);

    // 2. Récupérer les infos complètes
    const { data: row } = await supabase
      .from("prestations")
      .select("type_prestation, prix, date_intervention, adresse, clients(*), prestataires(*)")
      .eq("id", prestationId)
      .single();

    if (!row) return NextResponse.json({ received: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client      = (row.clients      || {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prestataire = (row.prestataires || {}) as Record<string, any>;

    if (!prestataire.email) return NextResponse.json({ received: true });

    const clientName = `${client.prenom || ""} ${client.nom || ""}`.trim();
    const dateStr    = row.date_intervention
      ? new Date(row.date_intervention).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      : "Date à confirmer";

    const subject = `✅ Paiement reçu – ${clientName} – ${row.type_prestation}`;
    const html    = buildPrestataireEmail({
      prestataireName : prestataire.nom || "Prestataire",
      clientName,
      clientTel       : client.tel || "",
      typePresta      : row.type_prestation || "",
      prix            : row.prix != null ? String(row.prix) : "—",
      date            : dateStr,
      adresse         : row.adresse || "",
    });

    // 3. Envoyer l'email (Gmail > Resend)
    const gmailUser = await getSetting("gmail_user", process.env.GMAIL_USER);
    const gmailPass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);

    if (gmailUser && gmailPass) {
      const transport = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
      await transport.sendMail({ from: `"KinouClean" <${gmailUser}>`, to: prestataire.email, subject, html });
    } else if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from   : process.env.RESEND_FROM || "KinouClean <noreply@kinouclean.fr>",
        to     : prestataire.email,
        subject,
        html,
      });
    }
  }

  return NextResponse.json({ received: true });
}
