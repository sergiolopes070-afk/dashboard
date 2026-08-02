import { supabase } from "./supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Consommation automatique du stock à la CLÔTURE d'une prestation.
// Chaque article porte une « recette » conso = { "<type de prestation>": dose }.
// Quand un RDV de ce type est clôturé (archivé), on déduit la dose de chaque
// article concerné et on journalise le mouvement. 100 % logique, aucune IA.
// Ne jette jamais : l'archivage ne doit pas échouer si le stock a un souci.
// ─────────────────────────────────────────────────────────────────────────────
export async function consommerStockPourPrestation(typePresta: string): Promise<void> {
  if (!supabase || !typePresta) return;
  try {
    // On récupère les articles ayant une dose pour ce type de prestation.
    const { data, error } = await supabase.from("stock_items").select("id, quantite, historique, conso");
    if (error || !data) return; // table absente / vide → on ignore silencieusement

    for (const it of data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conso = (it.conso && typeof it.conso === "object" && !Array.isArray(it.conso)) ? it.conso as Record<string, any> : {};
      const dose = Number(conso[typePresta]);
      if (!(dose > 0)) continue;

      const avant = Number(it.quantite ?? 0);
      const apres = Math.max(0, avant - dose);
      const hist = Array.isArray(it.historique) ? it.historique : [];
      const entry = { date: new Date().toISOString(), type: "sortie", quantite: dose, motif: `Prestation clôturée (${typePresta})`, avant, apres, auto: true };
      await supabase.from("stock_items")
        .update({ quantite: apres, historique: [entry, ...hist].slice(0, 50), updated_at: new Date().toISOString() })
        .eq("id", it.id);
    }
  } catch {
    /* le stock ne doit jamais bloquer une clôture */
  }
}
