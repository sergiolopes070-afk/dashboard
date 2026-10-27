// ─────────────────────────────────────────────────────────────────────────────
// Relevés bancaires (section privée) — fonctions PURES : lecture des exports CSV
// Qonto / Revolut Business / Revolut perso, catégorisation, virements internes.
// Aucun accès réseau ni base ici (voir lib/banque-serveur.ts pour Supabase).
// N'est importé QUE par les routes /api/banque/* et la page privée /banque.
// ─────────────────────────────────────────────────────────────────────────────

export type CompteBanque = "qonto" | "revolut";
export const COMPTES_BANQUE: CompteBanque[] = ["qonto", "revolut"];

export const CATEGORIES_BANQUE = [
  "Produits & matériel",
  "Carburant & transport",
  "Sous-traitance / prestataires",
  "Salaires & charges sociales",
  "Impôts & taxes",
  "Assurances",
  "Banque & frais",
  "Logiciels & abonnements",
  "Téléphone & internet",
  "Publicité & marketing",
  "Loyer & locaux",
  "Repas & déplacements",
  "Retrait espèces",
  "Remboursement / avoir",
  "Encaissement client",
  "Autre",
] as const;
export const CATEGORIE_ENCAISSEMENT = "Encaissement client";

export type FormatReleve = "qonto" | "revolut-business" | "revolut-perso";

// Ligne lue dans un relevé (avant écriture en base).
export interface LigneReleve {
  date: string;              // AAAA-MM-JJ
  libelle: string;
  contrepartie: string | null;
  montant: number;           // négatif = sortie
  devise: string;
  typeOp: string;            // type banque (Revolut : CARD_PAYMENT, FEE, ATM…), "" sinon
  idBanque: string | null;   // identifiant de transaction de la banque (anti-doublon), si présent
}

// Opération telle que stockée (table banque_operations).
export interface OperationBanque {
  id: string;
  compte: CompteBanque;
  date: string;
  libelle: string;
  contrepartie: string | null;
  montant: number;
  devise: string | null;
  categorie: string | null;
  interne: boolean;
  note: string | null;
  empreinte: string;
  import_id: string | null;
  type_op: string | null;          // type banque (Revolut), sinon null
  interne_suggere: boolean;        // appariement possible à confirmer
  paire_id: string | null;         // même valeur sur les deux lignes d'un virement apparié
  manuel: boolean;                 // modifiée à la main (jamais écrasée par « similaires »)
  created_at?: string;
}

export interface RegleBanque { id?: string; motif: string; categorie: string; interne: boolean; }

// Synthèse mensuelle (GET /api/banque/resume).
export interface MoisBanque {
  mois: string;                  // AAAA-MM
  entrees: number;               // hors virements internes
  sorties: number;               // valeur positive, hors virements internes
  net: number;                   // entrees − sorties
  encaissementsClients: number;  // entrées catégorie « Encaissement client »
  internes: number;              // volume des virements internes (sorties, info)
  caDashboard: number | null;    // CA réalisé du tableau de bord sur le mois
  nb: number;
  parCategorie: Record<string, { entrees: number; sorties: number }>;
}

// ─── Normalisation ───────────────────────────────────────────────────────────

/** minuscules, sans accents, ponctuation → espace, espaces compactés. */
export function normaliser(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Texte de recherche d'une opération : libellé + contrepartie normalisés. */
export const texteOperation = (o: { libelle: string; contrepartie?: string | null }) =>
  ` ${normaliser(o.libelle)} ${normaliser(o.contrepartie)} `;

/** Mot-clé présent en mot entier (texte déjà normalisé, entouré d'espaces). */
function contientMot(texte: string, mot: string): boolean {
  const m = normaliser(mot);
  return !!m && texte.includes(` ${m} `);
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function detecterSeparateur(premiereLigne: string): string {
  const compte = (c: string) => premiereLigne.split(c).length - 1;
  const cands = [";", ",", "\t"].map(c => ({ c, n: compte(c) })).sort((a, b) => b.n - a.n);
  return cands[0].n > 0 ? cands[0].c : ",";
}

/** Découpe un CSV complet (guillemets, "" échappés, retours ligne dans un champ). */
function lireCsv(texte: string, sep: string): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [], champ = "", guill = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guill) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else guill = false; }
      else champ += c;
    } else if (c === '"') guill = true;
    else if (c === sep) { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); champ = "";
      if (ligne.some(x => x.trim() !== "")) lignes.push(ligne.map(x => x.trim()));
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some(x => x.trim() !== "")) lignes.push(ligne.map(x => x.trim()));
  return lignes;
}

/** Nettoie un montant brut : espaces, symboles monétaires, signe. */
function nettoyerMontant(brut: string): { s: string; neg: boolean } {
  let s = String(brut).replace(/[\u00a0\u202f\s]/g, "").replace(/\u2212/g, "-").replace(/[€$£]|EUR|USD|GBP/gi, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1); }
  return { s, neg };
}

/**
 * Un seul séparateur suivi d'exactement 3 chiffres (« 1,234 », « 1.234 ») :
 * milliers OU décimales — impossible à trancher, on ne devine pas.
 */
export function estMontantAmbigu(brut: string | undefined): boolean {
  if (brut == null) return false;
  return /^[1-9]\d{0,2}[.,]\d{3}$/.test(nettoyerMontant(brut).s);
}

/** "1 234,56" / "1,234.56" / "-45.00" / "−12,5 €" / "(3,20)" → nombre (null si illisible ou ambigu). */
export function lireMontant(brut: string | undefined): number | null {
  if (brut == null || estMontantAmbigu(brut)) return null;
  const n0 = nettoyerMontant(brut);
  let s = n0.s;
  const neg = n0.neg;
  if (!s) return null;
  const pv = s.lastIndexOf(","), pp = s.lastIndexOf(".");
  if (pv >= 0 && pp >= 0) {
    // Les deux : le dernier est le séparateur décimal.
    s = pv > pp ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (pv >= 0) {
    s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, ""); // 1.234.567 → milliers
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

// Date calendaire à Paris d'un instant (heure d'été / d'hiver gérées par Intl).
const FMT_PARIS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const dateParis = (ms: number) => FMT_PARIS.format(new Date(ms));

/**
 * "2026-01-15", "2026-01-15T23:30:00Z", "15/01/2026", "15-01-2026 23:22", "15.01.26" → ISO.
 * `utc` : la colonne est en UTC (en-tête « (UTC) ») → si une heure est présente, on
 * convertit en date calendaire de Paris. Un suffixe Z / ±hh:mm est toujours converti.
 */
export function lireDate(brut: string | undefined, utc = false): string | null {
  if (!brut) return null;
  const s = brut.trim();
  let a: number, mo: number, j: number, reste: string;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/);
  if (m) { a = +m[1]; mo = +m[2]; j = +m[3]; reste = m[4]; }
  else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(.*)$/);
    if (!m) return null;
    j = +m[1]; mo = +m[2]; a = +m[3]; reste = m[4];
    if (m[3].length === 2) a += 2000;
    if (mo > 12 && j <= 12) [j, mo] = [mo, j]; // MM/JJ manifeste
  }
  const iso = valideIso(a, mo, j);
  if (!iso) return null;
  const h = reste.match(/^[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?/i);
  if (!h) return iso;
  const [hh, mi, ss] = [+h[1], +h[2], +(h[3] || 0)];
  if (hh > 23 || mi > 59 || ss > 59) return iso;
  const tz = h[4];
  if (tz) {
    let decalMin = 0;
    if (tz.toUpperCase() !== "Z") {
      const t = tz.replace(":", "");
      decalMin = (t[0] === "-" ? -1 : 1) * (+t.slice(1, 3) * 60 + +t.slice(3, 5));
    }
    return dateParis(Date.UTC(a, mo - 1, j, hh, mi, ss) - decalMin * 60_000);
  }
  return utc ? dateParis(Date.UTC(a, mo - 1, j, hh, mi, ss)) : iso;
}

function valideIso(a: number, mo: number, j: number): string | null {
  if (a < 1990 || a > 2100 || mo < 1 || mo > 12 || j < 1 || j > 31) return null;
  const d = new Date(Date.UTC(a, mo - 1, j));
  if (d.getUTCMonth() !== mo - 1) return null;
  return `${a}-${String(mo).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

// ─── Détection du format ─────────────────────────────────────────────────────

/** Index de la 1re colonne dont l'en-tête normalisé vaut (ou commence par) un candidat. */
function colonne(entetes: string[], candidats: string[]): number {
  for (const c of candidats) { const i = entetes.indexOf(c); if (i >= 0) return i; }
  for (const c of candidats) { const i = entetes.findIndex(h => h.startsWith(c + " ")); if (i >= 0) return i; }
  return -1;
}

export function detecterFormat(entetes: string[]): FormatReleve | null {
  const a = (c: string[]) => colonne(entetes, c) >= 0;
  if (a(["product"]) && a(["started date"]) && a(["completed date"])) return "revolut-perso";
  if (a(["date started utc", "date completed utc", "date started", "date completed"]) && a(["state"])) return "revolut-business";
  if (a(["settlement date utc", "settlement date", "date de reglement utc", "date de reglement",
         "operation date utc", "operation date", "date de l operation utc", "date de l operation"])
      || a(["counterparty name", "nom de la contrepartie"])
      || a(["total amount incl vat", "montant total ttc"])) return "qonto";
  return null;
}

const STATUTS_REFUSES = /declin|refus|revert|revers|annul|cancel|pend|attente|reject|rejet|fail|echou|echec/;

export interface LigneIgnoree { ligne: number; raison: string; }

export interface ResultatLecture {
  format: FormatReleve;
  compte: CompteBanque;          // compte déduit du format
  lignes: LigneReleve[];
  ignorees: number;              // lignes non finalisées / ambiguës / illisibles
  ignoreesDetail: LigneIgnoree[]; // raisons (50 premières)
  avecIdentifiants: boolean;     // toutes les lignes ont un identifiant de transaction banque
}

/** Lit un export CSV. Lève une Error (message en français) si le format est inconnu. */
export function lireReleve(texteBrut: string): ResultatLecture {
  const texte = texteBrut.replace(/^\uFEFF/, "");
  const premiere = texte.split(/\r?\n/).find(l => l.trim()) || "";
  const sep = detecterSeparateur(premiere);
  const tableau = lireCsv(texte, sep);
  if (tableau.length < 2) throw new Error("Fichier vide ou illisible.");

  // En-tête : 1re ligne (parmi les 5 premières) dont le format est reconnu.
  let iEntete = -1, format: FormatReleve | null = null, entetes: string[] = [];
  for (let i = 0; i < Math.min(5, tableau.length); i++) {
    const h = tableau[i].map(normaliser);
    const f = detecterFormat(h);
    if (f) { iEntete = i; format = f; entetes = h; break; }
  }
  if (!format) throw new Error("Format non reconnu : exporte le relevé en CSV depuis Qonto ou Revolut (en-têtes d'origine).");

  const col = (c: string[]) => colonne(entetes, c);
  const estUtc = (i: number) => i >= 0 && /\butc\b/.test(entetes[i]);
  const lignes: LigneReleve[] = [];
  let ignorees = 0;
  const ignoreesDetail: LigneIgnoree[] = [];
  const ignorer = (n: number, raison: string) => { ignorees++; if (ignoreesDetail.length < 50) ignoreesDetail.push({ ligne: n, raison }); };
  const ambigu = (v: string | undefined) => `Montant ambigu « ${(v || "").trim()} » (milliers ou décimales ?)`;
  const ILLISIBLE = "Date ou montant illisible";
  const devise = (v: string | undefined) => ((v || "EUR").trim() || "EUR").toUpperCase();
  const lignesDonnees = tableau.slice(iEntete + 1).map((r, k) => ({ r, n: iEntete + 2 + k })); // n = n° de ligne (1 = en-tête)

  if (format === "qonto") {
    const iDate    = col(["settlement date utc", "settlement date", "date de reglement utc", "date de reglement"]);
    const iDateOp  = col(["operation date utc", "operation date", "date de l operation utc", "date de l operation", "date"]);
    const iMontant = col(["total amount incl vat", "montant total ttc", "amount", "montant"]);
    const iDebit   = col(["debit"]);
    const iCredit  = col(["credit"]);
    const iSens    = col(["side", "sens"]);
    const iDevise  = col(["currency", "devise"]);
    const iCp      = col(["counterparty name", "nom de la contrepartie", "counterparty", "contrepartie"]);
    const iLabel   = col(["label", "libelle", "label 1"]);
    const iRef     = col(["reference"]);
    const iStatut  = col(["status", "statut"]);
    const iId      = col(["transaction id", "id de transaction", "id de la transaction", "id transaction"]);
    for (const { r, n } of lignesDonnees) {
      const statut = normaliser(r[iStatut]);
      if (iStatut >= 0 && statut && STATUTS_REFUSES.test(statut)) { ignorer(n, `Opération non finalisée (${r[iStatut]})`); continue; }
      const date = lireDate(r[iDate], estUtc(iDate)) || lireDate(r[iDateOp], estUtc(iDateOp));
      let montant: number | null = null;
      if (iMontant >= 0 && (r[iMontant] || "").trim()) {
        if (estMontantAmbigu(r[iMontant])) { ignorer(n, ambigu(r[iMontant])); continue; }
        montant = lireMontant(r[iMontant]);
      }
      if (montant == null && (iDebit >= 0 || iCredit >= 0)) {
        if (estMontantAmbigu(r[iDebit]) || estMontantAmbigu(r[iCredit])) { ignorer(n, ambigu(estMontantAmbigu(r[iDebit]) ? r[iDebit] : r[iCredit])); continue; }
        const d = lireMontant(r[iDebit]), c = lireMontant(r[iCredit]);
        if (d) montant = -Math.abs(d); else if (c) montant = Math.abs(c);
      }
      if (montant != null && iSens >= 0) {
        const sens = normaliser(r[iSens]);
        if (sens.startsWith("debit")) montant = -Math.abs(montant);
        else if (sens.startsWith("credit")) montant = Math.abs(montant);
      }
      const cp = (r[iCp] || "").trim() || null;
      const libelle = ((r[iLabel] || "").trim() || cp || (r[iRef] || "").trim() || "Opération").slice(0, 300);
      if (!date || montant == null || montant === 0) { ignorer(n, ILLISIBLE); continue; }
      lignes.push({ date, libelle, contrepartie: cp, montant, devise: devise(r[iDevise]), typeOp: "", idBanque: (r[iId] || "").trim() || null });
    }
  } else if (format === "revolut-business") {
    const iFin     = col(["date completed utc", "date completed"]);
    const iDebut   = col(["date started utc", "date started"]);
    const iType    = col(["type"]);
    const iEtat    = col(["state"]);
    const iDesc    = col(["description"]);
    const iRef     = col(["reference"]);
    const iCp      = col(["counterparty", "beneficiary", "payee"]);
    const iTotal   = col(["total amount"]);
    const iMontant = col(["amount"]);
    const iFrais   = col(["fee"]);
    const iDevise  = col(["payment currency", "account currency", "currency"]);
    const iId      = entetes.indexOf("id");
    for (const { r, n } of lignesDonnees) {
      if (normaliser(r[iEtat]) !== "completed") { ignorer(n, `Opération non finalisée (${r[iEtat] || "état vide"})`); continue; }
      const date = lireDate(r[iFin], estUtc(iFin)) || lireDate(r[iDebut], estUtc(iDebut));
      const brutTotal = iTotal >= 0 ? r[iTotal] : undefined;
      if (estMontantAmbigu(brutTotal)) { ignorer(n, ambigu(brutTotal)); continue; }
      let montant = brutTotal !== undefined ? lireMontant(brutTotal) : null;
      if (montant == null) {
        if (estMontantAmbigu(r[iMontant]) || estMontantAmbigu(r[iFrais])) { ignorer(n, ambigu(estMontantAmbigu(r[iMontant]) ? r[iMontant] : r[iFrais])); continue; }
        const a = lireMontant(r[iMontant]);
        const f = lireMontant(r[iFrais]) || 0;
        montant = a == null ? null : Math.round((a - Math.abs(f)) * 100) / 100;
      }
      const libelle = ((r[iDesc] || "").trim() || (r[iRef] || "").trim() || (r[iType] || "").trim() || "Opération").slice(0, 300);
      if (!date || montant == null || montant === 0) { ignorer(n, ILLISIBLE); continue; }
      lignes.push({
        date, libelle, contrepartie: (r[iCp] || "").trim() || null, montant,
        devise: devise(r[iDevise]), typeOp: (r[iType] || "").trim().toUpperCase(), idBanque: iId >= 0 ? (r[iId] || "").trim() || null : null,
      });
    }
  } else {
    // Revolut perso : Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
    // (heures locales, pas d'identifiant de transaction).
    const iType = col(["type"]), iFin = col(["completed date"]), iDebut = col(["started date"]);
    const iDesc = col(["description"]), iMontant = col(["amount"]), iFrais = col(["fee"]);
    const iDevise = col(["currency"]), iEtat = col(["state"]);
    for (const { r, n } of lignesDonnees) {
      if (normaliser(r[iEtat]) !== "completed") { ignorer(n, `Opération non finalisée (${r[iEtat] || "état vide"})`); continue; }
      const date = lireDate(r[iFin], estUtc(iFin)) || lireDate(r[iDebut], estUtc(iDebut));
      if (estMontantAmbigu(r[iMontant]) || estMontantAmbigu(r[iFrais])) { ignorer(n, ambigu(estMontantAmbigu(r[iMontant]) ? r[iMontant] : r[iFrais])); continue; }
      const a = lireMontant(r[iMontant]);
      const f = lireMontant(r[iFrais]) || 0;
      const montant = a == null ? null : Math.round((a - Math.abs(f)) * 100) / 100;
      const libelle = ((r[iDesc] || "").trim() || (r[iType] || "").trim() || "Opération").slice(0, 300);
      if (!date || montant == null || montant === 0) { ignorer(n, ILLISIBLE); continue; }
      lignes.push({ date, libelle, contrepartie: null, montant, devise: devise(r[iDevise]), typeOp: (r[iType] || "").trim().toUpperCase(), idBanque: null });
    }
  }
  const compte: CompteBanque = format === "qonto" ? "qonto" : "revolut";
  return { format, compte, lignes, ignorees, ignoreesDetail, avecIdentifiants: lignes.length > 0 && lignes.every(l => !!l.idBanque) };
}

// ─── Catégorisation ──────────────────────────────────────────────────────────

/** Règle utilisateur applicable (motif le plus long gagne). */
export function regleApplicable(o: { libelle: string; contrepartie?: string | null }, regles: RegleBanque[]): RegleBanque | null {
  let best: RegleBanque | null = null;
  for (const r of regles) {
    if (correspondMotif(o, r.motif) && (!best || normaliser(r.motif).length > normaliser(best.motif).length)) best = r;
  }
  return best;
}

// Ordre important : la 1re catégorie qui correspond l'emporte.
const MOTS_SORTIES: [string, string[]][] = [
  ["Retrait espèces", ["retrait", "retrait dab", "dab", "atm", "cash withdrawal", "withdrawal"]],
  ["Publicité & marketing", ["google ads", "adwords", "facebk", "facebook", "meta platforms", "meta", "instagram", "tiktok", "linkedin", "mailchimp", "brevo", "sendinblue", "pages jaunes", "solocal", "vistaprint", "canva"]],
  ["Repas & déplacements", ["restaurant", "resto", "mcdonald", "mcdonalds", "mc donald", "burger king", "kfc", "uber eats", "deliveroo", "boulangerie", "cafe", "starbucks", "sushi", "pizza", "hotel", "booking", "airbnb", "brioche doree", "subway"]],
  ["Carburant & transport", ["total", "totalenergies", "total energies", "esso", "shell", "bp", "avia", "station", "carburant", "gazole", "essence", "peage", "autoroute", "sanef", "aprr", "vinci autoroutes", "asf", "parking", "indigo", "saemes", "sncf", "ratp", "navigo", "uber", "bolt", "free now", "freenow", "flixbus", "blablacar", "dyneff", "agip", "q8"]],
  ["Salaires & charges sociales", ["urssaf", "salaire", "salaires", "paie", "net entreprises", "retraite", "agirc", "arrco", "humanis", "malakoff", "prevoyance", "mutuelle", "pole emploi", "france travail", "cotisations sociales"]],
  ["Impôts & taxes", ["dgfip", "impot", "impots", "tresor public", "cfe", "tva", "amende", "antai", "finances publiques"]],
  ["Assurances", ["assurance", "assurances", "axa", "maaf", "maif", "macif", "matmut", "allianz", "groupama", "generali", "hiscox", "swisslife", "april", "mma", "gmf"]],
  ["Téléphone & internet", ["orange", "sfr", "free", "free mobile", "bouygues", "bouygues telecom", "sosh", "red by sfr", "b and you", "la poste mobile", "prixtel", "nrj mobile"]],
  ["Logiciels & abonnements", ["google", "microsoft", "adobe", "ovh", "vercel", "notion", "github", "openai", "chatgpt", "anthropic", "claude", "apple", "icloud", "itunes", "dropbox", "figma", "supabase", "wix", "shopify", "zapier", "slack", "zoom", "hostinger", "ionos", "o2switch", "resend", "twilio", "calendly", "pennylane", "indy", "tiime", "spotify", "netflix", "amazon prime", "wordpress", "elementor"]],
  ["Loyer & locaux", ["loyer", "edf", "engie", "syndic", "foncia", "nexity", "veolia", "suez", "electricite", "shurgard", "homebox", "annexx"]],
  ["Produits & matériel", ["leroy merlin", "castorama", "brico", "bricomarche", "brico depot", "bricodepot", "manomano", "amazon", "amzn", "action", "gifi", "ikea", "karcher", "metro", "promocash", "cdiscount", "darty", "boulanger", "lidl", "carrefour", "auchan", "leclerc", "intermarche", "super u", "monoprix", "franprix", "point p", "weldom", "wurth", "rubbermaid", "nilfisk"]],
  ["Sous-traitance / prestataires", ["sous traitance", "prestation", "prestations", "freelance", "malt", "fiverr", "upwork"]],
  ["Remboursement / avoir", ["remboursement", "rembt", "refund", "avoir"]],
];
const MOTS_REMBOURSEMENT = ["remboursement", "rembt", "refund", "avoir", "retour", "card refund"];

/**
 * Catégorie devinée (après les règles) — mots-clés + sens + type Revolut.
 * `compte` permet de distinguer les frais de SA banque d'un virement vers l'autre.
 */
export function categorieHeuristique(o: LigneReleve | { libelle: string; contrepartie: string | null; montant: number; typeOp?: string }, compte: CompteBanque): string {
  const t = texteOperation(o);
  const type = (("typeOp" in o && o.typeOp) || "").toUpperCase();
  if (type === "ATM") return "Retrait espèces";
  if (type === "FEE") return "Banque & frais";
  if (type.includes("REFUND")) return "Remboursement / avoir";

  if (o.montant > 0) {
    if (MOTS_REMBOURSEMENT.some(m => contientMot(t, m))) return "Remboursement / avoir";
    if (["dgfip", "tresor public", "finances publiques"].some(m => contientMot(t, m))) return "Remboursement / avoir";
    return CATEGORIE_ENCAISSEMENT; // virements clients, Stripe, SumUp, URSSAF avance immédiate…
  }
  // Frais de la banque elle-même (le nom de l'AUTRE banque = virement interne, voir estInterneParNom).
  if (contientMot(t, compte) || ["frais", "fee", "fees", "commission", "agios", "plan fee", "cotisation carte"].some(m => contientMot(t, m))) return "Banque & frais";
  for (const [cat, mots] of MOTS_SORTIES) if (mots.some(m => contientMot(t, m))) return cat;
  return "Autre";
}

// Noms qui signalent un mouvement entre MES comptes (sociétés du patron).
const NOMS_MES_COMPTES = ["kinouclean", "kinou clean", "kinourent", "kinou rent"];

/** Virement interne détecté par le libellé / la contrepartie (heuristique c). */
export function estInterneParNom(o: { libelle: string; contrepartie: string | null; typeOp?: string }, compte: CompteBanque): boolean {
  if ((o.typeOp || "").toUpperCase() === "EXCHANGE") return true; // change entre poches Revolut
  const autre = compte === "qonto" ? "revolut" : "qonto";
  const t = texteOperation(o);
  if (contientMot(t, autre)) return true;
  // Nom de mes sociétés : sur la contrepartie si elle existe (un client peut citer
  // « Kinouclean » dans son libellé de virement), sinon sur le libellé.
  const cible = o.contrepartie ? ` ${normaliser(o.contrepartie)} ` : t;
  return NOMS_MES_COMPTES.some(n => contientMot(cible, n));
}

const MOTS_VIREMENT_INTERNE = [
  "virement interne", "transfert interne", "entre mes comptes", "transfer to", "transfer from",
  "top up", "topup", "money added", "alimentation", "approvisionnement",
];

/**
 * Indice supplémentaire qu'une opération est un virement entre mes comptes —
 * exigé (sur l'une des deux lignes) pour appliquer AUTOMATIQUEMENT un appariement
 * montant/date ; sans indice, l'appariement n'est qu'une suggestion à confirmer.
 */
export function indiceVirementInterne(o: { libelle: string; contrepartie: string | null; typeOp?: string | null }, compte: CompteBanque): boolean {
  const type = (o.typeOp || "").toUpperCase();
  // TRANSFER seul n'est PAS un indice : chez Revolut il couvre aussi un virement
  // à un fournisseur (→ simple suggestion à confirmer, sauf autre indice ci-dessous).
  if (type === "EXCHANGE" || type === "TOPUP") return true;
  if (estInterneParNom({ ...o, typeOp: type }, compte)) return true;
  const t = texteOperation(o);
  return MOTS_VIREMENT_INTERNE.some(m => contientMot(t, m));
}

// ─── Règles « opérations similaires » ────────────────────────────────────────

const MOTS_BRUIT = new Set([
  "cb", "carte", "card", "paiement", "payment", "achat", "prlv", "prelevement", "sepa", "vir", "virement",
  "inst", "instantane", "recu", "emis", "de", "du", "la", "le", "les", "des", "to", "from", "par", "pour",
  "transfer", "transfert", "facture", "fact", "ref", "num", "n", "eur", "x", "le", "au", "en",
]);

/** Motif d'une opération pour une règle : contrepartie (sinon libellé) nettoyée, 3 mots max. */
export function motifDe(o: { libelle: string; contrepartie?: string | null }): string {
  const base = normaliser(o.contrepartie) || normaliser(o.libelle);
  const mots = base.split(" ").filter(m => m && !/\d/.test(m) && !MOTS_BRUIT.has(m) && m.length > 1);
  return mots.slice(0, 3).join(" ").slice(0, 40);
}

/** Vrai si l'opération contient le motif (mots entiers). */
export function correspondMotif(o: { libelle: string; contrepartie?: string | null }, motif: string): boolean {
  const m = normaliser(motif);
  return m.length >= 3 && texteOperation(o).includes(` ${m} `);
}

// ─── Formats ─────────────────────────────────────────────────────────────────

export function libelleFormat(f: FormatReleve): string {
  return f === "qonto" ? "Qonto" : f === "revolut-business" ? "Revolut Business" : "Revolut (perso)";
}
