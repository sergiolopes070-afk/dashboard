"use client";
import { createContext, useContext } from "react";

// Onglet supplémentaire optionnel pour un groupe d'onglets (ex. FinancesTabs).
// Générique : lien, libellé et icône sont fournis par un composant serveur
// parent, seulement s'il le décide. Sans fournisseur, rien ne change.
export interface TabSlot { href: string; label: string; icone?: React.ReactNode; }

const Ctx = createContext<TabSlot | null>(null);

export function TabsSlotProvider({ tab, children }: { tab: TabSlot; children: React.ReactNode }) {
  return <Ctx.Provider value={tab}>{children}</Ctx.Provider>;
}

export const useTabsSlot = () => useContext(Ctx);
