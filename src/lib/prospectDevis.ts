// ─────────────────────────────────────────────────────────────────────────────
// Construction du devis d'un prospect — partagée entre :
//   • GET /api/prospects/[id]/devis   (aperçu / impression PDF)
//   • POST .../relance action devis_envoye (envoi du devis par email)
// Garantit un numéro KC-AAAAMMJJ-NNN stable et un dispositif cohérent avec le
// choix « Avance immédiate » du prospect (suivi.avanceImmediate, défaut = true).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "./supabase";
import { setSettingRaw, lireSettingJSONStrict, majSettingJSON } from "./settings";
import { buildDevisHtml, numeroDevis, dateFr, dateFrPlus, prestationPhrase, calcTotaux, lignesProspect, normaliserRemise, DevisLigne, DevisData, DevisRemise } from "./devisKinou";

export type ProspectDevis = {
  html: string;        // devis complet prêt à imprimer / joindre (aperçu HTML)
  data: DevisData;     // données brutes du devis (pour le rendu PDF natif)
  num: string;         // numéro KC-AAAAMMJJ-NNN
  totalTTC: number;    // APRÈS réduction éventuelle
  rac: number;         // reste à charge = TTC (réduit) × 50 %
  remise?: { libelle: string; montant: number; sousTotalTTC: number; racSansRemise: number }; // si réduction
  prestation: string;  // phrase courte (« canapé d'angle ») ou « vos textiles »
  prestationVous: boolean; // true si la phrase commence par « vos » (accord « de … »)
  avance: boolean;     // dispositif avance immédiate retenu
  prospect: { prenom: string; nom: string; genre: string; email: string };
};

type Result = { ok: true; devis: ProspectDevis } | { ok: false; error: string; status: number };

export async function buildProspectDevis(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: "Supabase non configuré", status: 503 };

  const { data: p } = await supabase
    .from("prospects")
    .select("prenom, nom, genre, tel, email, adresse, besoins, type_presta, budget")
    .eq("id", id).single();
  if (!p) return { ok: false, error: "Prospect introuvable", status: 404 };

  // Lignes du devis à partir des prestations souhaitées (prix TTC > 0) — voir
  // lignesProspect (devisKinou) : `quantite` = description, `nombre` = Qté,
  // `prix` = prix TOTAL de la ligne ; à défaut, une ligne au budget.
  const lignes: DevisLigne[] = lignesProspect(p.besoins, p.budget, (p.type_presta as string) || "");
  if (lignes.length === 0) {
    return { ok: false, error: "Aucune prestation avec un prix. Ajoute une prestation souhaitée AVEC son prix avant de générer le devis.", status: 400 };
  }

  // Numéro stable + dispositif (avance par défaut, sauf si décoché).
  // Lecture stricte : suivi illisible → pas de devis (sinon nouveau numéro / avance faussés).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suiviAll = await lireSettingJSONStrict<Record<string, any>>("prospects_suivi", {});
  if (!suiviAll) return { ok: false, error: "Suivi des prospects momentanément illisible — réessaie dans un instant.", status: 503 };
  const cur = suiviAll[id] || {};
  const avance = cur.avanceImmediate !== false; // undefined ⇒ true
  let num: string = cur.devisNum;
  if (!num) {
    const attrib = await attribuerNumeroDevis(id);
    if ("error" in attrib) return { ok: false, error: `Numéro de devis non attribué : ${attrib.error}`, status: 503 };
    num = attrib.num;
  }

  // Réduction éventuelle (suivi.remise) — mêmes totaux que le HTML / PDF.
  const remise: DevisRemise | null = normaliserRemise(cur.remise);
  const T = calcTotaux(lignes, remise);
  const totalTTC = T.totalTTC;
  const rac = T.rac;
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
    remise,
  };
  const html = buildDevisHtml(data);

  return {
    ok: true,
    devis: {
      html, data, num, totalTTC, rac, prestation, prestationVous, avance,
      remise: T.remise > 0 ? { libelle: T.libelle, montant: T.remise, sousTotalTTC: T.sousTotalTTC, racSansRemise: T.racSansRemise } : undefined,
      prospect: {
        prenom: (p.prenom as string) || "",
        nom   : (p.nom as string) || "",
        genre : (p.genre as string) || "",
        email : (p.email as string) || "",
      },
    },
  };
}

// Attribue un numéro KC-AAAAMMJJ-NNN au prospect (sans migration DB : compteur
// dans settings/devis_counter). Pas d'atomicité SQL possible ici, donc on réduit
// la fenêtre de course : relecture juste avant l'écriture, saut des numéros déjà
// présents dans le suivi, résultat de chaque écriture vérifié, et le suivi n'est
// complété que si aucun numéro n'a été posé entre-temps pour ce prospect.
async function attribuerNumeroDevis(id: string): Promise<{ num: string } | { error: string }> {
  const compteur = await lireSettingJSONStrict<number>("devis_counter", 0);
  if (compteur == null) return { error: "compteur illisible" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suivi = await lireSettingJSONStrict<Record<string, any>>("prospects_suivi", {});
  if (!suivi) return { error: "suivi illisible" };
  if (suivi[id]?.devisNum) return { num: suivi[id].devisNum as string }; // posé entre-temps
  const pris = new Set(Object.values(suivi).map(s => s?.devisNum).filter(Boolean));
  let c = (parseInt(String(compteur), 10) || 0) + 1;
  while (pris.has(numeroDevis(c))) c++;
  const errC = await setSettingRaw("devis_counter", String(c));
  if (errC) return { error: errC };
  let num = numeroDevis(c);
  try {
    await majSettingJSON<Record<string, any>>("prospects_suivi", {}, all => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (all[id]?.devisNum) num = all[id].devisNum; // un autre appel a gagné : on garde le sien
      else all[id] = { ...(all[id] || {}), devisNum: num };
    });
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  return { num };
}
