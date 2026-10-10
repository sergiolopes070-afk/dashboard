import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getSettingJSON, setSettingRaw } from "@/lib/settings";
import { sendProspectRelanceEmail, sendDevisEmail, sendProspectInfosEmail } from "@/lib/mailer";
import { buildProspectDevis } from "@/lib/prospectDevis";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // génération PDF (Chromium) incluse

// Suivi commercial d'un prospect (devis envoyé + relances manuelles), stocké dans
// settings/prospects_suivi (aucune colonne DB à créer).
//   POST { action: "devis_envoye" }       → ENVOIE le devis par email (devis joint), marque envoyé + date, statut → CONTACTÉ.
//   POST { action: "set_avance", value }   → active/désactive l'avance immédiate (défaut : activée).
//   POST { action: "relance" }             → envoie la relance suivante (1→2→3), statut → RELANCÉ.
const SUIVI_KEY = "prospects_suivi";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Suivi = { devisEnvoye?: boolean; devisDate?: string; relanceNiveau?: number; relanceDate?: string; devisNum?: string; avanceImmediate?: boolean; infosEnvoye?: boolean; infosDate?: string; infoRelanceNiveau?: number } & Record<string, any>;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { id } = params;
  const body = await req.json() as { action?: string; value?: boolean; unmark?: boolean };
  const { action } = body;

  const all = await getSettingJSON<Record<string, Suivi>>(SUIVI_KEY, {});
  const cur: Suivi = all[id] || {};
  const todayFr = new Date().toLocaleDateString("fr-FR");

  // Active / désactive l'avance immédiate pour ce prospect (impacte le devis + le mail).
  if (action === "set_avance") {
    all[id] = { ...cur, avanceImmediate: !!body.value };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: errSet }, { status: 500 });
    return NextResponse.json({ suivi: all[id] });
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
    fresh[id] = { ...freshCur, devisEnvoye: true, devisDate: todayFr };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(fresh));
    if (errSet) return NextResponse.json({ error: `Devis envoyé mais suivi non enregistré : ${errSet}` }, { status: 500 });
    await supabase.from("prospects").update({ statut: "CONTACTÉ", updated_at: new Date().toISOString() }).eq("id", id).eq("statut", "NOUVEAU");
    return NextResponse.json({ suivi: fresh[id], sent: true, pdf: !!pdf });
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

    all[id] = { ...cur, relanceNiveau: niveau, relanceDate: new Date().toISOString() };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: `Relance envoyée mais suivi non enregistré : ${errSet}` }, { status: 500 });
    await supabase.from("prospects").update({ statut: "RELANCÉ", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: all[id], niveau });
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
      all[id] = { ...cur, infosEnvoye: true, infosDate: todayFr, infoRelanceNiveau: 0 };
      if (!cur.devisEnvoye) await supabase.from("prospects").update({ statut: "CONTACTÉ", updated_at: new Date().toISOString() }).eq("id", id).eq("statut", "NOUVEAU");
    } else {
      all[id] = { ...cur, infoRelanceNiveau: niveau, relanceDate: new Date().toISOString() };
      await supabase.from("prospects").update({ statut: "RELANCÉ", updated_at: new Date().toISOString() }).eq("id", id);
    }
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: `Email envoyé mais suivi non enregistré : ${errSet}` }, { status: 500 });
    return NextResponse.json({ suivi: all[id], niveau });
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
    const demain = new Date(); demain.setDate(demain.getDate() + 1);
    const demainIso = demain.toISOString().split("T")[0];

    let ok = false; let suiviNext: Suivi;
    if (cur.devisEnvoye) {
      const niveau = Math.min((cur.relanceNiveau || 0) + 1, 3);
      ok = await sendProspectRelanceEmail(p.email as string, niveau, { prenom, nom, genre, prestation: typePresta, devisDate: cur.devisDate, prix });
      suiviNext = { ...cur, relanceNiveau: niveau, relanceDate: new Date().toISOString() };
    } else if (cur.infosEnvoye) {
      const niveau = Math.min((cur.infoRelanceNiveau || 0) + 1, 3);
      ok = await sendProspectInfosEmail(p.email as string, niveau, { prenom, nom, genre, typePresta });
      suiviNext = { ...cur, infoRelanceNiveau: niveau, relanceDate: new Date().toISOString() };
    } else {
      ok = await sendProspectInfosEmail(p.email as string, 0, { prenom, nom, genre, typePresta });
      suiviNext = { ...cur, infosEnvoye: true, infosDate: todayFr, infoRelanceNiveau: 0 };
    }
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    all[id] = suiviNext;
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: `Email envoyé mais suivi non enregistré : ${errSet}` }, { status: 500 });
    // Reprogramme la prochaine relance à demain (quitte « en retard ») + statut Relancé.
    await supabase.from("prospects").update({ statut: "RELANCÉ", date_relance: demainIso, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: all[id], dateRelance: demainIso });
  }

  return NextResponse.json({ error: "action invalide" }, { status: 400 });
}
