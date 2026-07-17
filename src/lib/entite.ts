// ─────────────────────────────────────────────────────────────────────────────
// Entité juridique (Phase 3b — double axe entité).
// Deux sociétés distinctes : Kinouclean SAS (ménage/textile, agréé SAP) et
// Kinourent (nettoyage de véhicules, TVA 20%). L'entité se DÉDUIT du type de
// prestation, avec correction manuelle possible (voir override dans settings).
// ─────────────────────────────────────────────────────────────────────────────

export type Entite = "Kinouclean SAS" | "Kinourent";
export const ENTITES: Entite[] = ["Kinouclean SAS", "Kinourent"];

// Déduit l'entité à partir du type de prestation.
// Véhicule / auto / voiture → Kinourent ; tout le reste → Kinouclean SAS.
export function getEntite(typePresta: string): Entite {
  const t = (typePresta || "").toLowerCase();
  if (/v[ée]hicule|voiture|\bauto\b|\bcar\b|detailing/.test(t)) return "Kinourent";
  return "Kinouclean SAS";
}

// Résout l'entité en tenant compte d'une éventuelle correction manuelle.
export function resolveEntite(prestationId: string, typePresta: string, overrides?: Record<string, Entite>): Entite {
  const forced = overrides?.[prestationId];
  return forced || getEntite(typePresta);
}

export const ENTITE_BADGE: Record<Entite, string> = {
  "Kinouclean SAS": "bg-blue-100 text-blue-700 border-blue-200",
  "Kinourent":      "bg-amber-100 text-amber-700 border-amber-200",
};

export const ENTITE_SHORT: Record<Entite, string> = {
  "Kinouclean SAS": "SAS",
  "Kinourent":      "Kinourent",
};

// Clé de correction manuelle dans la table `settings`.
export const ENTITE_OVERRIDE_KEY = "entite_override";
