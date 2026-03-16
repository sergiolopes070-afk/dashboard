import { NextResponse } from "next/server";
import { appendPrestation, updatePrestation } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// POST : ajouter un nouveau client / prestation
export async function POST(req: Request) {
  try {
    const body = await req.json();
    await appendPrestation({
      nom       : body.nom        || "",
      prenom    : body.prenom     || "",
      tel       : body.tel        || "",
      email     : body.email      || "",
      typePresta: body.typePresta || "",
      quantite  : body.quantite   || "",
      adresse   : body.adresse    || "",
      date      : body.date       || "",
      heure     : body.heure      || "",
      message   : body.message    || "",
      prix      : body.prix       || "",
    });

    // Envoyer l'email de confirmation si l'adresse email est renseignée
    if (body.email) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      fetch(`${baseUrl}/api/send-email`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          email     : body.email,
          prenom    : body.prenom,
          typePresta: body.typePresta,
          quantite  : body.quantite,
          adresse   : body.adresse,
          date      : body.date,
          heure     : body.heure,
          prix      : body.prix,
        }),
      }).catch((e) => console.error("Erreur envoi email:", e));
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH : modifier les infos client sur toutes ses prestations
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { rows, updates } = body as {
      rows: string[];
      updates: Record<string, string>;
    };
    if (!rows?.length || !updates) {
      return NextResponse.json({ error: "rows et updates requis" }, { status: 400 });
    }
    // Client info is stored in the clients table; one update is enough
    await updatePrestation(rows[0], updates);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
