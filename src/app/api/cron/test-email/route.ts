import { NextResponse } from "next/server";
import {
  getGmailTransporter,
  buildAvisHtml, AVIS_OBJET,
  buildBesoinInfosHtml, BESOIN_INFOS_OBJET,
  buildRelanceHtml, ACCROCHE,
} from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Envoi d'un email de DÉMONSTRATION vers l'adresse de l'équipe (AUTH_EMAIL),
// pour visualiser le rendu réel. Aucun client contacté. Protégé par CRON_SECRET.
//   GET /api/cron/test-email?key=<secret>&type=avis|besoin_infos|relance
function getSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) {
    if (/^cron_?secret$/i.test(k) && v) return v;
  }
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const type = url.searchParams.get("type") || "avis";
  const secret = getSecret();
  if (!secret || key !== secret) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const gmail = await getGmailTransporter();
  if (!gmail) return NextResponse.json({ error: "Gmail non connecté" }, { status: 503 });
  const dest = process.env.AUTH_EMAIL || gmail.user;

  const prenom = "Camille";
  const typePresta = "Nettoyage canapé";
  let subject = "";
  let html = "";

  if (type === "besoin_infos") {
    subject = "[DÉMO] " + BESOIN_INFOS_OBJET;
    html = buildBesoinInfosHtml({ prenom, typePresta });
  } else if (type === "relance") {
    subject = "[DÉMO] " + ACCROCHE[1].objet;
    html = buildRelanceHtml({ prenom, typePresta, prix: "189", niveau: 1, fiscal: "avance" });
  } else {
    // avis : lien de démonstration (les étoiles pointent vers une page /avis fictive)
    const lienBase = `${url.origin}/avis/demo?nom=${encodeURIComponent(prenom)}&prestation=${encodeURIComponent(typePresta)}`;
    subject = "[DÉMO] " + AVIS_OBJET;
    html = buildAvisHtml({ prenom, typePresta, lienBase });
  }

  try {
    await gmail.transporter.sendMail({ from: `"KinouClean" <${gmail.user}>`, to: dest, subject, html });
    return NextResponse.json({ success: true, type, envoyeA: dest });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur d'envoi" }, { status: 500 });
  }
}
