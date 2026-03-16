// ============================================================
// KINOUCLEAN DASHBOARD – Constantes et types
// ============================================================

export type StatutClient =
  | "EMAIL ENVOYÉ"
  | "CONFIRMÉ"
  | "TERMINÉ"
  | "ANNULÉ"
  | "PRESTATAIRE REFUSÉ – À RÉAFFECTER"
  | "";

export type StatutPresta =
  | "EN ATTENTE PRESTA"
  | "ACCEPTÉ"
  | "REFUSÉ"
  | "";

export interface Prestation {
  row: string; // UUID (prestation id)
  clientId: string; // UUID (client id)
  timestamp: string;
  nom: string;
  prenom: string;
  tel: string;
  email: string;
  typePresta: string;
  quantite: string;
  adresse: string;
  date: string;
  heure: string;
  message: string;
  prix: string;
  envoyer: string;
  statut: StatutClient;
  rappel: string;
  avis: string;
  prestataire: string;
  emailPresta: string;
  commentaire: string;
  statutPresta: StatutPresta;
  lienWA: string;
  genDevis: string;
  devisPDF: string;
}

export interface Prestataire {
  id: string;
  nom: string;
  email: string;
  tel: string;
}

export const STATUT_COLORS: Record<string, string> = {
  "EMAIL ENVOYÉ": "bg-blue-100 text-blue-800",
  "CONFIRMÉ": "bg-green-100 text-green-800",
  "TERMINÉ": "bg-gray-100 text-gray-700",
  "ANNULÉ": "bg-red-100 text-red-800",
  "PRESTATAIRE REFUSÉ – À RÉAFFECTER": "bg-orange-100 text-orange-800",
  "EN ATTENTE PRESTA": "bg-yellow-100 text-yellow-800",
  "ACCEPTÉ": "bg-green-100 text-green-800",
  "REFUSÉ": "bg-red-100 text-red-800",
  "RAPPEL ENVOYÉ": "bg-purple-100 text-purple-800",
};

export const LOGO_URL = "https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f";
