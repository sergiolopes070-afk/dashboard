// ============================================================
// KINOUCLEAN DASHBOARD – Constantes et types
// ============================================================

export type StatutClient =
  | "NOUVEAU"
  | "EMAIL ENVOYÉ"
  | "CONFIRMÉ"
  | "EN ATTENTE PRESTA"
  | "PRESTATAIRE REFUSÉ – À RÉAFFECTER"
  | "TERMINÉ"
  | "ANNULÉ"
  | "";

export type StatutPresta =
  | "EN ATTENTE"
  | "ACCEPTÉ"
  | "REFUSÉ"
  | "";

// Interface plate (join clients + prestataires) utilisée par l'UI
export interface Prestation {
  row: string;          // UUID de la prestation
  client_id: string;
  prestataire_id: string | null;
  timestamp: string;    // created_at
  nom: string;          // clients.nom
  prenom: string;       // clients.prenom
  tel: string;          // clients.tel
  email: string;        // clients.email
  typePresta: string;   // type_prestation
  quantite: string;
  adresse: string;      // adresse d'intervention
  date: string;         // DD/MM/YYYY (converti depuis DATE)
  heure: string;        // HH:MM (converti depuis TIME)
  message: string;
  prix: string;         // converti depuis NUMERIC
  envoyer: string;      // "OUI" si mail_client_envoye = true
  statut: StatutClient;
  rappel: string;       // "OUI" si rappel_j1_envoye = true
  avis: string;
  prestataire: string;  // prestataires.nom
  emailPresta: string;  // prestataires.email
  commentaire: string;
  statutPresta: StatutPresta;
  lienWA: string;
  genDevis: string;     // "FAIT" si devis_genere = true
  devisPDF: string;     // devis_url
  commission: string;   // "50%" ou "50" (converti depuis DECIMAL + type)
  raisonArchivage: string;
}

export interface Prestataire {
  id: string;
  nom: string;
  email: string;
  tel: string;          // tel_wa
}

export interface Client {
  id: string;
  prenom: string;
  nom: string;
  tel: string;
  email: string;
  adresse: string;
  source: string;
  statut: string;
  tags: string[];
  notes: string;
  total_ca: number;
  nb_prestations: number;
  created_at: string;
}

export const STATUT_COLORS: Record<string, string> = {
  "NOUVEAU"                            : "bg-gray-100 text-gray-600",
  "EMAIL ENVOYÉ"                       : "bg-blue-100 text-blue-800",
  "CONFIRMÉ"                           : "bg-green-100 text-green-800",
  "TERMINÉ"                            : "bg-gray-100 text-gray-700",
  "ANNULÉ"                             : "bg-red-100 text-red-800",
  "PRESTATAIRE REFUSÉ – À RÉAFFECTER"  : "bg-orange-100 text-orange-800",
  "EN ATTENTE"                         : "bg-yellow-100 text-yellow-800",
  "EN ATTENTE PRESTA"                  : "bg-yellow-100 text-yellow-800",
  "ACCEPTÉ"                            : "bg-green-100 text-green-800",
  "REFUSÉ"                             : "bg-red-100 text-red-800",
  "RAPPEL ENVOYÉ"                      : "bg-purple-100 text-purple-800",
};

export const LOGO_URL = "https://lh3.googleusercontent.com/d/1JeOWpfLrxjZqlglaN7ayL460GTET432f";
