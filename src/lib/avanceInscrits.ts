// ─────────────────────────────────────────────────────────────────────────────
// Détection des inscriptions à l'Avance Immédiate.
// KinouClean reçoit un email d'« Avance Immédiate Services » quand un client
// s'inscrit (objet : « … s'est inscrit(e) à l'Avance Immédiate [0681369512] »).
// On lit la boîte Gmail en IMAP, on extrait nom + téléphone + email, et on
// mémorise l'identité (settings/avance_inscrits) pour afficher un badge vert
// « Inscrit avance immédiate » dans la fiche client (match par tél OU email).
// ─────────────────────────────────────────────────────────────────────────────
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getSetting } from "./mailer";
import { getSettingJSON, setSettingRaw } from "./settings";
import { normEmail, normTel } from "./inbox";

const FROM_MATCH = "avanceimmediate.com";       // expéditeur : contact@avanceimmediate.com
const SUBJECT_MATCH = "Avance Immédiate";       // + « inscrit » (voir filtre plus bas)
const KEY = "avance_inscrits";

export interface Inscrit { tel: string; email: string; nom: string; at: string }

export async function getInscrits(): Promise<Inscrit[]> {
  const arr = await getSettingJSON<Inscrit[]>(KEY, []);
  return Array.isArray(arr) ? arr : [];
}

// Un client est-il inscrit ? Match par téléphone OU email (normalisés).
export function estInscrit(inscrits: Inscrit[], tel?: string | null, email?: string | null): Inscrit | null {
  const t = normTel(tel || "");
  const e = normEmail(email || "");
  if (!t && !e) return null;
  return inscrits.find(i => (t && i.tel && i.tel === t) || (e && i.email && i.email === e)) || null;
}

// Retire la civilité en tête de nom (Mme, M., Monsieur, Madame, Mlle…).
function nettoyerNom(s: string): string {
  return s.replace(/^\s*(mme|madame|m\.?|mr\.?|monsieur|mlle|mademoiselle)\s+/i, "").trim();
}

export async function scanAvanceInscrits(opts: { days?: number } = {}): Promise<{ trouves: number; ajoutes: number; nouveaux: Inscrit[] }> {
  const days = opts.days && opts.days > 0 ? opts.days : 90;
  const user = await getSetting("gmail_user", process.env.GMAIL_USER);
  const pass = await getSetting("gmail_app_password", process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) return { trouves: 0, ajoutes: 0, nouveaux: [] };

  const existants = await getInscrits();
  // Clé d'unicité = tél + email, pour ne pas ré-ajouter deux fois la même personne.
  const vus = new Set(existants.map(i => `${i.tel}|${i.email}`));
  const nouveaux: Inscrit[] = [];
  let trouves = 0;

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000);
      const uids = await client.search({ from: FROM_MATCH, since }, { uid: true });
      const list = Array.isArray(uids) ? uids : [];
      for (const uid of list) {
        let raw: Buffer | null = null;
        for await (const msg of client.fetch(uid, { source: true }, { uid: true })) raw = msg.source as Buffer;
        if (!raw) continue;
        const parsed = await simpleParser(raw);
        const subject = parsed.subject || "";
        if (!subject.toLowerCase().includes(SUBJECT_MATCH.toLowerCase()) || !/inscrit/i.test(subject)) continue;
        trouves++;

        const body = (parsed.text && parsed.text.trim()) ? parsed.text : (parsed.html || "").replace(/<[^>]+>/g, " ");

        // Téléphone : d'abord entre crochets dans l'objet, sinon dans le corps.
        const telM = subject.match(/\[(\+?\d[\d\s]*)\]/) || body.match(/(?:t[ée]l[ée]phone|tel)\s*:?\s*(\+?[\d][\d\s]{6,})/i);
        const tel = telM ? normTel(telM[1]) : "";
        // Email : 1er email du corps qui n'est ni l'expéditeur ni KinouClean.
        const emails = (body.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])
          .map(normEmail)
          .filter(e => !e.includes("avanceimmediate") && !e.includes("kinouclean"));
        const email = emails[0] || "";
        // Nom : partie de l'objet avant « s'est inscrit ».
        const nom = nettoyerNom((subject.split(/s['’]est inscrit/i)[0] || "").trim());

        if (!tel && !email) continue;
        const cle = `${tel}|${email}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const rec: Inscrit = { tel, email, nom, at: (parsed.date ? new Date(parsed.date) : new Date()).toISOString() };
        nouveaux.push(rec);
      }
    } finally { lock.release(); }
    await client.logout();
  } catch {
    try { await client.close(); } catch { /* ignore */ }
  }

  if (nouveaux.length) {
    await setSettingRaw(KEY, JSON.stringify([...existants, ...nouveaux].slice(-5000)));
  }
  return { trouves, ajoutes: nouveaux.length, nouveaux };
}
