// ─────────────────────────────────────────────────────────────────────────────
// Import des demandes de devis reçues par email (formulaire du site kinouclean.fr).
// Lit la boîte Gmail en IMAP (mot de passe d'application), repère les emails dont
// l'objet commence par « Nouvelle demande de devis », extrait les champs et crée
// automatiquement le client/prestation dans le dashboard.
//
// Anti-doublon : on mémorise les Message-ID déjà traités (settings/inbox_processed)
// → un même email n'est jamais importé deux fois, même s'il a déjà été lu dans Gmail.
// ─────────────────────────────────────────────────────────────────────────────
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { supabase } from "./supabase";
import { appendPrestation } from "./sheets";
import { getSetting } from "./mailer";

const SUBJECT_MATCH = "Nouvelle demande de devis";
const PROCESSED_KEY = "inbox_processed";

// ─── Suivi des emails déjà importés ─────────────────────────────────────────────
async function lireTraites(): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("settings").select("value").eq("key", PROCESSED_KEY).maybeSingle();
  try { return data?.value ? JSON.parse(data.value as string) as string[] : []; } catch { return []; }
}
async function ecrireTraites(ids: string[]): Promise<void> {
  if (!supabase) return;
  const capped = ids.slice(-1000); // borne la taille
  await supabase.from("settings").upsert({ key: PROCESSED_KEY, value: JSON.stringify(capped) }, { onConflict: "key" });
}

// ─── Parsing du corps de l'email en champs ──────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/td|\/tr|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&eacute;/gi, "é").replace(/&egrave;/gi, "è")
    .replace(/&#\d+;/g, " ");
}

// Un libellé = ligne toute en majuscules (avec accents), courte, avec ≥1 lettre.
function estLibelle(l: string): boolean {
  if (l.length > 40) return false;
  if (!/[A-ZÀ-Ý]/.test(l)) return false;      // au moins une lettre majuscule
  return !/[a-zà-ÿ]/.test(l);                  // aucune minuscule
}
function normLabel(l: string): string {
  return l.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export interface DemandeParsee {
  prenom: string; nom: string; email: string; tel: string;
  typePresta: string; adresse: string; prix: string; message: string;
}

export function parseDemande(text: string): DemandeParsee {
  const lignes = text.split("\n").map(s => s.replace(/ /g, " ").trim()).filter(Boolean);
  const paires: { label: string; labelOrig: string; value: string }[] = [];
  for (let i = 0; i < lignes.length; i++) {
    if (estLibelle(lignes[i])) {
      const next = lignes[i + 1];
      const value = next && !estLibelle(next) ? next : "";
      paires.push({ label: normLabel(lignes[i]), labelOrig: lignes[i].trim(), value });
    }
  }
  const get = (labels: string[]) => paires.find(p => labels.includes(p.label))?.value || "";

  const prenom = get(["PRENOM"]);
  const nom    = get(["NOM"]);
  const email  = get(["EMAIL", "E-MAIL", "MAIL"]);
  const tel    = get(["TELEPHONE", "TEL", "PORTABLE"]);
  const typePresta = get(["PRESTATION", "TYPE DE PRESTATION"]);
  const adresse = get(["ADRESSE"]);

  // Prix : dernière valeur contenant un montant en €.
  let prix = "";
  for (const p of paires) {
    const m = p.value.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*€/);
    if (m) prix = m[1].replace(/\s/g, "").replace(",", ".");
  }

  // Message : les champs "détail" non standard (taille, créneau, message…).
  const CORE = ["PRENOM", "NOM", "EMAIL", "E-MAIL", "MAIL", "TELEPHONE", "TEL", "PORTABLE", "PRESTATION", "TYPE DE PRESTATION", "ADRESSE"];
  const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const details = paires
    .filter(p => !CORE.includes(p.label) && p.value)
    .map(p => `${titleCase(p.labelOrig)} : ${p.value}`);
  const message = details.join("\n");

  return { prenom, nom, email, tel, typePresta, adresse, prix, message };
}

// ─── Import IMAP ────────────────────────────────────────────────────────────────
export interface ImportResult {
  imported: { prenom: string; email: string; typePresta: string; prix: string }[];
  skipped: number;
  errors: string[];
  dry: boolean;
  debugSample?: { subject: string; text: string; htmlStripped: string; parsed: DemandeParsee }[];
}

export async function importInbox(opts: { dry?: boolean; debug?: boolean } = {}): Promise<ImportResult> {
  const dry = !!opts.dry;
  const debug = !!opts.debug;
  const result: ImportResult = { imported: [], skipped: 0, errors: [], dry };
  if (debug) result.debugSample = [];

  const user = await getSetting("gmail_user", process.env.GMAIL_USER);
  const pass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) { result.errors.push("Gmail non connecté (identifiants manquants)."); return result; }

  const traites = new Set(await lireTraites());
  const nouveauxIds: string[] = [];

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 60 * 24 * 3600 * 1000); // 60 derniers jours
      const uids = await client.search({ subject: SUBJECT_MATCH, since }, { uid: true });
      const list = Array.isArray(uids) ? uids : [];

      for (const uid of list) {
        let raw: Buffer | null = null;
        for await (const msg of client.fetch(uid, { source: true }, { uid: true })) {
          raw = msg.source as Buffer;
        }
        if (!raw) continue;
        const parsed = await simpleParser(raw);
        const subject = parsed.subject || "";
        if (!subject.toLowerCase().includes(SUBJECT_MATCH.toLowerCase())) continue;

        const messageId = parsed.messageId || `uid-${uid}`;
        if (traites.has(messageId)) { result.skipped++; continue; }

        const body = (parsed.text && parsed.text.trim()) ? parsed.text : stripHtml(parsed.html || "");
        const d = parseDemande(body);

        if (debug && result.debugSample!.length < 2) {
          result.debugSample!.push({
            subject,
            text: (parsed.text || "").slice(0, 1400),
            htmlStripped: stripHtml(parsed.html || "").slice(0, 1400),
            parsed: d,
          });
          continue;
        }

        if (!d.email && !d.tel) { result.errors.push(`Email ${messageId} : ni email ni téléphone détectés.`); continue; }

        if (!dry) {
          try {
            await appendPrestation({
              nom: d.nom, prenom: d.prenom, tel: d.tel, email: d.email,
              typePresta: d.typePresta || "Demande de devis", quantite: "1",
              adresse: d.adresse, date: "", heure: "",
              message: d.message, prix: d.prix,
              source: "Site (formulaire)", statutClient: "NOUVEAU",
            });
            nouveauxIds.push(messageId);
          } catch (e) {
            result.errors.push(`Création client (${d.email || d.tel}) : ${e instanceof Error ? e.message : "erreur"}`);
            continue;
          }
        }
        result.imported.push({ prenom: d.prenom, email: d.email, typePresta: d.typePresta, prix: d.prix });
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    result.errors.push(`IMAP : ${e instanceof Error ? e.message : "connexion impossible"}`);
    try { await client.close(); } catch { /* ignore */ }
  }

  if (!dry && nouveauxIds.length) {
    await ecrireTraites([...Array.from(traites), ...nouveauxIds]);
  }
  return result;
}
