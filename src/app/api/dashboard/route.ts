import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { getDashboardStats } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const stats = await getDashboardStats();
    // L'accueil et Pilotage n'affichent jamais les photos d'intervention : elles
    // représentaient la moitié du poids de la réponse (historique complet).
    const sansPhotos = <T extends { photos?: unknown }>(l: T[]) => l.map(({ photos: _photos, ...p }) => p); // eslint-disable-line @typescript-eslint/no-unused-vars
    // Historique : TOUT l'archivé reste envoyé (CA total, graphiques, export CSV),
    // mais réduit aux champs lus par l'accueil (export + finance.ts) et Pilotage
    // (top clients, types) — message, commentaire, liens, tags… n'y sont jamais affichés.
    const archive = stats.archive.map(p => ({
      row: p.row, date: p.date, heure: p.heure, nom: p.nom, prenom: p.prenom, tel: p.tel, email: p.email,
      typePresta: p.typePresta, quantite: p.quantite, adresse: p.adresse, prix: p.prix,
      modePaiement: p.modePaiement, prestataire: p.prestataire, satisfaction: p.satisfaction, avis: p.avis,
      archiveReason: p.archiveReason, commission: p.commission, commissionType: p.commissionType,
    }));
    return NextResponse.json({ ...stats, prestations: sansPhotos(stats.prestations), archive });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
