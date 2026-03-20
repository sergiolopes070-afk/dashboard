import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Récupère la clé secrète Stripe depuis les env vars ou les settings Supabase */
async function getStripeKey(): Promise<string | null> {
  // Priorité 1 : variable d'environnement
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;

  // Priorité 2 : settings Supabase
  if (!supabase) return null;
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "stripe_secret_key")
    .maybeSingle();

  return (data?.value as string) || null;
}

export async function POST(req: NextRequest) {
  try {
    const { prestationId, amount, description, clientName, clientEmail } =
      await req.json() as {
        prestationId: string;
        amount: number;        // en euros (ex: 150)
        description: string;
        clientName: string;
        clientEmail?: string;
      };

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }

    const secretKey = await getStripeKey();
    if (!secretKey) {
      return NextResponse.json(
        { error: "Stripe non configuré — ajoutez votre clé secrète dans Configuration → Stripe" },
        { status: 400 }
      );
    }

    const stripe = new Stripe(secretKey, { apiVersion: "2026-02-25.clover" });

    // URL de base (localhost ou domaine de prod)
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: Math.round(amount * 100), // centimes
            product_data: {
              name: description || "Prestation KinouClean",
              description: clientName ? `Client : ${clientName}` : undefined,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: clientEmail || undefined,
      metadata: { prestation_id: prestationId },
      success_url: `${baseUrl}/prestations?payment=success`,
      cancel_url:  `${baseUrl}/prestations?payment=cancelled`,
    });

    // Sauvegarder l'URL dans la prestation (colonne stripe_payment_url)
    if (supabase && session.url) {
      await supabase
        .from("prestations")
        .update({ stripe_payment_url: session.url })
        .eq("id", prestationId);
      // Ignorer l'erreur si la colonne n'existe pas encore
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur Stripe inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
