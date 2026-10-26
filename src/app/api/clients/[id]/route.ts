import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { insertPrestationForClient } from "@/lib/sheets";
import { getInscrits, estInscrit } from "@/lib/avanceInscrits";
import { estAnnulation, STATUT_ANNULE } from "@/lib/constants";

export const dynamic = "force-dynamic";

function isoToFr(s: string | null): string {
  if (!s) return "";
  const p = s.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

// Renvoie une fiche client complète (coordonnées + TOUT l'historique, archivé inclus).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  // Les 3 lectures sont indépendantes → en parallèle (fiche plus rapide à l'ouverture).
  const [clientRes, prestasRes, inscritsList] = await Promise.all([
    supabase.from("clients")
      .select("id, nom, prenom, tel, email, adresse, tags, notes, created_at")
      .eq("id", params.id).single(),
    supabase.from("prestations")
      // `*` : certaines colonnes optionnelles (stripe_payment_url…) peuvent manquer selon
      // le schéma — une liste explicite ferait échouer toute la requête (historique vide).
      .select("*, prestataires(nom)")
      .eq("client_id", params.id),
    getInscrits(),
  ]);
  const client = clientRes.data;
  if (clientRes.error || !client) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  const { data: prestas } = prestasRes;
  if (prestasRes.error) console.error("Fiche client — prestations :", prestasRes.error.message);

  // Tri chronologique décroissant (plus récente d'abord), dates vides en dernier
  // (un ORDER BY desc de Postgres mettrait les NULL en tête).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [...(prestas || [])].sort((a, b) =>
    (b.date_intervention || "").localeCompare(a.date_intervention || "") || (b.created_at || "").localeCompare(a.created_at || ""));
  const prestations = rows.map(p => ({
    row         : p.id as string,
    typePresta  : p.type_prestation || "",
    date        : isoToFr(p.date_intervention),
    heure       : (p.heure_intervention || "").substring(0, 5),
    prix        : p.prix != null ? String(p.prix) : "",
    prestataire : Array.isArray(p.prestataires) ? (p.prestataires[0]?.nom || "") : (p.prestataires?.nom || ""),
    modePaiement: p.mode_paiement || "",
    statut      : p.statut || "",
    archived    : !!p.archive,
    photos      : Array.isArray(p.photos) ? p.photos : [],
    satisfaction: p.satisfaction != null ? Number(p.satisfaction) : undefined,
    statutPresta: p.statut_presta || "",
    adresse     : p.adresse || "",
    quantite    : p.quantite != null ? String(p.quantite) : "",
    message     : p.message || "",
    commentaire : p.commentaire || "",
    devisUrl    : p.devis_url || "",
    devisGenere : !!p.devis_genere,
    stripePaymentUrl: p.stripe_payment_url || "",
  }));

  // Annulations exclues (règles partagées, constants.ts) : archivées avec un motif
  // d'annulation, ou statut ANNULÉ pas encore archivé.
  const totalCA = rows
    .filter(p => !(p.archive && estAnnulation(p.archive_reason)) && p.statut !== STATUT_ANNULE)
    .reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);

  // Dernière intervention = date passée (ou du jour) la plus récente — comparée en
  // ISO (chronologique), pas en dd/mm/yyyy. Les RDV futurs vont dans « Prochain RDV ».
  const todayIso = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const derniere = isoToFr(rows.find(p => p.date_intervention && p.date_intervention <= todayIso)?.date_intervention || null);

  // Inscription à l'Avance Immédiate (détectée via les emails d'AIS) → badge vert.
  // Affichage du badge : on accepte aussi le rapprochement par prénom + nom.
  const insc = estInscrit(inscritsList, client.tel, client.email, { prenom: client.prenom, nom: client.nom });

  return NextResponse.json({
    clientId   : client.id,
    nom        : client.nom    || "",
    prenom     : client.prenom || "",
    tel        : client.tel    || "",
    email      : client.email  || "",
    adresse    : client.adresse || "",
    prestations,
    totalCA,
    derniere,
    creeLe     : client.created_at || "",
    tags       : Array.isArray(client.tags) ? client.tags : [],
    notes      : Array.isArray(client.notes) ? client.notes : [],
    avanceInscrit    : !!insc,
    avanceInscritDate: insc?.at || "",
  });
}

// POST : ajoute un nouveau RDV / prestation à ce client (reprogrammation).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const b = await req.json() as { typePresta?: string; date?: string; heure?: string; prix?: string; message?: string };
    const id = await insertPrestationForClient(params.id, {
      typePresta: b.typePresta || "",
      date      : b.date       || "",
      heure     : b.heure      || "",
      prix      : b.prix       || "",
      message   : b.message    || "",
    });
    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
