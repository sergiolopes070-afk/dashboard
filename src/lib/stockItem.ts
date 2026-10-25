// Ligne `stock_items` (Supabase) → objet utilisé par l'interface.
// Hors des fichiers de route : Next.js n'accepte que les handlers HTTP et la
// config comme exports d'un route.ts (sinon le build échoue au typage).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToItem(r: Record<string, any>) {
  return {
    id           : r.id            as string,
    createdAt    : r.created_at    as string,
    nom          : r.nom           || "",
    categorie    : r.categorie     || "Matériel",
    unite        : r.unite         || "unité",
    quantite     : Number(r.quantite ?? 0),
    seuil        : Number(r.seuil ?? 0),
    prixUnitaire : r.prix_unitaire != null ? Number(r.prix_unitaire) : null,
    notes        : r.notes         || "",
    historique   : Array.isArray(r.historique) ? r.historique : [],
    conso        : (r.conso && typeof r.conso === "object" && !Array.isArray(r.conso)) ? r.conso as Record<string, number> : {},
  };
}
