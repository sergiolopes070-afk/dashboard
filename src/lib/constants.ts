// ============================================================
// KINOUCLEAN DASHBOARD – Constantes et types
// ============================================================

export const SHEET_NAME    = "Clients – Prestationss";
export const SHEET_PRESTA  = "Prestataires";
export const SHEET_ARCHIVE = "Historique Prestations";

export const COL = {
  TIMESTAMP    : 0,   // A
  NOM          : 1,   // B
  PRENOM       : 2,   // C
  TEL          : 3,   // D
  EMAIL        : 4,   // E
  TYPE_PRESTA  : 5,   // F
  QUANTITE     : 6,   // G
  ADRESSE      : 7,   // H
  DATE         : 8,   // I
  HEURE        : 9,   // J
  MESSAGE      : 10,  // K
  PRIX         : 11,  // L
  ENVOYER      : 12,  // M
  STATUT       : 13,  // N
  RAPPEL       : 14,  // O
  AVIS         : 15,  // P
  PRESTATAIRE  : 16,  // Q
  EMAIL_PRESTA : 17,  // R
  COMMENTAIRE  : 18,  // S
  STATUT_PRESTA: 19,  // T
  LIEN_WA      : 20,  // U
  GEN_DEVIS    : 21,  // V
  DEVIS_PDF    : 22,  // W
};

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
  row: number;
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
