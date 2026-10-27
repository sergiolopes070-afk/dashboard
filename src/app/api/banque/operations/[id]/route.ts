// PATCH /api/banque/operations/:id
//   { categorie?, interne?, note? }       → modification manuelle (manuel = true si catégorie/interne)
//   { paire: "confirmer" | "ignorer" }     → décision sur un virement interne suggéré (les 2 lignes)
//   { similaires: "compter" }              → nb d'opérations qu'« Appliquer aux similaires » modifierait (rien n'est écrit)
//   { similaires: true }                   → applique catégorie + interne aux opérations similaires
//                                            (jamais celles modifiées à la main ni appariées) + crée/MAJ une règle
// Réservé à la session patron privée (404 sinon).
import { NextResponse } from "next/server";
import { requirePrive } from "@/lib/require-auth";
import { CATEGORIES_BANQUE, motifDe, correspondMotif, normaliser, type OperationBanque } from "@/lib/banque";
import { sb, chargerOperations, mettreAJourParIds, reponseErreur, verifierErreur } from "@/lib/banque-serveur";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOTIF_MIN = 4;

type Patch = Partial<Pick<OperationBanque, "categorie" | "interne" | "note" | "manuel">>;

const versOp = (r: Record<string, unknown>) => ({ ...r, montant: Number(r.montant) }) as OperationBanque;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const refus = await requirePrive();
  if (refus) return refus;
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({})) as { categorie?: unknown; interne?: unknown; note?: unknown; similaires?: unknown; paire?: unknown };

    const { data: brut, error: eLire } = await sb().from("banque_operations").select("*").eq("id", params.id).maybeSingle();
    verifierErreur(eLire);
    if (!brut) return NextResponse.json({ error: "Opération introuvable" }, { status: 404 });
    let op = versOp(brut);

    // ── Simulation « similaires » (lecture seule) ──
    if (body.similaires === "compter") {
      const motif = motifDe(op);
      if (normaliser(motif).length < MOTIF_MIN) return NextResponse.json({ error: "Libellé trop générique pour créer une règle" }, { status: 400 });
      const nb = (await chargerOperations()).filter(o => o.id !== op.id && !o.manuel && !o.paire_id && correspondMotif(o, motif)).length;
      return NextResponse.json({ motif, nb });
    }

    // ── Virement interne suggéré : confirmer / ignorer (les deux lignes de la paire) ──
    if (body.paire === "confirmer" || body.paire === "ignorer") {
      if (!op.paire_id) return NextResponse.json({ error: "Aucun virement apparié" }, { status: 400 });
      const patch = body.paire === "confirmer"
        ? { interne: true, interne_suggere: false, manuel: true }
        : { interne_suggere: false, paire_id: null, manuel: true };
      const { error } = await sb().from("banque_operations").update(patch).eq("paire_id", op.paire_id);
      verifierErreur(error);
      return NextResponse.json({ success: true });
    }

    // ── Modification manuelle ──
    const patch: Patch = {};
    if (body.categorie !== undefined) {
      if (typeof body.categorie !== "string" || !(CATEGORIES_BANQUE as readonly string[]).includes(body.categorie)) {
        return NextResponse.json({ error: "Catégorie inconnue" }, { status: 400 });
      }
      patch.categorie = body.categorie;
    }
    if (body.interne !== undefined) patch.interne = body.interne === true;
    if (body.note !== undefined) patch.note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    if (patch.categorie !== undefined || patch.interne !== undefined) patch.manuel = true;

    if (Object.keys(patch).length) {
      const { data, error } = await sb().from("banque_operations").update(patch).eq("id", params.id).select("*").maybeSingle();
      verifierErreur(error);
      if (!data) return NextResponse.json({ error: "Opération introuvable" }, { status: 404 });
      op = versOp(data);
    }

    if (body.similaires !== true) return NextResponse.json({ operation: op });

    // ── Règle + application aux opérations similaires ──
    const motif = motifDe(op);
    if (normaliser(motif).length < MOTIF_MIN) return NextResponse.json({ error: "Libellé trop générique pour créer une règle", operation: op }, { status: 400 });
    const categorie = op.categorie || "Autre";
    const { error: eRegle } = await sb().from("banque_regles")
      .upsert({ motif, categorie, interne: op.interne }, { onConflict: "motif" });
    verifierErreur(eRegle);

    const ids = (await chargerOperations())
      .filter(o => o.id !== op.id && !o.manuel && !o.paire_id && correspondMotif(o, motif))
      .map(o => o.id);
    await mettreAJourParIds(ids, { categorie, interne: op.interne });
    return NextResponse.json({ operation: op, regle: motif, nbModifiees: ids.length });
  } catch (e) {
    return reponseErreur(e);
  }
}
