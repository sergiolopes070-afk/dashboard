import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée" }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) return NextResponse.json({ error: "Image manquante" }, { status: 400 });

    // Convertir en base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model  : "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{
        role   : "user",
        content: [
          {
            type  : "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Analyse cette capture d'écran (conversation Instagram, SMS, WhatsApp ou autre).
Extrait les informations de contact du CLIENT (pas la personne qui répond, mais celle qui demande le service).

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans explication :
{
  "prenom": "",
  "nom": "",
  "tel": "",
  "email": "",
  "ville": "",
  "adresse": "",
  "typePresta": "",
  "notes": ""
}

Règles :
- "typePresta" : service demandé parmi (Lavage Canapé, Lavage de matelas, Nettoyage de voiture, Nettoyage appartement, Autre)
- "notes" : résumé du message ou besoin exprimé (1-2 phrases)
- "tel" : format 06XXXXXXXX ou 07XXXXXXXX sans espaces si trouvé
- Si une info n'est pas visible, laisse la valeur vide ""
- Ne devine pas, n'invente pas`,
          },
        ],
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Nettoyer le JSON (au cas où Claude ajoute du markdown)
    const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let extracted: Record<string, string> = {};
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Impossible d'extraire les données", raw }, { status: 422 });
    }

    return NextResponse.json({ success: true, data: extracted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
