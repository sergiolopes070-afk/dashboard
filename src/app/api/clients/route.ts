import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { appendPrestation, updatePrestation, deleteClient, updateClientTags, updateClientNotes, getClientIdOfPrestation, getClientsAvecPrestations } from "@/lib/sheets";
import { getSettingJSON, setSettingRaw } from "@/lib/settings";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET : liste de TOUS les clients (table clients, archivés inclus) + historique complet.
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    return NextResponse.json(await getClientsAvecPrestations());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Enregistre la préférence fiscale d'un client (avance / credit) dans la table
// `settings` (clé `fiscal_clients`, JSON) — même stockage que /api/clients/fiscal.
async function saveFiscal(clientId: string, fiscal: "avance" | "credit") {
  const map = await getSettingJSON<Record<string, string>>("fiscal_clients", {});
  map[clientId] = fiscal;
  await setSettingRaw("fiscal_clients", JSON.stringify(map));
}

// POST : ajouter un nouveau client / prestation
export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const body = await req.json();

    // Articles multiples (canapé + matelas + tapis…) → FUSIONNÉS en UNE seule
    // prestation « normale » : type = liste des articles, prix = total, et le
    // détail par article conservé dans la note. On ne crée plus une ligne par
    // article (sinon une réservation apparaît éclatée dans l'agenda).
    const articles = Array.isArray(body.articlesSupp)
      ? body.articlesSupp.filter((a: { typePresta?: string; prix?: string }) => a && (a.typePresta || a.prix))
      : [];

    let typePresta = body.typePresta || "";
    let prix       = body.prix       || "";
    let message    = body.message    || "";

    if (articles.length > 0) {
      const items = [
        { type: body.typePresta || "Prestation", qty: body.quantite || "", prix: body.prix || "" },
        ...articles.map((a: { typePresta?: string; quantite?: string; prix?: string }) => ({
          type: a.typePresta || "Article", qty: a.quantite || "", prix: a.prix || "",
        })),
      ];
      typePresta = items.map(it => it.type).filter(Boolean).join(" + ");
      const total = items.reduce((s, it) => s + (parseFloat(it.prix) || 0), 0);
      if (total > 0) prix = String(total);
      const breakdown = "Détail articles : " + items.map(it => {
        const p = it.prix ? ` — ${parseFloat(it.prix).toFixed(2).replace(".", ",")} €` : "";
        const q = it.qty ? ` (${it.qty})` : "";
        return `${it.type}${q}${p}`;
      }).join(" · ");
      message = message ? `${message}\n${breakdown}` : breakdown;
    }

    const prestationId = await appendPrestation({
      nom          : body.nom          || "",
      prenom       : body.prenom       || "",
      tel          : body.tel          || "",
      email        : body.email        || "",
      typePresta   : typePresta,
      quantite     : body.quantite     || "",
      adresse      : body.adresse      || "",
      date         : body.date         || "",
      heure        : body.heure        || "",
      message      : message,
      prix         : prix,
      prestataire  : body.prestataire  || "",
      statut       : body.statut       || "",
      statutPresta : body.statutPresta || "",
      source       : body.source       || "",
      commission     : body.commission     || "",
      commissionType : body.commissionType || "%",
      commentaire    : body.commentaire    || "",
      modePaiement   : body.modePaiement   || "",
    });

    // Fiche client rattachée (créée ou retrouvée par email / téléphone).
    let clientId: string | null = null;
    try { clientId = await getClientIdOfPrestation(prestationId); } catch { /* best effort */ }

    // Préférence fiscale choisie à la création (avance immédiate / crédit d'impôt).
    if (clientId && (body.fiscal === "avance" || body.fiscal === "credit")) {
      try { await saveFiscal(clientId, body.fiscal); }
      catch (e) { console.error("Erreur enregistrement fiscal:", e); }
    }

    // Journal repris d'un prospect converti (notesInit : ClientNote[], plus récent
    // en premier) → ajouté AU-DESSUS du journal existant, sans doublon d'id.
    if (clientId && supabase && Array.isArray(body.notesInit) && body.notesInit.length > 0) {
      try {
        const { data: cur } = await supabase.from("clients").select("notes").eq("id", clientId).maybeSingle();
        const existantes: { id?: string }[] = Array.isArray(cur?.notes) ? cur.notes : [];
        const ids = new Set(existantes.map(n => n?.id).filter(Boolean));
        const nouvelles = body.notesInit
          .filter((n: { id?: string; texte?: string }) => n && typeof n.texte === "string" && n.texte.trim() && !ids.has(n.id))
          .map((n: { id?: string; date?: string; texte: string; type?: string }) => ({
            id   : n.id || crypto.randomUUID(),
            date : n.date || new Date().toISOString(),
            texte: n.texte.trim(),
            type : n.type || "📌",
          }));
        if (nouvelles.length) await updateClientNotes(clientId, [...nouvelles, ...existantes]);
      } catch (e) { console.error("Erreur reprise journal prospect:", e); }
    }

    // ⚠️ Envoi du récapitulatif désormais MANUEL (bouton sur l'écran de succès
    // et dans l'agenda) pour éviter tout envoi erroné. Aucun mail n'est envoyé
    // automatiquement à la création.
    return NextResponse.json({ success: true, id: prestationId, clientId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE : supprimer un client et toutes ses prestations
export async function DELETE(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const { clientId } = await req.json() as { clientId: string };
    if (!clientId) return NextResponse.json({ error: "clientId requis" }, { status: 400 });
    await deleteClient(clientId);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH : modifier les infos client ou les tags
export async function PATCH(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const body = await req.json();
    // Tags update: { clientId, tags }
    if (body.clientId && body.tags !== undefined) {
      await updateClientTags(body.clientId, body.tags);
      return NextResponse.json({ success: true });
    }
    // Notes / journal de suivi update: { clientId, notes }
    if (body.clientId && body.notes !== undefined) {
      await updateClientNotes(body.clientId, body.notes);
      return NextResponse.json({ success: true });
    }
    // Coordonnées par clientId (marche aussi pour un client sans prestation) :
    // { clientId, updates: { nom, prenom, tel, email, adresse } }
    if (body.clientId && body.updates) {
      if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
      const patch: Record<string, string> = {};
      for (const k of ["nom", "prenom", "tel", "email", "adresse"] as const) {
        if (typeof body.updates[k] === "string") patch[k] = body.updates[k];
      }
      const { error } = await supabase.from("clients").update(patch).eq("id", body.clientId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }
    // Client info update: { rows, updates }
    const { rows, updates } = body as {
      rows: string[];
      updates: Record<string, string>;
    };
    if (!rows?.length || !updates) {
      return NextResponse.json({ error: "rows/updates ou clientId/tags requis" }, { status: 400 });
    }
    await updatePrestation(rows[0], updates);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
