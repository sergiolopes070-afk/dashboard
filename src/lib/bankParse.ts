// ─────────────────────────────────────────────────────────────────────────────
// Lecture d'un relevé bancaire (CSV/TSV exporté depuis la banque) → dépenses.
// 100 % local, sans API : on lit le fichier, on repère date/libellé/montant, on
// catégorise automatiquement par mots-clés, et on ne garde que les SORTIES (débits).
// Un aperçu est toujours présenté avant création : rien n'est importé à l'aveugle.
// ─────────────────────────────────────────────────────────────────────────────

export interface BankRow {
  date: string;       // YYYY-MM-DD
  label: string;      // libellé nettoyé
  amount: number;     // montant de la dépense (> 0 = argent sorti)
  categorie: string;  // catégorie devinée
  type: "ponctuel" | "mensuel";
  raw: string;        // ligne d'origine (traçabilité)
}

// ── Auto-catégorisation par mots-clés (minuscule, sans accent) ────────────────
// `mensuel` marque les charges typiquement récurrentes (pré-cochées « mensuel »).
const CAT_RULES: { cat: string; mensuel?: boolean; kw: string[] }[] = [
  { cat: "Matériel", kw: ["leroy merlin", "castorama", "brico", "bricorama", "weldom", "point p", "pointp", "manomano", "mr bricolage", "bricomarche", "bricodepot", "brico depot", "ikea", "conforama", "action", "gifi", "hyperburo", "bureau vallee", "cultura"] },
  { cat: "Transport", mensuel: false, kw: ["total", "totalenergies", "esso", "bp ", "shell", "avia", "station", "carburant", "essence", "gazole", "sncf", "uber", "ratp", "navigo", "peage", "autoroute", "vinci autoroute", "sanef", "aprr", "parking", "indigo", "flixbus", "blablacar"] },
  { cat: "Local / Loyer", mensuel: true, kw: ["loyer", "edf", "engie", "totalenergies elec", "gaz de", "veolia", "suez", "eau ", "eaux", "syndic", "foncia", "nexity", "electricite"] },
  { cat: "Logiciels / Abonnements", mensuel: true, kw: ["google", "microsoft", "adobe", "ovh", "vercel", "notion", "canva", "spotify", "apple.com", "apple bill", "itunes", "icloud", "github", "openai", "chatgpt", "orange", "sfr", "free ", "free mobile", "bouygues", "sosh", "netflix", "dropbox", "figma", "supabase"] },
  { cat: "Marketing / Pub", mensuel: false, kw: ["facebook", "facebk", "meta platforms", "meta pla", "google ads", "adwords", "tiktok ads", "mailchimp", "sendinblue", "brevo", "hootsuite", "linkedin"] },
  { cat: "Salaires / Charges", mensuel: true, kw: ["urssaf", "salaire", "paie", "virement salaire", "pole emploi", "impot", "impots", "dgfip", "tresor public", "rsi", "net entreprises", "cotisation", "prevoyance", "mutuelle", "assurance", "maaf", "axa", "matmut", "maif", "allianz", "groupama", "generali", "swisslife"] },
  { cat: "Sous-traitance", mensuel: false, kw: ["sous-traitance", "sous traitance", "prestation", "freelance", "malt", "fiverr", "upwork"] },
];

export function stripAccentsLower(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function categorize(label: string): { categorie: string; type: "ponctuel" | "mensuel" } {
  const l = stripAccentsLower(label);
  for (const rule of CAT_RULES) {
    if (rule.kw.some(k => l.includes(k))) {
      return { categorie: rule.cat, type: rule.mensuel ? "mensuel" : "ponctuel" };
    }
  }
  return { categorie: "Autre", type: "ponctuel" };
}

// ── Parsing des montants « 1 234,56 » / « -45,00 » / « 1.234,56 € » ────────────
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/ /g, " ").replace(/[€\s]/g, "").trim();
  if (!s || s === "-" || s === "+") return null;
  const neg = /^-/.test(s) || /^\(.*\)$/.test(s); // -x ou (x) = négatif
  s = s.replace(/[()]/g, "").replace(/^[-+]/, "");
  // Format FR : virgule décimale, point/espace = milliers.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

// ── Dates « 31/07/2026 », « 31-07-26 », « 2026-07-31 » → YYYY-MM-DD ────────────
export function toIsoDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);      // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);      // FR jj/mm/aaaa
  if (m) {
    const d = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = (parseInt(y, 10) > 70 ? "19" : "20") + y;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

// ── Découpage CSV (gère un délimiteur + guillemets) ───────────────────────────
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const counts: Record<string, number> = {
    ";": (sample.match(/;/g) || []).length,
    "\t": (sample.match(/\t/g) || []).length,
    ",": (sample.match(/,/g) || []).length,
  };
  // ; puis tab priment (les montants FR utilisent la virgule décimale).
  if (counts[";"] > 0) return ";";
  if (counts["\t"] > 0) return "\t";
  return ",";
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === delim && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const HEADER_HINTS = ["date", "libell", "label", "nature", "operation", "opération", "montant", "debit", "débit", "credit", "crédit", "valeur", "detail"];

export interface ParseResult {
  rows: BankRow[];        // dépenses détectées (sorties)
  ignoredCredits: number; // entrées d'argent ignorées
  ignoredRows: number;    // lignes illisibles
  total: number;          // somme des dépenses
}

export function parseStatement(text: string): ParseResult {
  const delim = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows: BankRow[] = [];
  let ignoredCredits = 0, ignoredRows = 0;

  // Repère la ligne d'en-tête (contient plusieurs mots-clés connus).
  let headerIdx = -1, header: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cells = splitLine(lines[i], delim).map(c => stripAccentsLower(c));
    const hits = cells.filter(c => HEADER_HINTS.some(h => c.includes(h))).length;
    if (hits >= 2) { headerIdx = i; header = cells; break; }
  }

  // Indices de colonnes (par en-tête si trouvé, sinon détection auto par ligne).
  const findCol = (keys: string[]) => header.findIndex(c => keys.some(k => c.includes(k)));
  const iDate   = findCol(["date"]);
  const iLabel  = findCol(["libell", "label", "nature", "operation", "detail"]);
  const iDebit  = findCol(["debit"]);
  const iCredit = findCol(["credit"]);
  const iAmount = findCol(["montant", "valeur"]);

  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    if (cells.length < 2) { ignoredRows++; continue; }

    // Date
    let dateIso: string | null = null;
    if (iDate >= 0 && cells[iDate]) dateIso = toIsoDate(cells[iDate]);
    if (!dateIso) for (const c of cells) { const d = toIsoDate(c); if (d) { dateIso = d; break; } }

    // Montant : colonnes débit/crédit séparées, sinon montant signé, sinon 1er nombre.
    let amount: number | null = null;
    if (iDebit >= 0 || iCredit >= 0) {
      const deb = iDebit >= 0 ? parseAmount(cells[iDebit] || "") : null;
      const cre = iCredit >= 0 ? parseAmount(cells[iCredit] || "") : null;
      if (deb && Math.abs(deb) > 0) amount = -Math.abs(deb);        // débit = sortie
      else if (cre && Math.abs(cre) > 0) amount = Math.abs(cre);    // crédit = entrée
    } else if (iAmount >= 0) {
      amount = parseAmount(cells[iAmount] || "");
    }
    if (amount == null) {
      // Détection auto : dernier champ numérique de la ligne.
      for (let j = cells.length - 1; j >= 0; j--) { const a = parseAmount(cells[j]); if (a != null) { amount = a; break; } }
    }

    // Libellé : colonne dédiée, sinon le plus long champ texte non numérique.
    let label = iLabel >= 0 ? (cells[iLabel] || "") : "";
    if (!label) {
      label = cells
        .filter(c => parseAmount(c) == null && !toIsoDate(c))
        .sort((a, b) => b.length - a.length)[0] || "";
    }
    label = label.replace(/\s+/g, " ").trim();

    if (!dateIso || amount == null || !label) { ignoredRows++; continue; }
    if (amount >= 0) { ignoredCredits++; continue; } // on ne garde que les sorties

    const { categorie, type } = categorize(label);
    rows.push({ date: dateIso, label, amount: Math.abs(amount), categorie, type, raw: lines[i] });
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, ignoredCredits, ignoredRows, total };
}

// Clé d'unicité pour l'anti-doublon (date + montant + début du libellé).
export function rowKey(date: string, montant: number, nom: string): string {
  return `${date}|${montant.toFixed(2)}|${stripAccentsLower(nom).slice(0, 24)}`;
}
