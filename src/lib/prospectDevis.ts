// ─────────────────────────────────────────────────────────────────────────────
// Construction du devis d'un prospect — partagée entre :
//   • GET /api/prospects/[id]/devis   (aperçu / impression PDF)
//   • POST .../relance action devis_envoye (envoi du devis par email)
// Garantit un numéro KC-AAAAMMJJ-NNN stable et un dispositif cohérent avec le
// choix « Avance immédiate » du prospect (suivi.avanceImmediate, défaut = true).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "./supabase";
import { getSettingJSON, setSettingRaw, getSettingRaw } from "./settings";
import { buildDevisHtml, numeroDevis, dateFr, dateFrPlus, prestationPhrase, DevisLigne, DevisData } from "./devisKinou";

export type ProspectDevis = {
  html: string;        // devis complet prêt à imprimer / joindre (aperçu HTML)
  data: DevisData;     // données brutes du devis (pour le rendu PDF natif)
  num: string;         // numéro KC-AAAAMMJJ-NNN
  totalTTC: number;
  rac: number;         // reste à charge = TTC × 50 %
  prestation: string;  // phrase courte (« canapé d'angle ») ou « vos textiles »
  prestationVous: boolean; // true si la phrase commence par « vos » (accord « de … »)
  avance: boolean;     // dispositif avance immédiate retenu
  prospect: { prenom: string; nom: string; genre: string; email: string };
};

type Result = { ok: true; devis: ProspectDevis } | { ok: false; error: string; status: number };

const toNum = (v: unknown) => parseFloat(String(v ?? "").replace(",", ".").replace(/[^\d.]/g, ""));

export async function buildProspectDevis(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: "Supabase non configuré", status: 503 };

  const { data: p } = await supabase
    .from("prospects")
    .select("prenom, nom, genre, tel, email, adresse, besoins, type_presta, budget")
    .eq("id", id).single();
  if (!p) return { ok: false, error: "Prospect introuvable", status: 404 };

  // Lignes du devis à partir des prestations souhaitées (prix TTC > 0).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const besoins: any[] = Array.isArray(p.besoins) ? p.besoins : [];
  let lignes: DevisLigne[] = besoins
    .map(b => ({ typePresta: b.typePresta as string, detail: b.quantite as string, prixTTC: toNum(b.prix) }))
    .filter(l => l.prixTTC > 0);
  if (lignes.length === 0) {
    const prix = toNum(p.budget);
    if (prix > 0) lignes = [{ typePresta: (p.type_presta as string) || "Prestation", prixTTC: prix }];
  }
  if (lignes.length === 0) {
    return { ok: false, error: "Aucune prestation avec un prix. Ajoute une prestation souhaitée AVEC son prix avant de générer le devis.", status: 400 };
  }

  // Numéro stable + dispositif (avance par défaut, sauf si décoché).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suiviAll = await getSettingJSON<Record<string, any>>("prospects_suivi", {});
  const cur = suiviAll[id] || {};
  const avance = cur.avanceImmediate !== false; // undefined ⇒ true
  let num: string = cur.devisNum;
  if (!num) {
    const c = parseInt((await getSettingRaw("devis_counter")) || "0", 10) || 0;
    num = numeroDevis(c + 1);
    await setSettingRaw("devis_counter", String(c + 1));
    suiviAll[id] = { ...cur, devisNum: num };
    await setSettingRaw("prospects_suivi", JSON.stringify(suiviAll));
  }

  const totalTTC = lignes.reduce((s, l) => s + l.prixTTC, 0);
  const rac = totalTTC * 0.5;
  const prestation = lignes.length === 1
    ? prestationPhrase(lignes[0].typePresta, lignes[0].detail || "")
    : "vos textiles";
  const prestationVous = prestation.startsWith("vos ");

  const data: DevisData = {
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
    dispositif: avance ? "avance" : "credit",
  };
  const html = buildDevisHtml(data);

  return {
    ok: true,
    devis: {
      html, data, num, totalTTC, rac, prestation, prestationVous, avance,
      prospect: {
        prenom: (p.prenom as string) || "",
        nom   : (p.nom as string) || "",
        genre : (p.genre as string) || "",
        email : (p.email as string) || "",
      },
    },
  };
}
