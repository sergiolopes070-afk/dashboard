import { getSettingJSON, setSettingRaw } from "./settings";

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

async function save(list: Demande[]): Promise<void> {
  await setSettingRaw(KEY, JSON.stringify(list.slice(-500)));
}

export async function addDemande(d: Omit<Demande, "id" | "at" | "statut">): Promise<Demande> {
  const list = await getDemandes();
  const demande: Demande = {
    ...d,
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
    at: new Date().toISOString(),
    statut: "NOUVELLE",
  };
  await save([...list, demande]);
  return demande;
}

export async function setDemandeStatut(id: string, statut: "NOUVELLE" | "TRAITEE"): Promise<Demande[]> {
  const list = (await getDemandes()).map(x => x.id === id ? { ...x, statut } : x);
  await save(list);
  return list;
}

export async function removeDemande(id: string): Promise<Demande[]> {
  const list = (await getDemandes()).filter(x => x.id !== id);
  await save(list);
  return list;
}
