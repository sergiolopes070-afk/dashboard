// GET /api/banque/resume?annee=AAAA → synthèse mensuelle des relevés + CA encaissé
// du tableau de bord (archive, mêmes règles que Pilotage : lib/finance.ts), lecture seule.
// Réservé à la session patron privée (404 sinon).
import { NextResponse } from "next/server";
import { requirePrive } from "@/lib/require-auth";
import { CATEGORIE_ENCAISSEMENT, type MoisBanque } from "@/lib/banque";
import { sb, chargerOperations, reponseErreur, verifierErreur } from "@/lib/banque-serveur";
import { getArchive } from "@/lib/sheets";
import { caRealise, periodeMois } from "@/lib/finance";

export const dynamic = "force-dynamic";


const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: Request) {
  const refus = await requirePrive();
  if (refus) return refus;
  try {
    const anneeParam = Number(new URL(req.url).searchParams.get("annee"));
    const annee = Number.isInteger(anneeParam) && anneeParam > 1990 && anneeParam < 2100 ? anneeParam : new Date().getFullYear();

    const [ops, archive, bornes] = await Promise.all([
      chargerOperations({ du: `${annee}-01-01`, au: `${annee}-12-31` }),
      getArchive().catch(() => null),
      Promise.all([
        sb().from("banque_operations").select("date").order("date", { ascending: true }).limit(1),
        sb().from("banque_operations").select("date").order("date", { ascending: false }).limit(1),
      ]),
    ]);
    for (const b of bornes) verifierErreur(b.error);
    const premiere = bornes[0].data?.[0]?.date as string | undefined;
    const derniere = bornes[1].data?.[0]?.date as string | undefined;
    const anneesDisponibles: number[] = [];
    if (premiere && derniere) for (let a = Number(derniere.slice(0, 4)); a >= Number(premiere.slice(0, 4)); a--) anneesDisponibles.push(a);

    const mois: MoisBanque[] = Array.from({ length: 12 }, (_, m) => {
      const { debut, fin } = periodeMois(annee, m);
      return {
        mois: debut.slice(0, 7), entrees: 0, sorties: 0, net: 0, encaissementsClients: 0, internes: 0,
        caDashboard: archive ? r2(caRealise(archive, debut, fin)) : null, nb: 0, parCategorie: {},
      };
    });
    for (const o of ops) {
      const m = mois[Number(o.date.slice(5, 7)) - 1];
      if (!m) continue;
      m.nb++;
      if (o.interne) { if (o.montant < 0) m.internes += -o.montant; continue; }
      const cat = o.categorie || "Autre";
      const c = (m.parCategorie[cat] ||= { entrees: 0, sorties: 0 });
      if (o.montant > 0) {
        m.entrees += o.montant; c.entrees += o.montant;
        if (cat === CATEGORIE_ENCAISSEMENT) m.encaissementsClients += o.montant;
      } else { m.sorties += -o.montant; c.sorties += -o.montant; }
    }
    for (const m of mois) {
      m.entrees = r2(m.entrees); m.sorties = r2(m.sorties); m.net = r2(m.entrees - m.sorties);
      m.encaissementsClients = r2(m.encaissementsClients); m.internes = r2(m.internes);
      for (const c of Object.values(m.parCategorie)) { c.entrees = r2(c.entrees); c.sorties = r2(c.sorties); }
    }
    const devisesAutres = Array.from(new Set(ops.map(o => (o.devise || "EUR").toUpperCase()).filter(d => d !== "EUR")));
    return NextResponse.json({ annee, anneesDisponibles, devisesAutres, mois });
  } catch (e) {
    return reponseErreur(e);
  }
}
