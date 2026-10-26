import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { lireSettingJSONStrict, majSettingJSON } from "@/lib/settings";
import { sendProspectRelanceEmail, sendDevisEmail, sendProspectInfosEmail } from "@/lib/mailer";
import { remiseAppliqueeProspect } from "@/lib/devisKinou";
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
//   POST { action: "set_remise", remise }  → applique ({ type: "pct"|"eur", valeur, libelle? }) ou
//                                            retire (null) la réduction du devis. Aucun email.
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

// Écriture SÛRE du suivi d'UN prospect : relecture fraîche juste avant l'écriture
// (le cron ou buildProspectDevis ont pu écrire entre-temps) et refus si la lecture
// échoue — un `{}` de repli réécrit effacerait le suivi de TOUS les prospects.
async function ecrireSuivi(id: string, maj: (s: Suivi) => Suivi): Promise<{ suivi: Suivi; error?: undefined } | { suivi?: undefined; error: string }> {
  try {
    const all = await majSettingJSON<Record<string, Suivi>>(SUIVI_KEY, {}, a => { a[id] = maj(a[id] || {}); });
    return { suivi: all[id] };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

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
  const body = await req.json() as { action?: string; value?: boolean; unmark?: boolean; etape?: string; remise?: unknown };
  const { action } = body;

  // Lecture stricte : suivi illisible → on n'envoie rien (sinon niveaux/dates faux).
  const all = await lireSettingJSONStrict<Record<string, Suivi>>(SUIVI_KEY, {});
  if (!all) return NextResponse.json({ error: "Suivi des prospects momentanément illisible — réessaie dans un instant." }, { status: 503 });
  const cur: Suivi = all[id] || {};
  const todayFr = frParis();
  const maintenant = new Date().toISOString();
  // Après chaque envoi, le prospect quitte « à recontacter aujourd'hui » (balle dans
  // le camp du client) : prochaine échéance auto, ou demain si l'auto est coupée.
  const prochaine = async (s: Suivi, statut?: string) => (await prochaineRelanceApresEnvoi(id, s, statut)).date;

  // Active / désactive l'avance immédiate pour ce prospect (impacte le devis + le mail).
  if (action === "set_avance") {
    const w = await ecrireSuivi(id, s => ({ ...s, avanceImmediate: !!body.value }));
    if (!w.suivi) return NextResponse.json({ error: w.error }, { status: 500 });
    return NextResponse.json({ suivi: w.suivi });
  }

  // Applique / retire la réduction du devis (impacte le devis HTML/PDF + le mail). Aucun email.
  if (action === "set_remise") {
    let remise: { type: "pct" | "eur"; valeur: number; libelle?: string } | null = null;
    if (body.remise != null) {
      const r = body.remise as { type?: unknown; valeur?: unknown; libelle?: unknown };
      const type = r.type === "pct" || r.type === "eur" ? r.type : null;
      const valeur = Math.round(Number(r.valeur) * 100) / 100;
      if (!type || !Number.isFinite(valeur)) return NextResponse.json({ error: "Réduction invalide" }, { status: 400 });
      if (type === "pct" && (valeur < 1 || valeur > 50)) return NextResponse.json({ error: "La réduction doit être comprise entre 1 % et 50 %." }, { status: 400 });
      if (type === "eur") {
        if (!(valeur > 0)) return NextResponse.json({ error: "Le montant de la réduction doit être supérieur à 0 €." }, { status: 400 });
        const built = await buildProspectDevis(id);
        if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
        const sousTotal = built.devis.remise?.sousTotalTTC ?? built.devis.totalTTC;
        if (valeur >= sousTotal) return NextResponse.json({ error: `La réduction doit être inférieure au total du devis (${sousTotal.toFixed(2).replace(".", ",")} €).` }, { status: 400 });
      }
      const libelle = typeof r.libelle === "string" ? r.libelle.trim().slice(0, 60) : "";
      remise = { type, valeur, ...(libelle ? { libelle } : {}) };
    }
    // Relecture (ecrireSuivi) : buildProspectDevis a pu écrire le numéro de devis entre-temps.
    const w = await ecrireSuivi(id, s => { const c = { ...s }; if (remise) c.remise = remise; else delete c.remise; return c; });
    if (!w.suivi) return NextResponse.json({ error: w.error }, { status: 500 });
    return NextResponse.json({ suivi: w.suivi });
  }

  // Active / désactive les relances AUTOMATIQUES pour ce prospect (aucun email envoyé).
  if (action === "set_auto") {
    const w = await ecrireSuivi(id, s => ({ ...s, autoRelance: !!body.value }));
    if (!w.suivi) return NextResponse.json({ error: w.error }, { status: 500 });
    return NextResponse.json({ suivi: w.suivi });
  }

  // WhatsApp envoyé à la main (lien wa.me prérempli) : on le note dans le suivi
  // (waEnvois[etape] = jour) et au journal. Aucun email, aucune reprogrammation.
  if (action === "wa_envoye") {
    const etape = body.etape;
    if (!estWaEtape(etape)) return NextResponse.json({ error: "étape WhatsApp invalide" }, { status: 400 });
    // Relecture juste avant l'écriture : le cron a pu modifier le suivi entre-temps.
    const w = await ecrireSuivi(id, s => ({ ...s, waEnvois: { ...(s.waEnvois || {}), [etape]: isoParis() } }));
    if (!w.suivi) return NextResponse.json({ error: w.error }, { status: 500 });
    // Journal (commentaires) — sans toucher à la date de relance ni au statut.
    const note = { id: crypto.randomUUID(), date: maintenant, texte: `💬 ${waLibelle(etape)} envoyée par WhatsApp` };
    const { data: row } = await supabase.from("prospects").select("commentaires").eq("id", id).limit(1);
    const existing = Array.isArray(row?.[0]?.commentaires) ? row![0].commentaires : [];
    const { error } = await supabase.from("prospects")
      .update({ commentaires: [...existing, note], updated_at: maintenant }).eq("id", id);
    if (error) return NextResponse.json({ suivi: w.suivi, error: `Suivi noté mais journal non enregistré : ${error.message}` }, { status: 500 });
    return NextResponse.json({ suivi: w.suivi, commentaire: note });
  }

  // Envoie le devis par email (document joint), puis marque « devis envoyé ».
  if (action === "devis_envoye") {
    // Déjà marqué envoyé → simple retrait de la coche (correction manuelle, sans renvoi).
    if (cur.devisEnvoye && body.unmark) {
      const w = await ecrireSuivi(id, s => ({ ...s, devisEnvoye: false }));
      if (!w.suivi) return NextResponse.json({ error: w.error }, { status: 500 });
      return NextResponse.json({ suivi: w.suivi });
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
      devisHtml: dv.html, num: dv.num, pdf, remise: dv.remise,
    });
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    // buildProspectDevis a pu écrire le numéro dans le suivi → on relit pour ne rien écraser.
    const w = await ecrireSuivi(id, s => ({ ...sansArret(s), devisEnvoye: true, devisDate: todayFr, dernierEnvoiIso: maintenant }));
    if (!w.suivi) return NextResponse.json({ error: `Devis envoyé mais suivi non enregistré : ${w.error}` }, { status: 500 });
    // Devis envoyé → reprogrammé à la 1re relance auto (ou demain) + sortie de « Nouveau ».
    const demainIso = await prochaine(w.suivi);
    await supabase.from("prospects").update({ date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    await supabase.from("prospects").update({ statut: "CONTACTÉ", updated_at: new Date().toISOString() }).eq("id", id).eq("statut", "NOUVEAU");
    return NextResponse.json({ suivi: w.suivi, sent: true, pdf: !!pdf, dateRelance: demainIso });
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
    }, remiseAppliqueeProspect(besoins, p.budget, (p.type_presta as string) || "", cur.remise));
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    const relanceDates = [...(cur.relanceDates || [])]; relanceDates[niveau - 1] = todayFr;
    const w = await ecrireSuivi(id, s => ({ ...s, relanceNiveau: niveau, relanceDate: maintenant, relanceDates, dernierEnvoiIso: maintenant }));
    if (!w.suivi) return NextResponse.json({ error: `Relance envoyée mais suivi non enregistré : ${w.error}` }, { status: 500 });
    // Relance envoyée → reprogrammée à l'échéance auto suivante (ou demain).
    const demainIso = await prochaine(w.suivi, "RELANCÉ");
    await supabase.from("prospects").update({ statut: "RELANCÉ", date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: w.suivi, niveau, dateRelance: demainIso });
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

    let maj: (s: Suivi) => Suivi;
    if (action === "demande_infos") {
      maj = s => ({ ...sansArret(s), infosEnvoye: true, infosDate: todayFr, infoRelanceNiveau: 0, dernierEnvoiIso: maintenant });
      if (!cur.devisEnvoye) await supabase.from("prospects").update({ statut: "CONTACTÉ", updated_at: new Date().toISOString() }).eq("id", id).eq("statut", "NOUVEAU");
    } else {
      const infoRelanceDates = [...(cur.infoRelanceDates || [])]; infoRelanceDates[niveau - 1] = todayFr;
      maj = s => ({ ...s, infoRelanceNiveau: niveau, relanceDate: maintenant, infoRelanceDates, dernierEnvoiIso: maintenant });
      await supabase.from("prospects").update({ statut: "RELANCÉ", updated_at: new Date().toISOString() }).eq("id", id);
    }
    const w = await ecrireSuivi(id, maj);
    if (!w.suivi) return NextResponse.json({ error: `Email envoyé mais suivi non enregistré : ${w.error}` }, { status: 500 });
    // Dans tous les cas : reprogrammé (quitte « aujourd'hui ») — échéance auto ou demain.
    const demainIso = await prochaine(w.suivi, action === "relance_infos" ? "RELANCÉ" : undefined);
    await supabase.from("prospects").update({ date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: w.suivi, niveau, dateRelance: demainIso });
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

    let ok = false; let majNext: (s: Suivi) => Suivi; let libelle: string;
    if (cur.devisEnvoye) {
      const niveau = Math.min((cur.relanceNiveau || 0) + 1, 3);
      ok = await sendProspectRelanceEmail(p.email as string, niveau, { prenom, nom, genre, prestation: typePresta, devisDate: cur.devisDate, prix },
        remiseAppliqueeProspect(besoins, p.budget, (p.type_presta as string) || "", cur.remise));
      const relanceDates = [...(cur.relanceDates || [])]; relanceDates[niveau - 1] = todayFr;
      majNext = s => ({ ...s, relanceNiveau: niveau, relanceDate: maintenant, relanceDates, dernierEnvoiIso: maintenant });
      libelle = `Relance devis R${niveau}`;
    } else if (cur.infosEnvoye) {
      const niveau = Math.min((cur.infoRelanceNiveau || 0) + 1, 3);
      ok = await sendProspectInfosEmail(p.email as string, niveau, { prenom, nom, genre, typePresta });
      const infoRelanceDates = [...(cur.infoRelanceDates || [])]; infoRelanceDates[niveau - 1] = todayFr;
      majNext = s => ({ ...s, infoRelanceNiveau: niveau, relanceDate: maintenant, infoRelanceDates, dernierEnvoiIso: maintenant });
      libelle = `Relance infos R${niveau}`;
    } else {
      ok = await sendProspectInfosEmail(p.email as string, 0, { prenom, nom, genre, typePresta });
      majNext = s => ({ ...sansArret(s), infosEnvoye: true, infosDate: todayFr, infoRelanceNiveau: 0, dernierEnvoiIso: maintenant });
      libelle = "Demande d'infos";
    }
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    const w = await ecrireSuivi(id, majNext);
    if (!w.suivi) return NextResponse.json({ error: `Email envoyé mais suivi non enregistré : ${w.error}` }, { status: 500 });
    // Reprogramme la prochaine relance (échéance auto ou demain) + statut Relancé.
    const demainIso = await prochaine(w.suivi, "RELANCÉ");
    await supabase.from("prospects").update({ statut: "RELANCÉ", date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: w.suivi, dateRelance: demainIso, libelle, email: p.email });
  }

  return NextResponse.json({ error: "action invalide" }, { status: 400 });
}
