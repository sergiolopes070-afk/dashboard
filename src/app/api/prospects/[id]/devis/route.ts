import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getSettingJSON, setSettingRaw, getSettingRaw } from "@/lib/settings";
import { buildDevisHtml, numeroDevis, dateFr, dateFrPlus, DevisLigne } from "@/lib/devisKinou";

export const dynamic = "force-dynamic";

// Génère le devis premium d'un prospect (HTML prêt à imprimer en PDF).
// Le numéro KC-AAAAMMJJ-NNN est attribué UNE FOIS puis réutilisé (stocké dans
// settings/prospects_suivi[id].devisNum ; compteur dans settings/devis_counter).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  const { id } = params;

  const { data: p } = await supabase
    .from("prospects").select("prenom, nom, tel, email, adresse, besoins, type_presta, budget").eq("id", id).single();
  if (!p) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  // Lignes du devis à partir des prestations souhaitées (prix TTC > 0).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const besoins: any[] = Array.isArray(p.besoins) ? p.besoins : [];
  const toNum = (v: unknown) => parseFloat(String(v ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  let lignes: DevisLigne[] = besoins
    .map(b => ({ typePresta: b.typePresta as string, detail: b.quantite as string, prixTTC: toNum(b.prix) }))
    .filter(l => l.prixTTC > 0);
  if (lignes.length === 0) {
    const prix = toNum(p.budget);
    if (prix > 0) lignes = [{ typePresta: (p.type_presta as string) || "Prestation", prixTTC: prix }];
  }
  if (lignes.length === 0) {
    return NextResponse.json({ error: "Aucune prestation avec un prix. Ajoute une prestation souhaitée AVEC son prix avant de générer le devis." }, { status: 400 });
  }

  // Numéro stable (réutilisé si déjà généré pour ce prospect).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suiviAll = await getSettingJSON<Record<string, any>>("prospects_suivi", {});
  const cur = suiviAll[id] || {};
  let num: string = cur.devisNum;
  if (!num) {
    const c = parseInt((await getSettingRaw("devis_counter")) || "0", 10) || 0;
    num = numeroDevis(c + 1);
    await setSettingRaw("devis_counter", String(c + 1));
    suiviAll[id] = { ...cur, devisNum: num };
    await setSettingRaw("prospects_suivi", JSON.stringify(suiviAll));
  }

  const html = buildDevisHtml({
    num,
    dateEmission: dateFr(),
    dateValidite: dateFrPlus(30),
    client: {
      nom    : `${p.prenom || ""} ${p.nom || ""}`.trim(),
      adresse: (p.adresse as string) || "",
      tel    : (p.tel as string) || "",
      email  : (p.email as string) || "",
    },
    lignes,
    dispositif: "avance",
  });

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
