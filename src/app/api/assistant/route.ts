import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import Anthropic from "@anthropic-ai/sdk";
import { getPrestations, updatePrestation } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Géocodage (BAN) ──────────────────────────────────────────────────────────
async function geocode(address: string): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const data = await res.json();
    if (data.features?.length > 0) {
      const [lon, lat] = data.features[0].geometry.coordinates;
      return { lat, lon, label: data.features[0].properties.label };
    }
  } catch { /* ignore */ }
  return null;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat/2) ** 2 + Math.cos(a.lat * Math.PI/180) * Math.cos(b.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function minutesToText(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  return `${Math.floor(min/60)}h${String(Math.round(min % 60)).padStart(2,"0")}`;
}

// ─── Outils Claude ─────────────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_prospects",
    description: "Récupère la liste des prospects avec tous leurs détails (statut, relance, notes, téléphone…)",
    input_schema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          enum: ["actifs", "relance_aujourd_hui", "tous"],
          description: "Filtre : actifs (non convertis/perdus), relance_aujourd_hui, tous",
        },
      },
    },
  },
  {
    name: "get_prestations",
    description: "Récupère les prestations à venir avec adresse, prix, prestataire, statut",
    input_schema: {
      type: "object" as const,
      properties: {
        upcoming_only: { type: "boolean", description: "Si true, seulement les futurs RDV" },
      },
    },
  },
  {
    name: "update_prospect",
    description: "Met à jour un ou plusieurs champs d'un prospect (statut, date de relance, notes, nom, téléphone, adresse, budget…)",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "ID du prospect (récupéré via get_prospects)" },
        updates: {
          type: "object",
          description: "Champs à mettre à jour",
          properties: {
            statut:      { type: "string", enum: ["NOUVEAU","CONTACTÉ","RELANCÉ","CONVERTI","PERDU"] },
            dateRelance: { type: "string", description: "Date ISO YYYY-MM-DD" },
            notes:       { type: "string" },
            prenom:      { type: "string" },
            nom:         { type: "string" },
            tel:         { type: "string" },
            email:       { type: "string" },
            typePresta:  { type: "string" },
            adresse:     { type: "string" },
            budget:      { type: "string" },
            source:      { type: "string" },
          },
        },
      },
      required: ["id", "updates"],
    },
  },
  {
    name: "add_note_prospect",
    description: "Ajoute une note dans le journal des échanges d'un prospect",
    input_schema: {
      type: "object" as const,
      properties: {
        id:   { type: "string", description: "ID du prospect" },
        note: { type: "string", description: "Texte de la note (tu peux utiliser des emojis : 📞 💬 📧 🎯 💤 💶 ❌)" },
      },
      required: ["id", "note"],
    },
  },
  {
    name: "update_prestation",
    description: "Met à jour une prestation (statut, prix, adresse, heure, prestataire, commentaire…)",
    input_schema: {
      type: "object" as const,
      properties: {
        row: { type: "string", description: "ID de la prestation (champ 'row')" },
        updates: {
          type: "object",
          properties: {
            statut:      { type: "string" },
            prix:        { type: "string" },
            adresse:     { type: "string" },
            date:        { type: "string" },
            heure:       { type: "string" },
            prestataire: { type: "string" },
            commentaire: { type: "string" },
            typePresta:  { type: "string" },
          },
        },
      },
      required: ["row", "updates"],
    },
  },
  {
    name: "find_nearest_rdv",
    description: "Trouve les RDV les plus proches d'une adresse donnée avec distances et temps de trajet estimés (utile pour optimiser les tournées)",
    input_schema: {
      type: "object" as const,
      properties: {
        adresse: { type: "string", description: "Adresse de référence" },
        date_filter: { type: "string", description: "Date optionnelle (format JJ/MM/AAAA) pour filtrer" },
        limit: { type: "number", description: "Nombre de résultats (défaut: 5)" },
      },
      required: ["adresse"],
    },
  },
  {
    name: "calculate_route",
    description: "Calcule l'ordre optimal et les temps de trajet pour une liste d'adresses dans une journée",
    input_schema: {
      type: "object" as const,
      properties: {
        adresses: {
          type: "array",
          items: { type: "string" },
          description: "Liste d'adresses dans l'ordre souhaité ou à optimiser",
        },
      },
      required: ["adresses"],
    },
  },
];

// ─── Exécution des outils ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  try {
    switch (name) {

      case "get_prospects": {
        if (!supabase) return JSON.stringify({ error: "Supabase non configuré" });
        const today = new Date().toISOString().split("T")[0];
        let query = supabase.from("prospects").select("*").order("created_at", { ascending: false });
        const { data } = await query;
        let list = data || [];
        if (input.filter === "actifs") list = list.filter((p: any) => !["CONVERTI","PERDU"].includes(p.statut));
        if (input.filter === "relance_aujourd_hui") list = list.filter((p: any) => p.date_relance && p.date_relance <= today && !["CONVERTI","PERDU"].includes(p.statut));
        return JSON.stringify(list.map((p: any) => ({
          id: p.id, prenom: p.prenom, nom: p.nom, tel: p.tel, email: p.email,
          statut: p.statut, typePresta: p.type_presta, adresse: p.adresse,
          budget: p.budget, source: p.source, dateRelance: p.date_relance,
          notes: p.notes, createdAt: p.created_at,
        })));
      }

      case "get_prestations": {
        const prestas = await getPrestations();
        const today = new Date();
        let list = prestas;
        if (input.upcoming_only) {
          list = prestas.filter(p => {
            if (!p.date) return false;
            const parts = p.date.split("/");
            if (parts.length !== 3) return false;
            return new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])) >= today;
          });
        }
        return JSON.stringify(list.slice(0, 30).map(p => ({
          row: p.row, prenom: p.prenom, nom: p.nom, tel: p.tel,
          date: p.date, heure: p.heure, adresse: p.adresse,
          typePresta: p.typePresta, prix: p.prix, statut: p.statut,
          prestataire: p.prestataire, commentaire: p.commentaire,
        })));
      }

      case "update_prospect": {
        if (!supabase) return JSON.stringify({ error: "Supabase non configuré" });
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const u = input.updates || {};
        if (u.statut      !== undefined) patch.statut       = u.statut;
        if (u.dateRelance !== undefined) patch.date_relance = u.dateRelance || null;
        if (u.notes       !== undefined) patch.notes        = u.notes;
        if (u.prenom      !== undefined) patch.prenom       = u.prenom;
        if (u.nom         !== undefined) patch.nom          = u.nom;
        if (u.tel         !== undefined) patch.tel          = u.tel;
        if (u.email       !== undefined) patch.email        = u.email;
        if (u.typePresta  !== undefined) patch.type_presta  = u.typePresta;
        if (u.adresse     !== undefined) patch.adresse      = u.adresse;
        if (u.budget      !== undefined) patch.budget       = u.budget;
        if (u.source      !== undefined) patch.source       = u.source;
        const { error } = await supabase.from("prospects").update(patch).eq("id", input.id);
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: `Prospect mis à jour avec succès` });
      }

      case "add_note_prospect": {
        if (!supabase) return JSON.stringify({ error: "Supabase non configuré" });
        const { data: current } = await supabase.from("prospects").select("commentaires").eq("id", input.id).single();
        const existing = Array.isArray(current?.commentaires) ? current.commentaires : [];
        const newComment = { id: crypto.randomUUID(), date: new Date().toISOString(), texte: input.note };
        const { error } = await supabase.from("prospects").update({
          commentaires: [...existing, newComment],
          updated_at: new Date().toISOString(),
        }).eq("id", input.id);
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, message: "Note ajoutée au journal" });
      }

      case "update_prestation": {
        await updatePrestation(input.row, input.updates || {});
        return JSON.stringify({ success: true, message: "Prestation mise à jour" });
      }

      case "find_nearest_rdv": {
        const refCoords = await geocode(input.adresse);
        if (!refCoords) return JSON.stringify({ error: `Adresse introuvable : ${input.adresse}` });

        const prestas = await getPrestations();
        const today = new Date();
        let candidates = prestas.filter(p => {
          if (!p.adresse) return false;
          if (!p.date) return false;
          const parts = p.date.split("/");
          if (parts.length !== 3) return false;
          const d = new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0]));
          return d >= today;
        });

        if (input.date_filter) candidates = candidates.filter(p => p.date === input.date_filter);

        const withDist = await Promise.all(
          candidates.slice(0, 20).map(async p => {
            const coords = await geocode(p.adresse);
            if (!coords) return null;
            const km = haversineKm(refCoords, coords);
            const mins = (km / 30) * 60; // 30 km/h vitesse moyenne
            return { ...p, distanceKm: Math.round(km * 10) / 10, trajetEstime: minutesToText(mins) };
          })
        );

        const sorted = withDist
          .filter(Boolean)
          .sort((a, b) => (a!.distanceKm - b!.distanceKm))
          .slice(0, input.limit || 5);

        return JSON.stringify({
          adresseReference: refCoords.label,
          resultats: sorted.map(p => ({
            nom: `${p!.prenom} ${p!.nom}`,
            date: p!.date, heure: p!.heure,
            adresse: p!.adresse,
            typePresta: p!.typePresta,
            distanceKm: p!.distanceKm,
            trajetEstime: p!.trajetEstime,
            prix: p!.prix,
            prestataire: p!.prestataire,
          })),
        });
      }

      case "calculate_route": {
        const adresses: string[] = input.adresses || [];
        const geocoded = await Promise.all(adresses.map(async (a, i) => {
          const coords = await geocode(a);
          return { index: i, adresse: a, coords };
        }));
        const valid = geocoded.filter(g => g.coords);

        const segments = [];
        let totalKm = 0;
        let totalMins = 0;
        for (let i = 0; i < valid.length - 1; i++) {
          const km = haversineKm(valid[i].coords!, valid[i+1].coords!);
          const mins = (km / 30) * 60;
          totalKm += km;
          totalMins += mins;
          segments.push({
            de: valid[i].adresse,
            vers: valid[i+1].adresse,
            distanceKm: Math.round(km * 10) / 10,
            trajet: minutesToText(mins),
          });
        }
        return JSON.stringify({
          segments,
          totalDistance: `${Math.round(totalKm * 10) / 10} km`,
          totalTrajet: minutesToText(totalMins),
        });
      }

      default:
        return JSON.stringify({ error: `Outil inconnu : ${name}` });
    }
  } catch (err: unknown) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" });
  }
}

// ─── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée" }, { status: 503 });
  }

  try {
    const { messages } = await req.json() as { messages: Anthropic.MessageParam[] };

    const today = new Date().toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const SYSTEM = `Tu es l'assistant IA de KinouClean, une entreprise de nettoyage à domicile.
Tu es un vrai bras droit — tu peux consulter ET modifier les données en temps réel.
Aujourd'hui : ${today}.

Tes capacités :
- Consulter et modifier les fiches prospects (statut, relance, notes, coordonnées)
- Ajouter des notes dans le journal des échanges
- Consulter et modifier les prestations (prix, statut, adresse, prestataire)
- Trouver le RDV le plus proche d'une adresse donnée avec temps de trajet
- Calculer un itinéraire optimal pour une journée
- Conseiller sur la gestion de l'activité

Comportement :
- Quand on te demande de modifier quelque chose, fais-le directement avec les outils
- Pour trouver un prospect, utilise d'abord get_prospects puis identifie lequel correspond
- Donne des conseils concrets et pratiques basés sur les vraies données
- Si tu modifies des données, confirme ce que tu as fait
- Réponds toujours en français, sois concis et direct
- Pour les trajets, suppose une vitesse moyenne de 30 km/h en ville`;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        function send(obj: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        }

        let currentMessages: Anthropic.MessageParam[] = [...messages];
        let iterations = 0;
        const MAX_ITER = 6;

        while (iterations < MAX_ITER) {
          iterations++;

          const response = await client.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 2048,
            system: SYSTEM,
            tools: TOOLS,
            messages: currentMessages,
          });

          // Extraire le texte partiel pour l'afficher
          const textBlocks = response.content.filter(b => b.type === "text");
          for (const block of textBlocks) {
            if (block.type === "text" && block.text) {
              send({ type: "text", text: block.text });
            }
          }

          if (response.stop_reason !== "tool_use") break;

          // Exécuter les outils
          const toolUses = response.content.filter(b => b.type === "tool_use");
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUses) {
            if (toolUse.type !== "tool_use") continue;
            send({ type: "tool", name: toolUse.name });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await executeTool(toolUse.name, toolUse.input as Record<string, any>);
            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
          }

          currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response.content },
            { role: "user", content: toolResults },
          ];
        }

        send({ type: "done" });
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
