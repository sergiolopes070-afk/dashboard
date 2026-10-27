// POST /api/banque/import            → importe un relevé CSV (Qonto / Revolut)
// POST /api/banque/import?apercu=1   → lecture seule : lignes lues + doublons, rien n'est écrit
// Corps JSON : { texte: string, fichier?: string, compte?: "qonto" | "revolut" }
// Réservé à la session patron privée (404 sinon).
import { NextResponse } from "next/server";
import { requirePrive } from "@/lib/require-auth";
import { COMPTES_BANQUE, type CompteBanque, lireReleve, libelleFormat } from "@/lib/banque";
import {
  sb, chargerRegles, empreintesExistantes, preparer, apparierVirements, nbOperationsPeriode, reponseErreur, verifierErreur,
} from "@/lib/banque-serveur";

export const dynamic = "force-dynamic";

const TAILLE_MAX = 5_000_000; // ~5 Mo de texte CSV

export async function POST(req: Request) {
  const refus = await requirePrive();
  if (refus) return refus;
  try {
    const apercu = new URL(req.url).searchParams.get("apercu") === "1";
    const body = await req.json().catch(() => null) as { texte?: unknown; fichier?: unknown; compte?: unknown } | null;
    const texte = typeof body?.texte === "string" ? body.texte : "";
    if (!texte.trim()) return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
    if (texte.length > TAILLE_MAX) return NextResponse.json({ error: "Fichier trop volumineux (5 Mo max)." }, { status: 400 });
    const fichier = typeof body?.fichier === "string" ? body.fichier.slice(0, 200) : null;

    let lecture;
    try { lecture = lireReleve(texte); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Fichier illisible." }, { status: 400 }); }

    const compte: CompteBanque = COMPTES_BANQUE.includes(body?.compte as CompteBanque) ? body!.compte as CompteBanque : lecture.compte;
    const regles = await chargerRegles();
    const lignes = preparer(compte, lecture.lignes, regles);
    const existantes = await empreintesExistantes(lignes.map(l => l.empreinte));
    const nouvelles = lignes.filter(l => !existantes.has(l.empreinte));

    if (apercu) {
      // Sans identifiant de transaction, l'anti-doublon repose sur date/montant/libellé :
      // on prévient si la période du fichier recoupe des opérations déjà importées.
      let avertissement: string | null = null;
      if (!lecture.avecIdentifiants && lignes.length) {
        const dates = lignes.map(l => l.date).sort();
        const du = dates[0], au = dates[dates.length - 1];
        const deja = await nbOperationsPeriode(compte, du, au);
        if (deja > 0) {
          avertissement = `Ce fichier n'a pas d'identifiant de transaction et sa période (${du.split("-").reverse().join("/")} → ${au.split("-").reverse().join("/")}) recoupe ${deja} opération(s) déjà importée(s) sur ce compte : les doublons sont détectés par date, montant et libellé — vérifie l'aperçu avant d'importer.`;
        }
      }
      return NextResponse.json({
        avertissement,
        ignoreesDetail: lecture.ignoreesDetail,
        format: lecture.format,
        formatLibelle: libelleFormat(lecture.format),
        compteDetecte: lecture.compte,
        compte,
        nbLignes: lignes.length,
        nbNouvelles: nouvelles.length,
        nbDoublons: lignes.length - nouvelles.length,
        nbIgnorees: lecture.ignorees,
        lignes: lignes.map(l => ({
          date: l.date, libelle: l.libelle, contrepartie: l.contrepartie, montant: l.montant, devise: l.devise,
          categorie: l.categorie, interne: l.interne, doublon: existantes.has(l.empreinte),
        })),
      });
    }

    // 1) Trace de l'import
    const { data: imp, error: eImp } = await sb().from("banque_imports")
      .insert({ compte, fichier, nb_lignes: lignes.length, nb_nouvelles: 0 })
      .select("id").single();
    verifierErreur(eImp);
    const importId = imp!.id as string;

    // 2) Nouvelles opérations (ignoreDuplicates : filet de sécurité si double clic)
    const nouveauxIds: string[] = [];
    for (let i = 0; i < nouvelles.length; i += 500) {
      const lot = nouvelles.slice(i, i + 500).map(l => ({
        compte, date: l.date, libelle: l.libelle, contrepartie: l.contrepartie, montant: l.montant,
        devise: l.devise || "EUR", categorie: l.categorie, interne: l.interne, empreinte: l.empreinte, import_id: importId,
        type_op: l.typeOp || null,
      }));
      const { data, error } = await sb().from("banque_operations")
        .upsert(lot, { onConflict: "empreinte", ignoreDuplicates: true }).select("id");
      verifierErreur(error);
      for (const r of data || []) nouveauxIds.push(r.id as string);
    }
    const { error: eMaj } = await sb().from("banque_imports").update({ nb_nouvelles: nouveauxIds.length }).eq("id", importId);
    verifierErreur(eMaj);

    // 3) Virements internes Qonto ↔ Revolut
    const paires = await apparierVirements(nouveauxIds);

    return NextResponse.json({
      success: true, importId, nbLignes: lignes.length, nbNouvelles: nouveauxIds.length, nbDoublons: lignes.length - nouveauxIds.length,
      virementsApparies: paires.appliques, virementsSuggeres: paires.suggeres,
    });
  } catch (e) {
    return reponseErreur(e);
  }
}
