import { getSettingJSON, majSettingJSON } from "./settings";

// Demandes de matériel des prestataires — stockées dans settings (clé JSONB),
// donc AUCUNE nouvelle table à créer.
const KEY = "stock_demandes";

export interface Demande {
  id: string;
  at: string;              // ISO
  prestataireId: string;
  prestataireNom: string;
  categorie: string;       // Textile, Vitres, Brosses, Produits, Autre…
  quantite: string;        // libre (optionnel)
  details: string;         // précision libre
  statut: "NOUVELLE" | "TRAITEE";
}

export async function getDemandes(): Promise<Demande[]> {
  const list = await getSettingJSON<Demande[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

// Relecture fraîche → modification → écriture (lève une erreur si échec).
async function maj(fn: (list: Demande[]) => Demande[]): Promise<Demande[]> {
  return majSettingJSON<Demande[]>(KEY, [], l => fn(Array.isArray(l) ? l : []).slice(-500));
}

export async function addDemande(d: Omit<Demande, "id" | "at" | "statut">): Promise<Demande> {
  const demande: Demande = {
    ...d,
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
    at: new Date().toISOString(),
    statut: "NOUVELLE",
  };
  await maj(list => [...list, demande]);
  return demande;
}

export async function setDemandeStatut(id: string, statut: "NOUVELLE" | "TRAITEE"): Promise<Demande[]> {
  return maj(list => list.map(x => x.id === id ? { ...x, statut } : x));
}

export async function removeDemande(id: string): Promise<Demande[]> {
  return maj(list => list.filter(x => x.id !== id));
}
