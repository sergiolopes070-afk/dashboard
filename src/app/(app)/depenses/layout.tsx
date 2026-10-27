// Layout serveur commun des pages Finances (voir components/FinancesShell).
import FinancesShell from "@/components/FinancesShell";

// Toujours rendu à la requête (dépend de la session) — jamais mis en cache statique.
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FinancesShell>{children}</FinancesShell>;
}
