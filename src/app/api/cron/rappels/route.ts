import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGmailTransporter, buildRappelMessage, sendRappelEmail } from "@/lib/mailer";
import { getSettingJSON, getSettingRaw, setSettingRaw } from "@/lib/settings";
import { getInscrits, estInscrit } from "@/lib/avanceInscrits";
import {
  isWhatsAppConfigured, sendWhatsAppTemplate, normaliserMobileWA, masquerTel, whatsAppErrorText,
  WA_TEMPLATE_CLIENT, WA_TEMPLATE_PRESTA, WA_TEMPLATE_LANG,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Cron quotidien (veille) : pour les RDV du LENDEMAIN —
//   • email à l'équipe : liste des RDV + liens WhatsApp prêts à cliquer ;
//   • email à chaque prestataire : ses missions du lendemain (sans prix) ;
//   • email récapitulatif AUTOMATIQUE au client : « n'oubliez pas votre RDV »
//     (+ reste à charge si avance immédiate), avec garde anti-doublon.
// Si un client a plusieurs prestations le même jour, elles sont regroupées.
//
// Sécurité : en-tête interne x-vercel-cron (invocation planifiée) OU ?key=<secret>.
// ?test=1 → renvoie le détail JSON sans envoyer l'email.
//
// WhatsApp AUTOMATIQUE (API officielle Meta, modèles approuvés) — OFF par défaut :
// actif seulement si WhatsApp est configuré ET réglage `whatsapp_rappels_actif`
// = "true". Envoie « rappel_rdv_client » au client et « mission_prestataire »
// au prestataire (voir l'ordre des paramètres dans src/lib/whatsapp.ts).
//   • ?test=1 → JSON de ce qui SERAIT envoyé, aucun appel à Meta ;
//   • simulation (cron Vercel sans secret hors fenêtre horaire) → liste seule ;
//   • anti-doublon par prestation + date + destinataire (`whatsapp_rappels_envoye`) ;
//   • dernier passage mémorisé dans `whatsapp_rappels_dernier` + section dans
//     l'email de 18h. L'email reste le filet de sécurité (liens wa.me).
// ─────────────────────────────────────────────────────────────────────────────

function getCronSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) {
    if (/^cron_?secret$/i.test(k) && v) return v;
  }
  return undefined;
}

// Ce cron n'envoie QU'À l'équipe (AUTH_EMAIL), jamais aux clients. Le risque
// d'un déclenchement falsifié se limite donc à un email interne en double :
// on accepte l'en-tête `x-vercel-cron` pour garantir le rappel quotidien de 18h,
// même si la variable Vercel n'est pas nommée exactement CRON_SECRET.
// (Le cron des relances clients, lui, exige le secret — voir /api/cron/emails.)
//
// WhatsApp, lui, écrit aux CLIENTS : comme /api/cron/emails, l'en-tête seul
// (falsifiable) n'autorise l'envoi réel que dans la fenêtre du cron planifié
// (17:00 UTC ±1 h) ; en dehors → simulation (liste seulement, aucun appel Meta).
const CRON_HEURE_UTC = 17;
function authorize(req: Request): { ok: boolean; envoiAutorise: boolean; waReel: boolean } {
  const secret = getCronSecret();
  const key = new URL(req.url).searchParams.get("key");
  const auth = req.headers.get("authorization");
  if (secret && (key === secret || auth === `Bearer ${secret}`)) return { ok: true, envoiAutorise: true, waReel: true };
  if (req.headers.get("x-vercel-cron")) {
    const h = new Date().getUTCHours();
    return { ok: true, envoiAutorise: true, waReel: h >= CRON_HEURE_UTC - 1 && h <= CRON_HEURE_UTC + 1 };
  }
  return { ok: false, envoiAutorise: false, waReel: false };
}

// Date de demain au format YYYY-MM-DD, en fuseau Europe/Paris.
function demainParisISO(): string {
  const todayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [y, m, d] = todayParis.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
const waTel = (tel: string) => tel.replace(/\s/g, "").replace(/^0/, "33");

// « mardi 27 octobre 2026 » (paramètre date des modèles WhatsApp).
function dateLettres(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
const prenomDe = (nom: string) => (nom || "").trim().split(/\s+/)[0] || "";
const escHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// Un message WhatsApp prévu (client ou prestataire), et son résultat.
type WaItem = {
  dest: "client" | "prestataire";
  nom: string;
  tel: string | null;           // numéro normalisé (33…) ou null
  template: string;
  params: string[];
  cles: string[];               // clés anti-doublon (une par prestation)
  statut: "envoye" | "erreur" | "sans_mobile" | "deja_envoye" | "a_envoyer";
  raison?: string;
};

export async function GET(req: Request) {
  const droits = authorize(req);
  if (!droits.ok) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  // Sans secret valide → lecture seule (aucun email envoyé).
  const test = new URL(req.url).searchParams.get("test") === "1" || !droits.envoiAutorise;
  const demainISO = demainParisISO();

  const { data, error } = await supabase
    .from("prestations")
    .select("id, type_prestation, heure_intervention, adresse, date_intervention, prix, mode_paiement, client_id, prestataire_id, clients(prenom, nom, tel, email), prestataires(nom, email, tel_wa)")
    .eq("archive", false)
    .not("date_intervention", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = (data || []).filter(p => String(p.date_intervention).slice(0, 10) === demainISO);

  // Avance immédiate : préférences fiscales + inscrits détectés (pour le reste à charge).
  const fiscalMap = await getSettingJSON<Record<string, string>>("fiscal_clients", {});
  const inscritsList = await getInscrits();

  // Regroupement par client (téléphone en priorité, sinon client_id).
  type Grp = { prenom: string; nom: string; tel: string; email: string; clientId: string; prestations: string[]; heures: string[]; adresse: string; montant: number; avanceMode: boolean; ids: string[]; prestataires: string[] };
  const groupes = new Map<string, Grp>();
  for (const p of rows) {
    const c = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
    const cle = (c.tel || p.client_id || p.id) as string;
    const g: Grp = groupes.get(cle) || { prenom: c.prenom || "", nom: c.nom || "", tel: c.tel || "", email: c.email || "", clientId: (p.client_id as string) || "", prestations: [], heures: [], adresse: p.adresse || "", montant: 0, avanceMode: false, ids: [], prestataires: [] };
    g.ids.push(String(p.id));
    const prNom = prenomDe((Array.isArray(p.prestataires) ? p.prestataires[0] : p.prestataires)?.nom || "");
    if (prNom && !g.prestataires.includes(prNom)) g.prestataires.push(prNom);
    if (p.type_prestation) g.prestations.push(p.type_prestation);
    if (p.heure_intervention) g.heures.push(String(p.heure_intervention).slice(0, 5));
    if (!g.adresse && p.adresse) g.adresse = p.adresse;
    g.montant += parseFloat(String(p.prix ?? "").replace(",", ".")) || 0;
    if (((p.mode_paiement as string) || "").toLowerCase().includes("avance imm")) g.avanceMode = true;
    groupes.set(cle, g);
  }

  const rappels = Array.from(groupes.values()).map(g => {
    const heure = g.heures.sort()[0] || "";
    const avance = g.avanceMode || fiscalMap[g.clientId] === "avance" || !!estInscrit(inscritsList, g.tel, g.email);
    const message = buildRappelMessage({ prenom: g.prenom, prestations: g.prestations, date: frDate(demainISO), heure, adresse: g.adresse, montant: g.montant, avance });
    const waLink = g.tel ? `https://wa.me/${waTel(g.tel)}?text=${encodeURIComponent(message)}` : null;
    return {
      client: `${g.prenom} ${g.nom}`.trim(),
      tel: g.tel || null,
      heure: heure || null,
      prestations: g.prestations,
      waLink,
    };
  }).sort((a, b) => (a.heure || "").localeCompare(b.heure || ""));

  // ── Rappel de la veille pour chaque PRESTATAIRE (ses missions de demain) ──
  // Regroupe les RDV de demain par prestataire ayant un email. SANS prix.
  type Mission = { heure: string; presta: string; adresse: string; client: string; tel: string };
  type PrestaGrp = { nom: string; email: string; missions: Mission[] };
  const prestaGrp = new Map<string, PrestaGrp>();
  for (const p of rows) {
    const pr = Array.isArray(p.prestataires) ? (p.prestataires[0] || {}) : (p.prestataires || {});
    const email = (pr?.email || "").trim();
    if (!email) continue; // pas d'email prestataire → pas de rappel
    const key = (p.prestataire_id || email) as string;
    const g: PrestaGrp = prestaGrp.get(key) || { nom: pr?.nom || "", email, missions: [] };
    const c = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
    g.missions.push({
      heure  : p.heure_intervention ? String(p.heure_intervention).slice(0, 5) : "",
      presta : p.type_prestation || "",
      adresse: p.adresse || "",
      client : (c.prenom || "").trim(),
      tel    : c.tel || "",
    });
    prestaGrp.set(key, g);
  }
  const prestaRappels = Array.from(prestaGrp.values()).map(g => ({
    ...g, missions: g.missions.sort((a, b) => (a.heure || "").localeCompare(b.heure || "")),
  }));

  // ── WhatsApp automatique (API officielle) : plan des messages ──
  const waActif = (await getSettingRaw("whatsapp_rappels_actif")) === "true";
  const waConfigure = waActif ? await isWhatsAppConfigured() : false;
  // desactive : interrupteur OFF (aucune section) · non_configure : ON sans identifiants
  const waMode: "desactive" | "non_configure" | "test" | "simulation" | "reel" =
    !waActif ? "desactive"
    : !waConfigure ? "non_configure"
    : test ? "test"
    : droits.waReel ? "reel" : "simulation";
  const waGuard = waMode === "desactive" ? {} : await getSettingJSON<Record<string, boolean>>("whatsapp_rappels_envoye", {});
  const waItems: WaItem[] = [];
  if (waMode !== "desactive") {
    const dateL = dateLettres(demainISO);
    // (a) un message par client (prestations du jour regroupées, comme l'email)
    for (const g of Array.from(groupes.values())) {
      const heure = g.heures.slice().sort()[0] || "";
      const tel = normaliserMobileWA(g.tel);
      const cles = g.ids.map(id => `c_${id}_${demainISO}`);
      waItems.push({
        dest: "client", nom: `${g.prenom} ${g.nom}`.trim() || "Client", tel, template: WA_TEMPLATE_CLIENT,
        params: [g.prenom || g.nom || "cher client", g.prestations.join(" + ") || "Prestation KinouClean", dateL, heure || "horaire à confirmer", g.adresse || "adresse à confirmer", g.prestataires.join(" et ") || "notre équipe"],
        cles,
        statut: !tel ? "sans_mobile" : cles.every(k => waGuard[k]) ? "deja_envoye" : "a_envoyer",
      });
    }
    // (b) un message par prestataire ET par client (prestations regroupées)
    type PW = { prenom: string; nom: string; tel: string | null; client: string; telClient: string; adresse: string; heures: string[]; prestations: string[]; ids: string[] };
    const pw = new Map<string, PW>();
    for (const p of rows) {
      if (!p.prestataire_id) continue; // non assigné → personne à prévenir
      const pr = Array.isArray(p.prestataires) ? (p.prestataires[0] || {}) : (p.prestataires || {});
      const c = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
      const key = `${p.prestataire_id}|${c.tel || p.client_id || p.id}`;
      const e: PW = pw.get(key) || {
        prenom: prenomDe(pr?.nom || ""), nom: (pr?.nom || "").trim() || "Prestataire", tel: normaliserMobileWA(pr?.tel_wa),
        client: `${c.prenom || ""} ${c.nom || ""}`.trim(), telClient: (c.tel || "").trim(), adresse: p.adresse || "",
        heures: [], prestations: [], ids: [],
      };
      e.ids.push(String(p.id));
      if (p.type_prestation) e.prestations.push(p.type_prestation);
      if (p.heure_intervention) e.heures.push(String(p.heure_intervention).slice(0, 5));
      if (!e.adresse && p.adresse) e.adresse = p.adresse;
      pw.set(key, e);
    }
    for (const e of Array.from(pw.values())) {
      const cles = e.ids.map(id => `p_${id}_${demainISO}`);
      waItems.push({
        dest: "prestataire", nom: e.nom, tel: e.tel, template: WA_TEMPLATE_PRESTA,
        params: [e.prenom || e.nom, dateL, e.heures.sort()[0] || "horaire à confirmer", e.prestations.join(" + ") || "Prestation", e.client || "Client", e.adresse || "adresse à confirmer", e.telClient || "non renseigné"],
        cles,
        statut: !e.tel ? "sans_mobile" : cles.every(k => waGuard[k]) ? "deja_envoye" : "a_envoyer",
      });
    }
  }
  const waVue = (it: WaItem) => ({
    dest: it.dest, nom: it.nom, tel: it.tel ? masquerTel(it.tel) : null, template: it.template,
    statut: it.statut, ...(it.raison ? { raison: it.raison } : {}),
  });

  if (test) {
    return NextResponse.json({
      mode: "TEST (aucun email envoyé)",
      // true = la variable Vercel est bien nommée CRON_SECRET → Vercel injecte le
      // Bearer sur ses crons → les relances clients (cron emails) fonctionneront.
      cronSecretNomExact: !!process.env.CRON_SECRET,
      demain: demainISO, nbRappels: rappels.length, rappels,
      nbPrestataires: prestaRappels.length,
      prestataires: prestaRappels.map(g => ({ nom: g.nom, email: g.email, nbMissions: g.missions.length })),
      // Ce qui SERAIT envoyé par WhatsApp (aucun appel à Meta en test).
      whatsapp: {
        mode: waMode, langue: WA_TEMPLATE_LANG,
        messages: waItems.map(it => ({ ...waVue(it), params: it.params })),
      },
    });
  }

  if (rappels.length === 0) {
    return NextResponse.json({ demain: demainISO, nbRappels: 0, note: "Aucun RDV demain — pas d'email envoyé." });
  }

  // ── WhatsApp : envoi réel (ou simulation), AVANT l'email pour pouvoir y
  // inclure le résultat. Anti-doublon écrit après chaque succès.
  // (En simulation, les messages restent « a_envoyer » : liste seulement.)
  if (waMode === "reel") {
    // Purge des entrées de plus de 10 jours (le réglage ne gonfle pas).
    const limite = new Date(); limite.setDate(limite.getDate() - 10);
    const limiteIso = limite.toISOString().slice(0, 10);
    for (const k of Object.keys(waGuard)) { const d = k.split("_").pop() || ""; if (d < limiteIso) delete waGuard[k]; }
    let guardKo: string | null = null;
    for (const it of waItems) {
      if (it.statut !== "a_envoyer" || !it.tel) continue;
      // Anti-doublon illisible/inscriptible → on s'arrête plutôt que risquer un double envoi.
      if (guardKo) { it.raison = `non envoyé : anti-doublon indisponible (${guardKo})`; continue; }
      try {
        await sendWhatsAppTemplate(it.tel, it.template, WA_TEMPLATE_LANG, it.params);
        it.statut = "envoye";
        for (const k of it.cles) waGuard[k] = true;
        // Écrit tout de suite : un plantage plus loin ne provoquera pas de renvoi.
        guardKo = await setSettingRaw("whatsapp_rappels_envoye", JSON.stringify(waGuard)).catch(e => String(e));
      } catch (e) {
        it.statut = "erreur";
        it.raison = whatsAppErrorText(e);
      }
    }
  }
  const waCompte = (st: WaItem["statut"]) => waItems.filter(it => it.statut === st).length;
  const waResume = waMode === "desactive" ? null : {
    le: new Date().toISOString(), demain: demainISO, mode: waMode,
    envoyes: waCompte("envoye"), erreurs: waCompte("erreur"), sansMobile: waCompte("sans_mobile"),
    dejaEnvoyes: waCompte("deja_envoye"), aEnvoyer: waCompte("a_envoyer"),
    messages: waItems.map(waVue),
  };
  if (waResume) {
    try { await setSettingRaw("whatsapp_rappels_dernier", JSON.stringify(waResume)); } catch { /* non bloquant */ }
  }

  const gmail = await getGmailTransporter();
  if (!gmail) return NextResponse.json({ error: "Gmail non connecté", whatsapp: waResume }, { status: 503 });
  const dest = process.env.AUTH_EMAIL || gmail.user;

  // Bouton "table" (le standard email : compatible Gmail/Outlook/iOS) + lien
  // texte de secours juste en dessous, pour que ce soit TOUJOURS cliquable.
  const lignes = rappels.map(r => `
    <tr><td style="padding:14px 16px;border-bottom:1px solid #eef0f4;">
      <div style="font-size:15px;font-weight:bold;color:#1C3557;">${r.heure ? r.heure + " · " : ""}${r.client || "Client"}</div>
      <div style="font-size:13px;color:#6B7280;margin:2px 0 10px;">🧹 ${r.prestations.join(" + ") || "—"}${r.tel ? ` · 📞 ${r.tel}` : ""}</div>
      ${r.waLink
        ? `<table cellpadding="0" cellspacing="0" border="0"><tr>
             <td bgcolor="#25D366" style="border-radius:8px;">
               <a href="${r.waLink}" target="_blank" style="display:block;padding:11px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Envoyer le rappel WhatsApp</a>
             </td>
           </tr></table>
           <div style="font-size:11px;margin-top:6px;">
             <a href="${r.waLink}" target="_blank" style="color:#1C3557;">ou ouvrir le lien WhatsApp</a>
           </div>`
        : `<span style="font-size:12px;color:#9CA3AF;">Pas de numéro de téléphone</span>`}
    </td></tr>`).join("");

  // Section « WhatsApp automatique » (absente si l'interrupteur est OFF).
  const waLibelle = (it: WaItem): string =>
    it.statut === "envoye" ? "✓ envoyé"
    : it.statut === "erreur" ? `✗ erreur Meta — ${it.raison || "inconnue"}`
    : it.statut === "sans_mobile" ? "⏭ pas de mobile"
    : it.statut === "deja_envoye" ? "↺ déjà envoyé"
    : waMode === "simulation" ? "◌ simulation (non envoyé)" : "◌ non envoyé";
  const waTitre = waMode === "non_configure"
    ? "⚠️ Activé mais WhatsApp non configuré (token / Phone Number ID) : rien n'a été envoyé."
    : waMode === "simulation"
      ? "Simulation (déclenchement hors fenêtre horaire) : rien n'a été envoyé."
      : waResume ? `${waResume.envoyes} envoyé(s) · ${waResume.erreurs} erreur(s) · ${waResume.sansMobile} sans mobile` : "";
  const waHtml = !waResume ? "" : `
      <tr><td style="padding:6px 16px 16px;">
        <div style="font-size:14px;font-weight:bold;color:#1C3557;margin:8px 0 4px;">💬 WhatsApp automatique (client + prestataire)</div>
        <div style="font-size:12px;color:#6B7280;margin-bottom:6px;">${escHtml(waTitre)}</div>
        ${waItems.map(it => `<div style="font-size:12px;color:#374151;padding:3px 0;border-bottom:1px solid #f3f4f6;">${it.dest === "client" ? "👤" : "🧽"} ${escHtml(it.nom)}${it.tel ? ` · ${masquerTel(it.tel)}` : ""} — <strong style="color:${it.statut === "erreur" ? "#B91C1C" : it.statut === "envoye" ? "#047857" : "#6B7280"};">${escHtml(waLibelle(it))}</strong></div>`).join("")}
      </td></tr>`;
  const waTexte = !waResume ? "" :
    `\n— WhatsApp automatique (client + prestataire) —\n${waTitre}\n` +
    waItems.map(it => `${it.dest === "client" ? "Client" : "Prestataire"} ${it.nom}${it.tel ? ` (${masquerTel(it.tel)})` : ""} : ${waLibelle(it)}`).join("\n") + "\n";

  // Version texte brut : les URL y sont cliquables dans tous les clients mail.
  const texte =
    `Rappels à envoyer — RDV du ${frDate(demainISO)} (${rappels.length})\n\n` +
    rappels.map(r =>
      `${r.heure ? r.heure + " · " : ""}${r.client || "Client"}` +
      `${r.prestations.length ? ` — ${r.prestations.join(" + ")}` : ""}` +
      `${r.tel ? ` — ${r.tel}` : ""}\n${r.waLink || "(pas de numéro)"}\n`
    ).join("\n") + waTexte;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:28px 16px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#1C3557;padding:24px 28px;">
        <div style="color:#fff;font-size:18px;font-weight:bold;">🔔 Rappels à envoyer — RDV de demain</div>
        <div style="color:rgba(255,255,255,0.65);font-size:13px;margin-top:4px;">${frDate(demainISO)} · ${rappels.length} rendez-vous</div>
      </td></tr>
      <tr><td style="padding:6px 12px;">
        <p style="font-size:13px;color:#6B7280;padding:12px 4px 4px;">Cliquez sur chaque bouton pour ouvrir WhatsApp avec le message de rappel prérempli.</p>
        <table width="100%" cellpadding="0" cellspacing="0">${lignes}</table>
      </td></tr>${waHtml}
      <tr><td style="background:#1C3557;padding:14px 28px;text-align:center;">
        <div style="color:rgba(255,255,255,0.6);font-size:11px;">KinouClean · rappel automatique quotidien</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  let ownerOk = false;
  try {
    await gmail.transporter.sendMail({
      from: `"KinouClean" <${gmail.user}>`, to: dest,
      subject: `🔔 ${rappels.length} rappel(s) à envoyer — RDV du ${frDate(demainISO)}`,
      text: texte,
      html,
    });
    ownerOk = true;
  } catch { /* on continue quand même vers les prestataires */ }

  // ── Email à CHAQUE prestataire : ses missions de demain (SANS prix) ──
  let prestaEnvoyes = 0;
  for (const g of prestaRappels) {
    const lignesP = g.missions.map(m => `
      <tr><td style="padding:12px 16px;border-bottom:1px solid #eef0f4;">
        <div style="font-size:15px;font-weight:bold;color:#1C3557;">${m.heure ? m.heure + " · " : ""}${m.presta || "Prestation"}</div>
        <div style="font-size:13px;color:#6B7280;margin-top:2px;">${m.adresse ? "📍 " + m.adresse : ""}${m.client ? ` · 👤 ${m.client}` : ""}${m.tel ? ` · 📞 ${m.tel}` : ""}</div>
      </td></tr>`).join("");
    const texteP = `Tes missions de demain (${frDate(demainISO)}) :\n\n` +
      g.missions.map(m => `${m.heure ? m.heure + " · " : ""}${m.presta}${m.adresse ? " — " + m.adresse : ""}${m.client ? " — " + m.client : ""}${m.tel ? " — " + m.tel : ""}`).join("\n");
    const htmlP = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:28px 16px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#1C3557;padding:24px 28px;">
        <div style="color:#fff;font-size:18px;font-weight:bold;">📅 ${g.nom ? g.nom + ", tes" : "Tes"} missions de demain</div>
        <div style="color:rgba(255,255,255,0.65);font-size:13px;margin-top:4px;">${frDate(demainISO)} · ${g.missions.length} mission(s)</div>
      </td></tr>
      <tr><td style="padding:6px 12px;"><table width="100%" cellpadding="0" cellspacing="0">${lignesP}</table></td></tr>
      <tr><td style="background:#1C3557;padding:14px 28px;text-align:center;">
        <div style="color:rgba(255,255,255,0.6);font-size:11px;">KinouClean · rappel automatique</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    try {
      await gmail.transporter.sendMail({
        from: `"KinouClean" <${gmail.user}>`, to: g.email,
        subject: `📅 Tes missions de demain — ${frDate(demainISO)} (${g.missions.length})`,
        text: texteP, html: htmlP,
      });
      prestaEnvoyes++;
    } catch { /* on continue avec les autres prestataires */ }
  }

  // ── Email récapitulatif AUTOMATIQUE au CLIENT (la veille) ──
  // « N'oubliez pas votre rendez-vous » + reste à charge si avance immédiate.
  // Garde anti-doublon par client+date (settings/rappel_client_envoye).
  const guard = await getSettingJSON<Record<string, boolean>>("rappel_client_envoye", {});
  let clientEnvoyes = 0;
  for (const g of Array.from(groupes.values())) {
    if (!g.email) continue;
    const gkey = `${g.clientId || g.tel || g.email}_${demainISO}`;
    if (guard[gkey]) continue;
    const heure = g.heures.slice().sort()[0] || "";
    const avance = g.avanceMode || fiscalMap[g.clientId] === "avance" || !!estInscrit(inscritsList, g.tel, g.email);
    try {
      const ok = await sendRappelEmail(g.email, {
        prenom: g.prenom, typePresta: g.prestations.join(" + ") || "Prestation", quantite: "",
        adresse: g.adresse, date: frDate(demainISO), heure,
        prix: g.montant > 0 ? String(g.montant) : "", modePaiement: "", avanceInscrit: avance,
      });
      if (ok) { guard[gkey] = true; clientEnvoyes++; }
    } catch { /* on continue avec les autres clients */ }
  }
  // Purge des entrées de plus de 10 jours pour que le réglage ne gonfle pas.
  try {
    const limite = new Date(); limite.setDate(limite.getDate() - 10);
    const limiteIso = limite.toISOString().slice(0, 10);
    for (const k of Object.keys(guard)) { const d = k.split("_").pop() || ""; if (d < limiteIso) delete guard[k]; }
    await setSettingRaw("rappel_client_envoye", JSON.stringify(guard));
  } catch { /* non bloquant */ }

  return NextResponse.json({ demain: demainISO, nbRappels: rappels.length, ownerEnvoyeA: ownerOk ? dest : null, prestaEnvoyes, clientEnvoyes, whatsapp: waResume });
}
