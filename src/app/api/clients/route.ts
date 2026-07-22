import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { appendPrestation, updatePrestation, deleteClient, updateClientTags, updateClientNotes, getClientIdOfPrestation } from "@/lib/sheets";
import { getSettingJSON, setSettingRaw } from "@/lib/settings";

export const dynamic = "force-dynamic";

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

    // Préférence fiscale choisie à la création (avance immédiate / crédit d'impôt).
    if (body.fiscal === "avance" || body.fiscal === "credit") {
      try {
        const clientId = await getClientIdOfPrestation(prestationId);
        if (clientId) await saveFiscal(clientId, body.fiscal);
      } catch (e) { console.error("Erreur enregistrement fiscal:", e); }
    }

    // NB : plus d'email automatique à la création. Le contact initial se fait
    // directement (téléphone/WhatsApp). Les emails (besoin d'infos, relances)
    // sont déclenchés MANUELLEMENT depuis le dashboard via /api/emails/action.

    return NextResponse.json({ success: true, id: prestationId });
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
