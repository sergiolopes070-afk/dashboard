import { NextResponse } from "next/server";
import { getGmailTransporter, buildAvisHtml, AVIS_OBJET } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// TEMPORAIRE : envoie l'email de demande d'avis (nouvelle version étoiles vides)
// à une adresse de test. Protégé par ?key=<CRON_SECRET>.
function getSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) if (/^cron_?secret$/i.test(k) && v) return v;
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = getSecret();
  if (!secret || url.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const to = url.searchParams.get("to") || "kinouclean@gmail.com";
  const gmail = await getGmailTransporter();
  if (!gmail) return NextResponse.json({ error: "Gmail non connecté" }, { status: 503 });

  const base = process.env.NEXT_PUBLIC_BASE_URL || url.origin;
  const lienBase = `${base}/avis/general?nom=${encodeURIComponent("Client Test")}&prestation=${encodeURIComponent("Nettoyage de canapé")}`;

  try {
    await gmail.transporter.sendMail({
      from: `"KinouClean" <${gmail.user}>`, to,
      subject: AVIS_OBJET,
      html: buildAvisHtml({ prenom: "Client Test", typePresta: "Nettoyage de canapé", lienBase }),
    });
    return NextResponse.json({ envoye: true, to });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur d'envoi" }, { status: 500 });
  }
}
