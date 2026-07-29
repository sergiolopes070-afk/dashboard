import { NextResponse } from "next/server";
import { sendConfirmationEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Envoi de DÉMONSTRATION de l'email de confirmation. Protégé par CRON_SECRET.
//   GET /api/cron/test-confirm?key=<secret>[&to=email]
function secret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) if (/^cron_?secret$/i.test(k) && v) return v;
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = secret();
  if (!s || url.searchParams.get("key") !== s) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const to = url.searchParams.get("to") || process.env.AUTH_EMAIL || "kinouclean@gmail.com";
  try {
    const ok = await sendConfirmationEmail(to, {
      prenom: "Camille", typePresta: "Nettoyage canapé", quantite: "Canapé 3-4 places",
      adresse: "12 rue de Paris, 75015 Paris", date: "30/07/2026", heure: "10:00", prix: "189",
    });
    return NextResponse.json({ envoye: ok, to, note: ok ? "OK" : "Gmail non connecté" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erreur" }, { status: 500 });
  }
}
