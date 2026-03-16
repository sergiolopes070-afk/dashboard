import { google } from "googleapis";
import { COL, Prestation, Prestataire, SHEET_NAME, SHEET_PRESTA, SHEET_ARCHIVE } from "./constants";

function getAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "";
  if (!keyRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY manquant dans .env.local");

  let credentials;
  try {
    credentials = JSON.parse(Buffer.from(keyRaw, "base64").toString("utf-8"));
  } catch {
    credentials = JSON.parse(keyRaw);
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

const EDITABLE_FIELDS: Record<string, number> = {
  prix        : COL.PRIX,
  envoyer     : COL.ENVOYER,
  statut      : COL.STATUT,
  prestataire : COL.PRESTATAIRE,
  emailPresta : COL.EMAIL_PRESTA,
  commentaire : COL.COMMENTAIRE,
  statutPresta: COL.STATUT_PRESTA,
  genDevis    : COL.GEN_DEVIS,
  date        : COL.DATE,
  heure       : COL.HEURE,
  nom         : COL.NOM,
  prenom      : COL.PRENOM,
  tel         : COL.TEL,
  email       : COL.EMAIL,
  adresse     : COL.ADRESSE,
};

export async function updatePrestation(
  row: number,
  updates: Record<string, string>,
  sheetName: string = SHEET_NAME
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const data = Object.entries(updates)
    .filter(([key]) => key in EDITABLE_FIELDS)
    .map(([key, value]) => {
      const colIndex = EDITABLE_FIELDS[key];
      const colLetter = String.fromCharCode(65 + colIndex);
      return { range: `${sheetName}!${colLetter}${row}`, values: [[value]] };
    });

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SPREADSHEET_ID manquant dans .env.local");
  return id;
}

function rowToPrestation(row: string[], index: number): Prestation {
  const get = (col: number) => (row[col] || "").toString().trim();
  return {
    row: index + 2,
    timestamp    : get(COL.TIMESTAMP),
    nom          : get(COL.NOM),
    prenom       : get(COL.PRENOM),
    tel          : get(COL.TEL),
    email        : get(COL.EMAIL),
    typePresta   : get(COL.TYPE_PRESTA),
    quantite     : get(COL.QUANTITE),
    adresse      : get(COL.ADRESSE),
    date         : get(COL.DATE),
    heure        : get(COL.HEURE),
    message      : get(COL.MESSAGE),
    prix         : get(COL.PRIX),
    envoyer      : get(COL.ENVOYER),
    statut       : get(COL.STATUT) as Prestation["statut"],
    rappel       : get(COL.RAPPEL),
    avis         : get(COL.AVIS),
    prestataire  : get(COL.PRESTATAIRE),
    emailPresta  : get(COL.EMAIL_PRESTA),
    commentaire  : get(COL.COMMENTAIRE),
    statutPresta : get(COL.STATUT_PRESTA) as Prestation["statutPresta"],
    lienWA       : get(COL.LIEN_WA),
    genDevis     : get(COL.GEN_DEVIS),
    devisPDF     : get(COL.DEVIS_PDF),
  };
}

export async function getPrestations(): Promise<Prestation[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEET_NAME}!A2:W`,
  });
  const rows = res.data.values || [];
  return rows
    .filter((r) => r[COL.NOM] || r[COL.EMAIL])
    .map((r, i) => rowToPrestation(r.map(String), i));
}

export async function getPrestataires(): Promise<Prestataire[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEET_PRESTA}!A2:C`,
  });
  const rows = res.data.values || [];
  return rows
    .filter((r) => r[0])
    .map((r) => ({
      nom  : (r[0] || "").toString().trim(),
      email: (r[1] || "").toString().trim(),
      tel  : (r[2] || "").toString().trim(),
    }));
}

export async function getArchive(): Promise<Prestation[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEET_ARCHIVE}!A2:W`,
  });
  const rows = res.data.values || [];
  return rows
    .filter((r) => r[COL.NOM] || r[COL.EMAIL])
    .map((r, i) => rowToPrestation(r.map(String), i));
}

export async function appendPrestation(fields: {
  nom: string; prenom: string; tel: string; email: string;
  typePresta: string; quantite: string; adresse: string;
  date: string; heure: string; message: string; prix: string;
}): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const row = new Array(23).fill("");
  row[COL.TIMESTAMP]   = new Date().toLocaleString("fr-FR");
  row[COL.NOM]         = fields.nom;
  row[COL.PRENOM]      = fields.prenom;
  row[COL.TEL]         = fields.tel;
  row[COL.EMAIL]       = fields.email;
  row[COL.TYPE_PRESTA] = fields.typePresta;
  row[COL.QUANTITE]    = fields.quantite;
  row[COL.ADRESSE]     = fields.adresse;
  row[COL.DATE]        = fields.date;
  row[COL.HEURE]       = fields.heure;
  row[COL.MESSAGE]     = fields.message;
  row[COL.PRIX]        = fields.prix;

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range        : `${SHEET_NAME}!A:W`,
    valueInputOption: "USER_ENTERED",
    requestBody  : { values: [row] },
  });
}

export async function getDashboardStats() {
  const [prestations, prestataires, archive] = await Promise.all([
    getPrestations(),
    getPrestataires(),
    getArchive(),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = prestations.filter((p) => {
    if (!p.date) return false;
    const parts = p.date.split("/");
    if (parts.length !== 3) return false;
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    return d >= today && ["EMAIL ENVOYÉ", "CONFIRMÉ"].includes(p.statut);
  });

  const toReassign = prestations.filter(
    (p) => p.statut === "PRESTATAIRE REFUSÉ – À RÉAFFECTER"
  );

  const waitingPresta = prestations.filter(
    (p) => p.statutPresta === "EN ATTENTE PRESTA"
  );

  const allPrix = [...prestations, ...archive]
    .map((p) => parseFloat(p.prix) || 0)
    .filter((n) => n > 0);

  const totalCA = allPrix.reduce((a, b) => a + b, 0);
  const archiveCA = archive
    .map((p) => parseFloat(p.prix) || 0)
    .reduce((a, b) => a + b, 0);

  const devisGeneres = [...prestations, ...archive].filter(
    (p) => p.genDevis === "FAIT" || p.devisPDF
  ).length;

  return {
    totalPrestations : prestations.length,
    totalClients     : new Set([...prestations, ...archive].map((p) => p.email).filter(Boolean)).size,
    totalPrestataires: prestataires.length,
    totalCA,
    archiveCA,
    upcoming         : upcoming.length,
    toReassign       : toReassign.length,
    waitingPresta    : waitingPresta.length,
    devisGeneres,
    prestations,
    prestataires,
    archive,
    upcomingList     : upcoming.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
    toReassignList   : toReassign,
  };
}
