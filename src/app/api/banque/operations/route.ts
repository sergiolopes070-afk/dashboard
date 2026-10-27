// GET /api/banque/operations?compte=&mois=AAAA-MM | du=&au= &categorie=&q=&interne=0|1
// Réservé à la session patron privée (404 sinon).
import { NextResponse } from "next/server";
import { requirePrive } from "@/lib/require-auth";
import { COMPTES_BANQUE, normaliser, texteOperation } from "@/lib/banque";
import { chargerOperations, reponseErreur } from "@/lib/banque-serveur";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE = 3000;

export async function GET(req: Request) {
  const refus = await requirePrive();
  if (refus) return refus;
  try {
    const sp = new URL(req.url).searchParams;
    let du = sp.get("du") || "", au = sp.get("au") || "";
    const mois = sp.get("mois") || "";
    if (/^\d{4}-\d{2}$/.test(mois)) {
      const [a, m] = mois.split("-").map(Number);
      du = `${mois}-01`;
      au = `${mois}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
    }
    const compte = sp.get("compte") || "";
    let ops = await chargerOperations({
      du: ISO.test(du) ? du : undefined,
      au: ISO.test(au) ? au : undefined,
      compte: (COMPTES_BANQUE as string[]).includes(compte) ? compte : undefined,
    });
    const categorie = sp.get("categorie");
    if (categorie) ops = ops.filter(o => (o.categorie || "Autre") === categorie);
    const interne = sp.get("interne");
    if (interne === "1") ops = ops.filter(o => o.interne);
    if (interne === "0") ops = ops.filter(o => !o.interne);
    const q = normaliser(sp.get("q"));
    if (q) ops = ops.filter(o => texteOperation(o).includes(q) || normaliser(o.note).includes(q));
    const tronque = ops.length > LIMITE;
    return NextResponse.json({ operations: ops.slice(0, LIMITE), tronque, limite: LIMITE, total: ops.length });
  } catch (e) {
    return reponseErreur(e);
  }
}
