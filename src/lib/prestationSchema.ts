// ─────────────────────────────────────────────────────────────────────────────
// Schéma des prestations (Phase 2 — étape 5 : formulaire intelligent).
//
// Chaque type de prestation déclare son propre jeu de champs. Pour AJOUTER un
// nouveau type, il suffit d'ajouter une entrée ici — aucune autre ligne de code
// à toucher : les formulaires s'adaptent automatiquement.
// ─────────────────────────────────────────────────────────────────────────────

export interface PrestaField {
  key: string;                       // identifiant interne du champ
  label: string;                     // libellé affiché
  type: "select" | "text" | "number";
  options?: string[];                // pour un select
  placeholder?: string;
  suffix?: string;                   // suffixe dans le résumé (ex. "places", "m²")
}

export interface PrestaSchema {
  match: string[];                   // mots-clés du type qui déclenchent ce schéma
  fields: PrestaField[];
}

export const PRESTATION_SCHEMAS: PrestaSchema[] = [
  {
    match: ["canapé", "canape", "fauteuil", "salon"],
    fields: [
      { key: "type_canape", label: "Type de canapé",  type: "select", options: ["Tissu", "Cuir", "Alcantara", "Convertible", "D'angle", "Microfibre"] },
      { key: "places",      label: "Nombre de places", type: "select", options: ["1", "2", "3", "4", "5", "6", "7+"], suffix: "places" },
    ],
  },
  {
    match: ["matelas", "literie"],
    fields: [
      { key: "taille", label: "Taille du matelas", type: "select", options: ["1 place (90×190)", "2 places (140×190)", "Queen (160×200)", "King (180×200)", "Autre"] },
    ],
  },
  {
    match: ["tapis", "moquette"],
    fields: [
      { key: "dimensions", label: "Dimensions", type: "text", placeholder: "ex : 2×3 m / 6 m²" },
    ],
  },
  {
    match: ["véhicule", "vehicule", "voiture", "auto", "car"],
    fields: [
      { key: "type_vehicule", label: "Type de véhicule", type: "select", options: ["Citadine", "Berline", "SUV / 4×4", "Utilitaire", "Monospace"] },
      { key: "formule",       label: "Formule",          type: "select", options: ["Extérieur", "Intérieur", "Complète"] },
    ],
  },
  {
    match: ["vitre", "vitrerie", "fenêtre", "fenetre", "baie"],
    fields: [
      { key: "surface", label: "Nombre de vitres / surface", type: "text", placeholder: "ex : 12 vitres / 20 m²" },
    ],
  },
  {
    match: ["ménage", "menage", "nettoyage maison", "grand nettoyage"],
    fields: [
      { key: "surface",   label: "Surface", type: "number", suffix: "m²", placeholder: "m²" },
      { key: "frequence", label: "Fréquence", type: "select", options: ["Ponctuel", "Hebdomadaire", "Bi-mensuel", "Mensuel"] },
    ],
  },
  {
    match: ["repassage", "linge"],
    fields: [
      { key: "volume", label: "Volume de linge", type: "select", options: ["Petit (1 panier)", "Moyen (2-3 paniers)", "Grand (4+ paniers)"] },
    ],
  },
];

// Renvoie les champs adaptés au type de prestation (vide si aucun schéma).
export function getSchema(typePresta: string): PrestaField[] {
  const t = (typePresta || "").toLowerCase();
  for (const s of PRESTATION_SCHEMAS) {
    if (s.match.some(m => t.includes(m))) return s.fields;
  }
  return [];
}

// Construit un résumé lisible des valeurs saisies (stocké dans le champ "quantité"
// existant → aucun changement de modèle de données). Ex. "Cuir · 3 places".
export function buildDetail(fields: PrestaField[], values: Record<string, string>): string {
  return fields
    .map(f => {
      const v = (values[f.key] || "").trim();
      if (!v) return "";
      return f.suffix ? `${v} ${f.suffix}` : v;
    })
    .filter(Boolean)
    .join(" · ");
}
