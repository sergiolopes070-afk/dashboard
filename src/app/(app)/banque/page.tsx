// Section privée « Banque » : relevés Qonto / Revolut.
// Composant SERVEUR : toute session autre que la session patron privée reçoit un
// 404 standard (le middleware réécrit déjà la requête vers une URL inexistante ;
// notFound() est une seconde barrière).
import { notFound } from "next/navigation";
import { estSessionPrivee } from "@/lib/require-auth";
import FinancesShell from "@/components/FinancesShell";
import BanqueView from "@/components/banque/BanqueView";

export const dynamic = "force-dynamic";

export default async function BanquePage() {
  if (!(await estSessionPrivee())) notFound();
  return (
    <FinancesShell>
      <BanqueView />
    </FinancesShell>
  );
}
