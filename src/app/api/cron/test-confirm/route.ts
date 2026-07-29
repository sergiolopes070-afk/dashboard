import { NextResponse } from "next/server";
import { sendConfirmationEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

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
  // rdv=0 pour la version "demande enregistrée" (sans date)
  const avecRdv = url.searchParams.get("rdv") !== "0";
  try {
    const ok = await sendConfirmationEmail(to, {
      prenom: "Camille", typePresta: "Nettoyage canapé", quantite: "Canapé 3-4 places",
      adresse: "12 rue de Paris, 75015 Paris",
      date: avecRdv ? "30/07/2026" : "", heure: avecRdv ? "10:00" : "", prix: "189",
    });
    return NextResponse.json({ envoye: ok, to, version: avecRdv ? "RDV confirmé" : "demande enregistrée" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erreur" }, { status: 500 });
  }
}
