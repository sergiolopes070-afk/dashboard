// ─────────────────────────────────────────────────────────────────────────────
// Relances AUTOMATIQUES des prospects — partie serveur (Supabase, Gmail, IMAP).
// Le calcul des échéances (cadence J+2 / J+5 / J+9, dimanche, clôture) est dans
// prospectRelanceCadence.ts, partagé avec la page Prospects.
//
// Exécuté UNE fois par jour dans le cron existant (/api/cron/emails, 08:00 UTC) :
//   1. Détection des RÉPONSES (une seule connexion IMAP Gmail) pour toutes les
//      séquences en cours → a répondu = relances auto arrêtées + « Aujourd'hui ».
//      IMAP KO → AUCUN envoi ni clôture ce jour-là (prudence).
//   2. Clôture (PERDU) 3 j après R3 sans réponse.
//   3. Envoi de la relance due (jamais le dimanche), plafond 30/jour.
//   4. Résumé envoyé au patron s'il s'est passé quelque chose.
// ─────────────────────────────────────────────────────────────────────────────
import { ImapFlow } from "imapflow";
import { supabase } from "./supabase";
import { getSetting, sendProspectRelanceEmail, sendProspectInfosEmail, sendPatronNotif } from "./mailer";
import { getSettingRaw, setSettingRaw } from "./settings";
import { isoParis, frParis } from "./dateParis";
import { telCle, emailCle } from "./avanceMatch";
import {
  etatAuto, autoGlobalActif, dernierEnvoiJour, estDimanche, jjmmIso, versJour, horsDimanche,
  SuiviAuto, Piste, EtatAuto, PLAFOND_JOUR, RELANCES_AUTO_KEY, RELANCES_AUTO_DERNIER_KEY,
} from "./prospectRelanceCadence";

const SUIVI_KEY = "prospects_suivi";
type EtatEnCours = Extract<EtatAuto, { etat: "programmee" | "cloture" }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Suivi = SuiviAuto & Record<string, any>;

// ─── Doublon prospect ↔ client ────────────────────────────────────────────────
// Un prospect dont l'email ou le téléphone (9 derniers chiffres) correspond à une
// fiche client existante → { id, nom } (« Déjà client : <nom> »).
export type DejaClient = { id: string; nom: string } | null;
export async function indexClients(): Promise<(p: { email?: string | null; tel?: string | null }) => DejaClient> {
  const vide = () => null;
  if (!supabase) return vide;
  const { data, error } = await supabase.from("clients").select("id, prenom, nom, email, tel")
    .order("created_at", { ascending: false });
  if (error || !data) return vide;
  const parEmail = new Map<string, DejaClient>();
  const parTel   = new Map<string, DejaClient>();
  for (const c of data) {
    const v = { id: c.id as string, nom: `${c.prenom || ""} ${c.nom || ""}`.trim() || "client" };
    const e = emailCle(c.email as string), t = telCle(c.tel as string);
    if (e && !parEmail.has(e)) parEmail.set(e, v);
    if (t.length === 9 && !parTel.has(t)) parTel.set(t, v);
  }
  return p => {
    const e = emailCle(p.email), t = telCle(p.tel);
    return (e && parEmail.get(e)) || (t.length === 9 && parTel.get(t)) || null;
  };
}

export async function relancesAutoGlobal(): Promise<boolean> {
  return autoGlobalActif(await getSettingRaw(RELANCES_AUTO_KEY));
}

// Après un envoi MANUEL (devis, demande d'infos, relance) : date de prochaine
// relance = prochaine échéance AUTO si les relances auto sont actives pour ce
// prospect, sinon demain (comportement historique).
export async function prochaineRelanceApresEnvoi(id: string, suivi: Suivi, statut?: string): Promise<{ date: string; auto: boolean }> {
  const demain = isoParis(1);
  if (!supabase) return { date: demain, auto: false };
  try {
    const [global, { data }, dejaClientDe] = await Promise.all([
      relancesAutoGlobal(),
      supabase.from("prospects").select("statut, email, tel").eq("id", id).limit(1),
      indexClients(),
    ]);
    const p = data?.[0];
    if (!p) return { date: demain, auto: false };
    const e = etatAuto({ statut: statut ?? (p.statut as string), email: p.email as string, dejaClient: dejaClientDe(p) }, suivi, { global });
    if (e.etat === "programmee" || e.etat === "cloture") return { date: e.date < demain ? demain : e.date, auto: true };
  } catch { /* repli : demain */ }
  return { date: demain, auto: false };
}

// ─── Écritures sûres ──────────────────────────────────────────────────────────
// Relit le suivi FRAIS avant d'écrire (la route manuelle peut écrire entre-temps) et
// refuse d'écrire si la lecture échoue : un `{}` de repli effacerait tout le suivi.
async function lireSuiviFrais(): Promise<Record<string, Suivi> | null> {
  const raw = await getSettingRaw(SUIVI_KEY);
  if (raw == null) return null;
  try { return JSON.parse(raw) as Record<string, Suivi>; } catch { return null; }
}
async function majSuivi(id: string, patch: Partial<Suivi>): Promise<Suivi> {
  const all = await lireSuiviFrais();
  if (!all) throw new Error("lecture du suivi impossible (rien n'a été écrit)");
  all[id] = { ...(all[id] || {}), ...patch };
  const err = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
  if (err) throw new Error(`suivi non enregistré : ${err}`);
  return all[id];
}
async function ajouterJournal(id: string, texte: string, maj: Record<string, unknown>): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.from("prospects").select("commentaires").eq("id", id).limit(1);
  const existing = Array.isArray(data?.[0]?.commentaires) ? data![0].commentaires : [];
  const note = { id: crypto.randomUUID(), date: new Date().toISOString(), texte };
  const { error } = await supabase.from("prospects")
    .update({ ...maj, commentaires: [...existing, note], updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Détection des réponses (IMAP Gmail) ──────────────────────────────────────
// Seuil = instant du dernier email envoyé (horodatage précis si connu, sinon début
// du jour d'envoi à Paris). Les réponses automatiques (absence…) ne comptent pas.
const AUTO_REPONSE = /(r[ée]ponse automatique|message d'absence|absent|out of office|automatic reply|auto-?reply|autoreply)/i;

function seuilReponse(s: Suivi): number {
  const precis = [s.dernierEnvoiIso, s.relanceDate].map(x => (x ? Date.parse(x) : NaN)).filter(n => !isNaN(n));
  const jour = dernierEnvoiJour(s);
  // Minuit à Paris ≈ 22:00/23:00 UTC la veille : on prend large (−2 h).
  const debutJour = jour ? Date.parse(`${jour}T00:00:00Z`) - 2 * 3600_000 : 0;
  return Math.max(debutJour, ...precis);
}

async function chercherReponses(cands: { id: string; email: string; seuil: number }[]): Promise<{ trouvees: Map<string, Date>; erreurs: string[] }> {
  const trouvees = new Map<string, Date>();
  const erreurs: string[] = [];
  if (!cands.length) return { trouvees, erreurs };
  const user = await getSetting("gmail_user", process.env.GMAIL_USER);
  const pass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) throw new Error("Gmail non connecté (IMAP impossible)");

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      for (const c of cands) {
        try {
          const since = new Date(c.seuil - 24 * 3600_000); // SINCE IMAP = date seule
          const uids = await client.search({ from: c.email, since }, { uid: true });
          if (!uids || !uids.length) continue;
          for await (const msg of client.fetch(uids, { envelope: true, internalDate: true }, { uid: true })) {
            const de = (msg.envelope?.from || []).some(a => emailCle(a.address) === c.email);
            const quand = msg.internalDate ? new Date(msg.internalDate) : msg.envelope?.date ? new Date(msg.envelope.date) : null;
            if (!de || !quand || quand.getTime() <= c.seuil) continue;
            if (AUTO_REPONSE.test(msg.envelope?.subject || "")) continue;
            const prev = trouvees.get(c.id);
            if (!prev || quand < prev) trouvees.set(c.id, quand);
          }
        } catch (e) {
          erreurs.push(`${c.email} : ${e instanceof Error ? e.message : "recherche IMAP échouée"}`);
        }
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    try { await client.close(); } catch { /* ignore */ }
    throw e;
  }
  return { trouvees, erreurs };
}

// ─── Passage quotidien ────────────────────────────────────────────────────────
export interface LigneRapport { id: string; nom: string; niveau?: number; piste?: Piste; info?: string }
export interface RapportRelancesAuto {
  le: string; jour: string; mode: string; actif: boolean; dimanche: boolean;
  envoyees: LigneRapport[]; reponses: LigneRapport[]; clotures: LigneRapport[];
  plafond: LigneRapport[]; reportees: LigneRapport[]; aVenir: LigneRapport[]; erreurs: string[];
  note?: string;
}

const pisteTxt = (p?: Piste) => (p === "infos" ? "demande d'infos" : "devis");

export async function executerRelancesAuto(opts: { mode: "simulation" | "test" | "reel"; deadline: number }): Promise<RapportRelancesAuto> {
  const today = isoParis(0);
  const dimanche = estDimanche(today);
  const r: RapportRelancesAuto = {
    le: new Date().toISOString(), jour: today, mode: opts.mode, actif: true, dimanche,
    envoyees: [], reponses: [], clotures: [], plafond: [], reportees: [], aVenir: [], erreurs: [],
  };
  if (!supabase) { r.erreurs.push("Supabase non configuré"); return r; }

  r.actif = await relancesAutoGlobal();
  if (!r.actif) { r.note = "Relances automatiques désactivées (Configuration)."; return r; }
  // Mode test (emails redirigés vers le patron) : on ne touche pas aux prospects.
  if (opts.mode === "test") { r.note = "Non exécuté en mode test."; return r; }

  const [{ data: rows, error }, dejaClientDe, suiviAll] = await Promise.all([
    supabase.from("prospects").select("id, prenom, nom, genre, email, tel, statut, type_presta, besoins, budget"),
    indexClients(),
    lireSuiviFrais(),
  ]);
  if (error) { r.erreurs.push(`Lecture prospects : ${error.message}`); return r; }
  if (!suiviAll) { r.erreurs.push("Lecture du suivi prospects impossible — rien n'a été fait."); return r; }

  // Séquences en cours (programmées ou en attente de clôture).
  type Cand = { row: Record<string, unknown>; id: string; nom: string; email: string; suivi: Suivi; etat: EtatEnCours };
  const cands: Cand[] = [];
  for (const row of rows || []) {
    const id = row.id as string;
    const suivi = suiviAll[id] || {};
    const etat = etatAuto({ statut: row.statut as string, email: row.email as string, dejaClient: dejaClientDe(row) }, suivi, { global: true, today });
    if (etat.etat !== "programmee" && etat.etat !== "cloture") continue;
    cands.push({ row, id, nom: `${row.prenom || ""} ${row.nom || ""}`.trim() || "(sans nom)", email: emailCle(row.email as string), suivi, etat });
  }

  // Simulation : on liste ce qui serait fait, sans IMAP ni écriture.
  if (opts.mode === "simulation") {
    for (const c of cands) {
      const e = c.etat;
      const ligne: LigneRapport = { id: c.id, nom: c.nom, piste: e.piste, niveau: e.etat === "programmee" ? e.niveau : undefined, info: `échéance ${jjmmIso(e.date)}` };
      if (e.date > today) r.aVenir.push(ligne);
      else if (e.etat === "cloture") r.clotures.push(ligne);
      else if (dimanche) r.reportees.push({ ...ligne, info: "dimanche → lundi" });
      else r.envoyees.push(ligne);
    }
    r.note = "Simulation : aucun email envoyé, rien n'a été modifié (détection des réponses non exécutée).";
    return r;
  }

  // 1. Réponses : UNE connexion IMAP pour toutes les séquences en cours.
  let trouvees: Map<string, Date>;
  const erreursImap = new Set<string>();
  try {
    const res = await chercherReponses(cands.map(c => ({ id: c.id, email: c.email, seuil: seuilReponse(c.suivi) })));
    trouvees = res.trouvees;
    for (const e of res.erreurs) { r.erreurs.push(`IMAP ${e}`); erreursImap.add(e.split(" : ")[0]); }
  } catch (e) {
    r.erreurs.push(`IMAP Gmail indisponible (${e instanceof Error ? e.message : "erreur"}) — AUCUNE relance envoyée ni clôture aujourd'hui.`);
    for (const c of cands) if (c.etat.date <= today) r.reportees.push({ id: c.id, nom: c.nom, piste: c.etat.piste, info: "IMAP indisponible" });
    return r;
  }

  // Plafond : tient compte d'un éventuel passage précédent le même jour.
  let dejaEnvoyes = 0;
  try {
    const prec = JSON.parse((await getSettingRaw(RELANCES_AUTO_DERNIER_KEY)) || "null") as RapportRelancesAuto | null;
    if (prec && prec.jour === today && prec.mode === "reel") dejaEnvoyes = prec.envoyees?.length || 0;
  } catch { /* ignore */ }
  let restant = Math.max(0, PLAFOND_JOUR - dejaEnvoyes);

  for (const c of cands) {
    const e = c.etat;
    const base: LigneRapport = { id: c.id, nom: c.nom, piste: e.piste };
    try {
      // a) A répondu → arrêt des relances auto, retour dans « Aujourd'hui ».
      const rep = trouvees.get(c.id);
      if (rep) {
        await majSuivi(c.id, { autoStop: "reponse", reponduLe: rep.toISOString() });
        await ajouterJournal(c.id, `📩 A répondu par email le ${jjmmIso(versJour(rep.toISOString()) || today)} — relances automatiques arrêtées`, { date_relance: today });
        r.reponses.push({ ...base, info: rep.toISOString() });
        continue;
      }
      if (erreursImap.has(c.email)) { if (e.date <= today) r.reportees.push({ ...base, info: "recherche de réponse échouée" }); continue; }
      if (e.date > today) { r.aVenir.push({ ...base, niveau: e.etat === "programmee" ? e.niveau : undefined, info: jjmmIso(e.date) }); continue; }

      // b) Clôture 3 j après R3 sans réponse.
      if (e.etat === "cloture") {
        await ajouterJournal(c.id, "🤖 Clôturé automatiquement (pas de réponse après 3 relances)", { statut: "PERDU" });
        r.clotures.push(base);
        continue;
      }

      // c) Relance due.
      if (dimanche) { r.reportees.push({ ...base, niveau: e.niveau, info: "dimanche → lundi" }); continue; }
      if (Date.now() > opts.deadline) { r.reportees.push({ ...base, niveau: e.niveau, info: "temps d'exécution épuisé → prochain passage" }); continue; }
      if (restant <= 0) { r.plafond.push({ ...base, niveau: e.niveau, info: `plafond ${PLAFOND_JOUR}/jour atteint` }); continue; }

      // Relecture fraîche juste avant l'envoi : la route manuelle a pu avancer le niveau.
      const frais = await lireSuiviFrais();
      if (!frais) throw new Error("lecture du suivi impossible");
      const s = frais[c.id] || {};
      const e2 = etatAuto({ statut: c.row.statut as string, email: c.email, dejaClient: null }, s, { global: true, today });
      if (e2.etat !== "programmee" || e2.niveau !== e.niveau || e2.piste !== e.piste || e2.date > today) {
        r.reportees.push({ ...base, niveau: e.niveau, info: "suivi modifié entre-temps (envoi manuel ?) — ignoré" });
        continue;
      }
      if (dernierEnvoiJour(s) === today) { r.reportees.push({ ...base, niveau: e.niveau, info: "déjà un email envoyé aujourd'hui" }); continue; }

      const row = c.row;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const besoins: any[] = Array.isArray(row.besoins) ? row.besoins : [];
      const prenom = (row.prenom as string) || "", nom = (row.nom as string) || "", genre = (row.genre as string) || "";
      const typePresta = (besoins[0]?.typePresta as string) || (row.type_presta as string) || "";
      const prix = (besoins[0]?.prix as string) || (row.budget as string) || "";
      const n = e.niveau;
      const ok = e.piste === "devis"
        ? await sendProspectRelanceEmail(c.email, n, { prenom, nom, genre, prestation: typePresta, devisDate: s.devisDate, prix })
        : await sendProspectInfosEmail(c.email, n, { prenom, nom, genre, typePresta });
      if (!ok) throw new Error("Gmail non connecté");
      restant--;

      // Suivi mis à jour EXACTEMENT comme l'action manuelle.
      const maintenant = new Date().toISOString();
      const dates = [...((e.piste === "devis" ? s.relanceDates : s.infoRelanceDates) || [])];
      dates[n - 1] = frParis();
      const patch: Partial<Suivi> = e.piste === "devis"
        ? { relanceNiveau: n, relanceDates: dates }
        : { infoRelanceNiveau: n, infoRelanceDates: dates };
      patch.relanceDate = maintenant;
      patch.dernierEnvoiIso = maintenant;
      const apres = await majSuivi(c.id, patch);
      const suivante = etatAuto({ statut: "RELANCÉ", email: c.email, dejaClient: null }, apres, { global: true, today });
      const prochaine = (suivante.etat === "programmee" || suivante.etat === "cloture") ? horsDimanche(suivante.date) : isoParis(1);
      await ajouterJournal(c.id, `🤖 Relance R${n} envoyée automatiquement${e.piste === "infos" ? " (demande d'infos)" : ""}`, { statut: "RELANCÉ", date_relance: prochaine });
      r.envoyees.push({ ...base, niveau: n, info: `prochaine échéance ${jjmmIso(prochaine)}` });
    } catch (err) {
      r.erreurs.push(`${c.nom} : ${err instanceof Error ? err.message : "erreur"}`);
    }
  }

  if (r.plafond.length) console.warn("[relances auto] plafond atteint, non envoyées :", r.plafond.map(x => x.nom).join(", "));
  return r;
}

// Mémorise le dernier passage (affiché dans Configuration) + résumé au patron.
export async function finaliserRelancesAuto(r: RapportRelancesAuto): Promise<void> {
  if (r.mode !== "reel") return;
  const err = await setSettingRaw(RELANCES_AUTO_DERNIER_KEY, JSON.stringify(r));
  if (err) r.erreurs.push(`Sauvegarde du dernier passage : ${err}`);

  const rien = !r.envoyees.length && !r.reponses.length && !r.clotures.length && !r.erreurs.length && !r.plafond.length;
  if (rien) return;
  const li = (l: LigneRapport, extra = "") => `<li>${esc(l.nom)}${extra}</li>`;
  const bloc = (titre: string, items: string[]) => items.length ? `<h3 style="font-size:15px;margin:16px 0 6px;">${titre}</h3><ul style="margin:0;padding-left:18px;">${items.join("")}</ul>` : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1F2937;">
    <p>Bonjour, voici le passage des relances automatiques du ${jjmmIso(r.jour)} :</p>
    ${bloc(`📩 Ont répondu (${r.reponses.length}) — à traiter aujourd'hui`, r.reponses.map(l => li(l, ` — ${pisteTxt(l.piste)}`)))}
    ${bloc(`🤖 Relances envoyées (${r.envoyees.length})`, r.envoyees.map(l => li(l, ` — R${l.niveau} ${pisteTxt(l.piste)}`)))}
    ${bloc(`❌ Clôturés sans réponse (${r.clotures.length})`, r.clotures.map(l => li(l)))}
    ${bloc(`⏸️ Non envoyées — plafond ${PLAFOND_JOUR}/jour (${r.plafond.length})`, r.plafond.map(l => li(l, ` — R${l.niveau}`)))}
    ${bloc(`⚠️ Erreurs (${r.erreurs.length})`, r.erreurs.map(e => `<li>${esc(e)}</li>`))}
    <p style="color:#6B7280;font-size:12px;margin-top:18px;">Pour tout arrêter : Configuration → Relances automatiques des prospects.</p>
  </div>`;
  const text = [
    `Relances automatiques du ${jjmmIso(r.jour)}`,
    `Ont répondu : ${r.reponses.map(l => l.nom).join(", ") || "—"}`,
    `Envoyées : ${r.envoyees.map(l => `${l.nom} (R${l.niveau} ${pisteTxt(l.piste)})`).join(", ") || "—"}`,
    `Clôturés : ${r.clotures.map(l => l.nom).join(", ") || "—"}`,
    r.plafond.length ? `Plafond atteint, non envoyées : ${r.plafond.map(l => l.nom).join(", ")}` : "",
    r.erreurs.length ? `Erreurs : ${r.erreurs.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
  const sujet = `🤖 Relances prospects : ${r.envoyees.length} envoyée(s), ${r.reponses.length} réponse(s), ${r.clotures.length} clôture(s)${r.erreurs.length ? " ⚠️" : ""}`;
  try { await sendPatronNotif(sujet, html, text); }
  catch (e) { console.error("[relances auto] résumé patron KO :", e); }
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
