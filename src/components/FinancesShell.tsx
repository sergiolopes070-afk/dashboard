// Composant SERVEUR (pas de "use client") : enveloppe des pages Finances.
// Peut ajouter un onglet aux onglets Finances selon la session (décision et
// contenu fournis par lib/require-auth). Sinon il rend ses enfants tels quels :
// rien n'est envoyé au navigateur.
import { ongletFinancesExtra } from "@/lib/require-auth";
import { TabsSlotProvider } from "@/components/TabsSlot";

// Icône (tracé « landmark » de lucide-react), rendue côté serveur.
function TabIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 18v-7" />
      <path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z" />
      <path d="M14 18v-7" />
      <path d="M18 18v-7" />
      <path d="M3 22h18" />
      <path d="M6 18v-7" />
    </svg>
  );
}

export default async function FinancesShell({ children }: { children: React.ReactNode }) {
  const tab = await ongletFinancesExtra();
  if (!tab) return <>{children}</>;
  return <TabsSlotProvider tab={{ ...tab, icone: <TabIcon /> }}>{children}</TabsSlotProvider>;
}
