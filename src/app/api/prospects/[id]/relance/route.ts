import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getSettingJSON, setSettingRaw } from "@/lib/settings";
import { sendProspectRelanceEmail, sendDevisEmail, sendProspectInfosEmail } from "@/lib/mailer";
import { buildProspectDevis } from "@/lib/prospectDevis";
import { frParis, isoParis } from "@/lib/dateParis";
import { prochaineRelanceApresEnvoi } from "@/lib/prospectRelance";
import { estWaEtape, waLibelle } from "@/lib/waMessages";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // génération PDF (Chromium) incluse

// Suivi commercial d'un prospect (devis envoyé + relances manuelles), stocké dans
// settings/prospects_suivi (aucune colonne DB à créer).
//   POST { action: "devis_envoye" }       → ENVOIE le devis par email (devis joint), marque envoyé + date, statut → CONTACTÉ.
//   POST { action: "set_avance", value }   → active/désactive l'avance immédiate (défaut : activée).
//   POST { action: "relance" }             → envoie la relance suivante (1→2→3), statut → RELANCÉ.
//   POST { action: "set_auto", value }     → active/désactive les relances AUTOMATIQUES (aucun email).
//   POST { action: "wa_envoye", etape }    → note qu'un message WhatsApp (lien wa.me) a été envoyé
//                                            pour l'étape (ex. "devis-R2") + ligne au journal. Aucun email.
// Après chaque envoi manuel, la prochaine relance (date_relance) = prochaine
// échéance automatique si les relances auto sont actives pour ce prospect, sinon demain.
const SUIVI_KEY = "prospects_suivi";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Suivi = { devisEnvoye?: boolean; devisDate?: string; relanceNiveau?: number; relanceDate?: string; relanceDates?: string[]; devisNum?: string; avanceImmediate?: boolean; infosEnvoye?: boolean; infosDate?: string; infoRelanceNiveau?: number; infoRelanceDates?: string[]; autoRelance?: boolean; autoStop?: string; reponduLe?: string; dernierEnvoiIso?: string } & Record<string, any>;

// Nouvelle séquence (devis ou demande d'infos initiale) : une réponse antérieure ne
// doit plus bloquer les relances auto de cette nouvelle séquence.
const sansArret = (s: Suivi): Suivi => { const c = { ...s }; delete c.autoStop; delete c.reponduLe; return c; };

// Filet de sécurité : un refus de Gmail (mot de passe d'application révoqué, quota
// d'envoi atteint, coupure SMTP…) lève une exception. Sans ce filet, le client
// recevait une page d'erreur illisible et le bouton semblait « ne rien faire ».
export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    return await traiter(req, ctx);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[prospects/relance] échec :", msg);
    // Le plus souvent un refus Gmail (SMTP), mais aussi toute erreur imprévue (ex. wa_envoye).
    return NextResponse.json({ error: `Action impossible : ${msg}` }, { status: 502 });
  }
}

async function traiter(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { id } = params;
  const body = await req.json() as { action?: string; value?: boolean; unmark?: boolean; etape?: string };
  const { action } = body;

  const all = await getSettingJSON<Record<string, Suivi>>(SUIVI_KEY, {});
  const cur: Suivi = all[id] || {};
  const todayFr = frParis();
  const maintenant = new Date().toISOString();
  // Après chaque envoi, le prospect quitte « à recontacter aujourd'hui » (balle dans
  // le camp du client) : prochaine échéance auto, ou demain si l'auto est coupée.
  const prochaine = async (s: Suivi, statut?: string) => (await prochaineRelanceApresEnvoi(id, s, statut)).date;

  // Active / désactive l'avance immédiate pour ce prospect (impacte le devis + le mail).
  if (action === "set_avance") {
    all[id] = { ...cur, avanceImmediate: !!body.value };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: errSet }, { status: 500 });
    return NextResponse.json({ suivi: all[id] });
  }

  // Active / désactive les relances AUTOMATIQUES pour ce prospect (aucun email envoyé).
  if (action === "set_auto") {
    all[id] = { ...cur, autoRelance: !!body.value };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: errSet }, { status: 500 });
    return NextResponse.json({ suivi: all[id] });
  }

  // WhatsApp envoyé à la main (lien wa.me prérempli) : on le note dans le suivi
  // (waEnvois[etape] = jour) et au journal. Aucun email, aucune reprogrammation.
  if (action === "wa_envoye") {
    const etape = body.etape;
    if (!estWaEtape(etape)) return NextResponse.json({ error: "étape WhatsApp invalide" }, { status: 400 });
    // Relecture juste avant l'écriture : le cron a pu modifier le suivi entre-temps.
    const fresh = await getSettingJSON<Record<string, Suivi>>(SUIVI_KEY, {});
    const freshCur: Suivi = fresh[id] || {};
    fresh[id] = { ...freshCur, waEnvois: { ...(freshCur.waEnvois || {}), [etape]: isoParis() } };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(fresh));
    if (errSet) return NextResponse.json({ error: errSet }, { status: 500 });
    // Journal (commentaires) — sans toucher à la date de relance ni au statut.
    const note = { id: crypto.randomUUID(), date: maintenant, texte: `💬 ${waLibelle(etape)} envoyée par WhatsApp` };
    const { data: row } = await supabase.from("prospects").select("commentaires").eq("id", id).limit(1);
    const existing = Array.isArray(row?.[0]?.commentaires) ? row![0].commentaires : [];
    const { error } = await supabase.from("prospects")
      .update({ commentaires: [...existing, note], updated_at: maintenant }).eq("id", id);
    if (error) return NextResponse.json({ suivi: fresh[id], error: `Suivi noté mais journal non enregistré : ${error.message}` }, { status: 500 });
    return NextResponse.json({ suivi: fresh[id], commentaire: note });
  }

  // Envoie le devis par email (document joint), puis marque « devis envoyé ».
  if (action === "devis_envoye") {
    // Déjà marqué envoyé → simple retrait de la coche (correction manuelle, sans renvoi).
    if (cur.devisEnvoye && body.unmark) {
      all[id] = { ...cur, devisEnvoye: false };
      const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
      if (errSet) return NextResponse.json({ error: errSet }, { status: 500 });
      return NextResponse.json({ suivi: all[id] });
    }

    const built = await buildProspectDevis(id);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
    const dv = built.devis;
    if (!dv.prospect.email) return NextResponse.json({ error: "Ce prospect n'a pas d'adresse email — ajoute-la avant d'envoyer le devis." }, { status: 400 });

    // Devis en vrai PDF (A4, natif react-pdf) ; repli HTML si le rendu échoue.
    let pdf: Buffer | undefined;
    try {
      const { renderDevisPdf } = await import("@/lib/devisPdf");
      pdf = await renderDevisPdf(dv.data);
    } catch (e) {
      console.error("[devis] PDF KO, repli HTML :", e);
    }

    const ok = await sendDevisEmail(dv.prospect.email, {
      prenom: dv.prospect.prenom, nom: dv.prospect.nom, genre: dv.prospect.genre,
      prestation: dv.prestation, prestationVous: dv.prestationVous,
      totalTTC: dv.totalTTC, rac: dv.rac, avance: dv.avance,
      devisHtml: dv.html, num: dv.num, pdf,
    });
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    // buildProspectDevis a pu écrire le numéro dans le suivi → on relit pour ne rien écraser.
    const fresh = await getSettingJSON<Record<string, Suivi>>(SUIVI_KEY, {});
    const freshCur: Suivi = fresh[id] || {};
    fresh[id] = { ...sansArret(freshCur), devisEnvoye: true, devisDate: todayFr, dernierEnvoiIso: maintenant };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(fresh));
    if (errSet) return NextResponse.json({ error: `Devis envoyé mais suivi non enregistré : ${errSet}` }, { status: 500 });
    // Devis envoyé → reprogrammé à la 1re relance auto (ou demain) + sortie de « Nouveau ».
    const demainIso = await prochaine(fresh[id]);
    await supabase.from("prospects").update({ date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    await supabase.from("prospects").update({ statut: "CONTACTÉ", updated_at: new Date().toISOString() }).eq("id", id).eq("statut", "NOUVEAU");
    return NextResponse.json({ suivi: fresh[id], sent: true, pdf: !!pdf, dateRelance: demainIso });
  }

  if (action === "relance") {
    const { data: p } = await supabase
      .from("prospects").select("prenom, nom, genre, email, type_presta, besoins, budget").eq("id", id).single();
    if (!p) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    if (!p.email) return NextResponse.json({ error: "Ce prospect n'a pas d'adresse email." }, { status: 400 });

    const niveau = Math.min((cur.relanceNiveau || 0) + 1, 3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const besoins: any[] = Array.isArray(p.besoins) ? p.besoins : [];
    const prestation = (besoins[0]?.typePresta as string) || (p.type_presta as string) || "";
    const prix = (besoins[0]?.prix as string) || (p.budget as string) || "";

    const ok = await sendProspectRelanceEmail(p.email as string, niveau, {
      prenom: (p.prenom as string) || "", nom: (p.nom as string) || "", genre: (p.genre as string) || "",
      prestation, devisDate: cur.devisDate, prix,
    });
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    const relanceDates = [...(cur.relanceDates || [])]; relanceDates[niveau - 1] = todayFr;
    all[id] = { ...cur, relanceNiveau: niveau, relanceDate: maintenant, relanceDates, dernierEnvoiIso: maintenant };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: `Relance envoyée mais suivi non enregistré : ${errSet}` }, { status: 500 });
    // Relance envoyée → reprogrammée à l'échéance auto suivante (ou demain).
    const demainIso = await prochaine(all[id], "RELANCÉ");
    await supabase.from("prospects").update({ statut: "RELANCÉ", date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: all[id], niveau, dateRelance: demainIso });
  }

  // ── Parcours « demande d'informations » (prospect injoignable) ──
  // demande_infos = envoi initial ; relance_infos = relance 1→3. Clôture auto
  // gérée comme les autres relances (via relanceDate, 3 j après la dernière).
  if (action === "demande_infos" || action === "relance_infos") {
    const { data: p } = await supabase
      .from("prospects").select("prenom, nom, genre, email, type_presta, besoins").eq("id", id).single();
    if (!p) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    if (!p.email) return NextResponse.json({ error: "Ce prospect n'a pas d'adresse email — ajoute-la avant d'envoyer la demande d'infos." }, { status: 400 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const besoins: any[] = Array.isArray(p.besoins) ? p.besoins : [];
    const typePresta = (besoins[0]?.typePresta as string) || (p.type_presta as string) || "";
    const prenom = (p.prenom as string) || "";
    const nom = (p.nom as string) || "";
    const genre = (p.genre as string) || "";

    const niveau = action === "demande_infos" ? 0 : Math.min((cur.infoRelanceNiveau || 0) + 1, 3);
    const ok = await sendProspectInfosEmail(p.email as string, niveau, { prenom, nom, genre, typePresta });
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    if (action === "demande_infos") {
      all[id] = { ...sansArret(cur), infosEnvoye: true, infosDate: todayFr, infoRelanceNiveau: 0, dernierEnvoiIso: maintenant };
      if (!cur.devisEnvoye) await supabase.from("prospects").update({ statut: "CONTACTÉ", updated_at: new Date().toISOString() }).eq("id", id).eq("statut", "NOUVEAU");
    } else {
      const infoRelanceDates = [...(cur.infoRelanceDates || [])]; infoRelanceDates[niveau - 1] = todayFr;
      all[id] = { ...cur, infoRelanceNiveau: niveau, relanceDate: maintenant, infoRelanceDates, dernierEnvoiIso: maintenant };
      await supabase.from("prospects").update({ statut: "RELANCÉ", updated_at: new Date().toISOString() }).eq("id", id);
    }
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: `Email envoyé mais suivi non enregistré : ${errSet}` }, { status: 500 });
    // Dans tous les cas : reprogrammé (quitte « aujourd'hui ») — échéance auto ou demain.
    const demainIso = await prochaine(all[id], action === "relance_infos" ? "RELANCÉ" : undefined);
    await supabase.from("prospects").update({ date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: all[id], niveau, dateRelance: demainIso });
  }

  // ── Relance « auto » depuis le tableau de bord : envoie le bon mail selon l'état
  // (devis déjà envoyé → relance devis ; demande d'infos envoyée → relance infos ;
  // sinon → demande d'infos initiale) et REPROGRAMME la relance à demain (sort de
  // « en retard »). Un seul clic, le serveur choisit le bon contenu.
  if (action === "relance_auto") {
    const { data: p } = await supabase
      .from("prospects").select("prenom, nom, genre, email, type_presta, besoins, budget").eq("id", id).single();
    if (!p) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    if (!p.email) return NextResponse.json({ error: "Ce prospect n'a pas d'adresse email." }, { status: 400 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const besoins: any[] = Array.isArray(p.besoins) ? p.besoins : [];
    const prenom = (p.prenom as string) || "", nom = (p.nom as string) || "", genre = (p.genre as string) || "";
    const typePresta = (besoins[0]?.typePresta as string) || (p.type_presta as string) || "";
    const prix = (besoins[0]?.prix as string) || (p.budget as string) || "";

    let ok = false; let suiviNext: Suivi; let libelle: string;
    if (cur.devisEnvoye) {
      const niveau = Math.min((cur.relanceNiveau || 0) + 1, 3);
      ok = await sendProspectRelanceEmail(p.email as string, niveau, { prenom, nom, genre, prestation: typePresta, devisDate: cur.devisDate, prix });
      const relanceDates = [...(cur.relanceDates || [])]; relanceDates[niveau - 1] = todayFr;
      suiviNext = { ...cur, relanceNiveau: niveau, relanceDate: maintenant, relanceDates, dernierEnvoiIso: maintenant };
      libelle = `Relance devis R${niveau}`;
    } else if (cur.infosEnvoye) {
      const niveau = Math.min((cur.infoRelanceNiveau || 0) + 1, 3);
      ok = await sendProspectInfosEmail(p.email as string, niveau, { prenom, nom, genre, typePresta });
      const infoRelanceDates = [...(cur.infoRelanceDates || [])]; infoRelanceDates[niveau - 1] = todayFr;
      suiviNext = { ...cur, infoRelanceNiveau: niveau, relanceDate: maintenant, infoRelanceDates, dernierEnvoiIso: maintenant };
      libelle = `Relance infos R${niveau}`;
    } else {
      ok = await sendProspectInfosEmail(p.email as string, 0, { prenom, nom, genre, typePresta });
      suiviNext = { ...sansArret(cur), infosEnvoye: true, infosDate: todayFr, infoRelanceNiveau: 0, dernierEnvoiIso: maintenant };
      libelle = "Demande d'infos";
    }
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    all[id] = suiviNext;
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: `Email envoyé mais suivi non enregistré : ${errSet}` }, { status: 500 });
    // Reprogramme la prochaine relance (échéance auto ou demain) + statut Relancé.
    const demainIso = await prochaine(suiviNext, "RELANCÉ");
    await supabase.from("prospects").update({ statut: "RELANCÉ", date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: all[id], dateRelance: demainIso, libelle, email: p.email });
  }

  return NextResponse.json({ error: "action invalide" }, { status: 400 });
}
