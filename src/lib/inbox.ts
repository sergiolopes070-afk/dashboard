// ─────────────────────────────────────────────────────────────────────────────
// Import des demandes de devis reçues par email (formulaire du site kinouclean.fr).
// Lit la boîte Gmail en IMAP (mot de passe d'application), repère les emails
// « Nouvelle demande de devis » envoyés par contact@kinouclean.fr, extrait les
// champs et crée automatiquement un PROSPECT (statut NOUVEAU) dans le dashboard —
// le lead est ensuite qualifié/relancé puis converti en client à la main.
//
// Double anti-doublon :
//   • Message-ID déjà traités (settings/inbox_processed) → jamais réimporté.
//   • Prospect OU client existant (même email/tél) → jamais recréé.
// ─────────────────────────────────────────────────────────────────────────────
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { supabase } from "./supabase";
import { getSetting } from "./mailer";
import { getSettingJSON, setSettingRaw } from "./settings";

const SUBJECT_MATCH = "Nouvelle demande de devis";
const FROM_MATCH = "contact@kinouclean.fr"; // n'importer QUE les emails du formulaire du site
const PROCESSED_KEY = "inbox_processed";

// ─── Suivi des emails déjà importés (lecture fraîche via helper settings) ─────────
async function lireTraites(): Promise<string[]> {
  return getSettingJSON<string[]>(PROCESSED_KEY, []);
}
async function ecrireTraites(ids: string[]): Promise<void> {
  await setSettingRaw(PROCESSED_KEY, JSON.stringify(ids.slice(-2000)));
}

// 2ᵉ garde-fou : ce lead existe-t-il déjà (même email OU téléphone) — soit comme
// PROSPECT, soit comme CLIENT déjà en base ? (indépendant du suivi des Message-ID
// → doublon impossible même en cas de bug.)
async function leadExisteDeja(email: string, tel: string): Promise<boolean> {
  if (!supabase) return false;
  const conds: string[] = [];
  if (email) conds.push(`email.eq.${email}`);
  if (tel)   conds.push(`tel.eq.${tel}`);
  if (!conds.length) return false;
  const filtre = conds.join(",");
  const [prospect, client] = await Promise.all([
    supabase.from("prospects").select("id").or(filtre).limit(1),
    supabase.from("clients").select("id").or(filtre).limit(1),
  ]);
  return ((prospect.data?.length ?? 0) > 0) || ((client.data?.length ?? 0) > 0);
}

// ─── Parsing du corps de l'email en champs ──────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/td|\/tr|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;/g, " ");
}

function normLabel(l: string): string {
  return l.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export interface DemandeParsee {
  prenom: string; nom: string; email: string; tel: string;
  typePresta: string; adresse: string; prix: string; message: string;
}

// Libellés possibles dans l'email (la valeur SUIT le libellé, sur la même ligne).
const LABELS = [
  "Prestation", "Type de prestation", "Prénom", "Prenom", "Nom", "Email", "E-mail",
  "Téléphone", "Telephone", "Adresse", "Nombre de places", "Surface du logement",
  "Surface", "Taille du canapé", "Fréquence des interventions", "Fréquence",
  "Créneau préféré", "Créneau", "Message", "Description",
];
const CORE_NORM = ["PRESTATION", "TYPE DE PRESTATION", "PRENOM", "NOM", "EMAIL", "E-MAIL", "TELEPHONE", "ADRESSE"];

export function parseDemande(text: string, subject = ""): DemandeParsee {
  let t = text.replace(/\s+/g, " ").trim();
  // Fin des champs : bouton « Rappeler … » / pied de page.
  const fin = t.search(/\bRappeler\b|Pensez à recontacter/i);
  if (fin > 0) t = t.slice(0, fin);

  // Email & téléphone : extraction directe (fiable via texte + liens tel:/mailto:).
  const email = (t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [""])[0].trim();
  const telM = t.match(/tel:(\+?\d[\d ]*)/i) || t.match(/T[ée]l[ée]phone\s+(\+?[\d ]{6,})/i);
  const tel = telM ? telM[1].replace(/[^\d+]/g, "") : "";

  // Ancre chaque libellé, puis découpe la valeur entre deux libellés successifs.
  const anchors: { orig: string; norm: string; labelStart: number; valStart: number }[] = [];
  for (const lab of LABELS) {
    const re = new RegExp("(?:^|\\s)" + lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=\\s|:)", "i");
    const m = re.exec(t);
    if (m) {
      const labelStart = m.index + (m[0].length - lab.length);
      anchors.push({ orig: lab, norm: normLabel(lab), labelStart, valStart: labelStart + lab.length });
    }
  }
  anchors.sort((a, b) => a.valStart - b.valStart);

  const clean = (s: string) => s.replace(/^[:\s]+/, "").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const map: Record<string, string> = {};
  const details: string[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const next = anchors[i + 1];
    const value = clean(t.slice(anchors[i].valStart, next ? next.labelStart : t.length));
    if (map[anchors[i].norm] === undefined) map[anchors[i].norm] = value;
    if (!CORE_NORM.includes(anchors[i].norm) && value) {
      details.push(`${anchors[i].orig.charAt(0).toUpperCase()}${anchors[i].orig.slice(1)} : ${value}`);
    }
  }
  const get = (labs: string[]) => { for (const l of labs) if (map[l]) return map[l]; return ""; };

  const prenom = get(["PRENOM"]);
  const nom = get(["NOM"]);
  const adresse = get(["ADRESSE"]);
  let typePresta = get(["PRESTATION", "TYPE DE PRESTATION"]);
  if (!typePresta && subject) {
    const parts = subject.split(/[–—-]/);
    if (parts.length > 1) typePresta = parts.slice(1).join("-").trim();
  }
  const prixM = t.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*€/);
  const prix = prixM ? prixM[1].replace(/\s/g, "").replace(",", ".") : "";
  const message = details.join("\n");
  return { prenom, nom, email, tel, typePresta, adresse, prix, message };
}

// ─── Import IMAP ────────────────────────────────────────────────────────────────
export interface ImportResult {
  imported: { prenom: string; email: string; typePresta: string; prix: string }[];
  skipped: number;
  errors: string[];
  dry: boolean;
  debugSample?: { from: string; subject: string; text: string; htmlStripped: string; parsed: DemandeParsee }[];
  totalTrouves?: number;
}

export async function importInbox(opts: { dry?: boolean; debug?: boolean; days?: number; baseline?: boolean } = {}): Promise<ImportResult> {
  const dry = !!opts.dry;
  const debug = !!opts.debug;
  const baseline = !!opts.baseline; // marque comme traité sans créer (ignore l'historique)
  const days = opts.days && opts.days > 0 ? opts.days : 60;
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
      const since = new Date(Date.now() - days * 24 * 3600 * 1000);
      const uids = await client.search({ from: FROM_MATCH, subject: SUBJECT_MATCH, since }, { uid: true });
      const list = Array.isArray(uids) ? uids : [];
      if (debug) result.totalTrouves = list.length;

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

        // Baseline : on marque l'email comme traité SANS créer de client (sert à
        // ignorer l'historique et ne traiter que les nouvelles demandes ensuite).
        if (baseline && !dry) { nouveauxIds.push(messageId); result.skipped++; continue; }

        const body = (parsed.text && parsed.text.trim()) ? parsed.text : stripHtml(parsed.html || "");
        const d = parseDemande(body, subject);

        if (debug && result.debugSample!.length < 2) {
          result.debugSample!.push({
            from: parsed.from?.text || "(inconnu)",
            subject,
            text: (parsed.text || "").slice(0, 1400),
            htmlStripped: stripHtml(parsed.html || "").slice(0, 1400),
            parsed: d,
          });
          continue;
        }

        if (!d.email && !d.tel) { result.errors.push(`Email ${messageId} : ni email ni téléphone détectés.`); continue; }

        // 2ᵉ garde-fou : si un prospect OU un client avec ce même email/tél existe
        // déjà, on NE crée rien (on marque juste l'email comme traité). Doublon impossible.
        if (await leadExisteDeja(d.email, d.tel)) {
          if (!dry) nouveauxIds.push(messageId);
          result.skipped++;
          continue;
        }

        if (!dry) {
          try {
            // Le lead entrant devient un PROSPECT au statut NOUVEAU (pipeline de
            // recontact), pas un client : on qualifie avant de convertir.
            if (!supabase) throw new Error("Supabase non configuré");
            const { error } = await supabase.from("prospects").insert({
              prenom     : d.prenom || "",
              nom        : d.nom || "",
              tel        : d.tel || null,
              email      : d.email || null,
              source     : "Site (formulaire)",
              type_presta: d.typePresta || "Demande de devis",
              adresse    : d.adresse || null,
              budget     : d.prix || null,     // estimation du formulaire
              notes      : d.message || null,
              statut     : "NOUVEAU",
              commentaires: [],
            });
            if (error) throw new Error(error.message);
            nouveauxIds.push(messageId);
          } catch (e) {
            result.errors.push(`Création prospect (${d.email || d.tel}) : ${e instanceof Error ? e.message : "erreur"}`);
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
