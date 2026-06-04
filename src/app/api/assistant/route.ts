import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getPrestations, getArchive } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée" }, { status: 503 });
  }

  try {
    const { messages } = await req.json() as { messages: { role: "user" | "assistant"; content: string }[] };

    // ── Récupère les données du dashboard ──────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const todayFr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const [prestations, archive, prospectsRes] = await Promise.allSettled([
      getPrestations(),
      getArchive(),
      supabase ? supabase.from("prospects").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);

    const prestas  = prestations.status  === "fulfilled" ? prestations.value  : [];
    const archived = archive.status      === "fulfilled" ? archive.value      : [];
    const prospects = prospectsRes.status === "fulfilled" && "value" in prospectsRes
      ? ((prospectsRes.value as { data: unknown[] | null }).data || [])
      : [];

    // ── Stats ──────────────────────────────────────────────────────────────
    const upcoming = prestas.filter(p => {
      if (!p.date) return false;
      const parts = p.date.split("/");
      if (parts.length !== 3) return false;
      const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      return d >= new Date() && ["EMAIL ENVOYÉ", "CONFIRMÉ"].includes(p.statut);
    }).sort((a, b) => a.date.localeCompare(b.date));

    const CANCELLATION = ["Annulation client", "Client injoignable", "Doublon"];
    const archivePaid = archived.filter(p => !CANCELLATION.some(r => (p.archiveReason || "").startsWith(r)));
    const totalCA = [...prestas, ...archivePaid].reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prospectsActifs = (prospects as any[]).filter((p: any) => !["CONVERTI","PERDU"].includes(p.statut || ""));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aRelancer = prospectsActifs.filter((p: any) => p.date_relance && p.date_relance <= today);

    // ── Contexte transmis à Claude ─────────────────────────────────────────
    const context = `Tu es l'assistant personnel de KinouClean, une entreprise de nettoyage à domicile.
Tu as accès aux données en temps réel du dashboard. Réponds en français, de manière concise et utile.
Aujourd'hui nous sommes le ${todayFr}.

=== STATS GLOBALES ===
CA total : ${totalCA.toFixed(0)} €
Prestations actives : ${prestas.length}
Prestations archivées : ${archived.length}
Prospects actifs : ${prospectsActifs.length}
Prospects à relancer aujourd'hui : ${aRelancer.length}

=== PROCHAINS RDV (${upcoming.length}) ===
${upcoming.slice(0, 10).map(p =>
  `- ${p.date} à ${p.heure || "?"} | ${p.prenom} ${p.nom} | ${p.typePresta} | ${p.adresse || "—"} | ${p.prix ? p.prix + " €" : "Prix non défini"} | Prestataire: ${p.prestataire || "aucun"}`
).join("\n") || "Aucun RDV à venir"}

=== PROSPECTS À RELANCER AUJOURD'HUI (${aRelancer.length}) ===
${// eslint-disable-next-line @typescript-eslint/no-explicit-any
aRelancer.slice(0, 10).map((p: any) =>
  `- ${p.prenom} ${p.nom} | ${p.type_presta || "—"} | Tel: ${p.tel || "—"} | Statut: ${p.statut} | Relance prévue: ${p.date_relance}`
).join("\n") || "Personne à relancer aujourd'hui"}

=== TOUS LES PROSPECTS ACTIFS (${prospectsActifs.length}) ===
${// eslint-disable-next-line @typescript-eslint/no-explicit-any
prospectsActifs.slice(0, 20).map((p: any) =>
  `- ${p.prenom} ${p.nom} | ${p.type_presta || "—"} | ${p.statut} | Relance: ${p.date_relance || "non planifiée"} | Notes: ${p.notes || "—"}`
).join("\n") || "Aucun prospect actif"}

Réponds de façon naturelle et aide l'utilisateur à gérer son activité.
Si on te demande de rédiger un message (WhatsApp, email), rédige-le directement.
Si on te demande des stats, donne-les précisément avec les données ci-dessus.`;

    // ── Appel Claude en streaming ──────────────────────────────────────────
    const stream = await client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: context,
      messages,
    });

    // Stream SSE vers le client
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
