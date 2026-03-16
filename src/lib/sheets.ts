import { supabase } from "./supabase";
import { Prestation, Prestataire } from "./constants";

// ─── Mapping DB row → Prestation ────────────────────────────────────────────

function rowToPrestation(row: Record<string, unknown>): Prestation {
  const get = (key: string) => ((row[key] as string) || "").toString().trim();
  return {
    row          : row.id as number,
    timestamp    : get("timestamp"),
    nom          : get("nom"),
    prenom       : get("prenom"),
    tel          : get("tel"),
    email        : get("email"),
    typePresta   : get("type_presta"),
    quantite     : get("quantite"),
    adresse      : get("adresse"),
    date         : get("date"),
    heure        : get("heure"),
    message      : get("message"),
    prix         : get("prix"),
    envoyer      : get("envoyer"),
    statut       : get("statut") as Prestation["statut"],
    rappel       : get("rappel"),
    avis         : get("avis"),
    prestataire  : get("prestataire"),
    emailPresta  : get("email_presta"),
    commentaire  : get("commentaire"),
    statutPresta : get("statut_presta") as Prestation["statutPresta"],
    lienWA       : get("lien_wa"),
    genDevis     : get("gen_devis"),
    devisPDF     : get("devis_pdf"),
  };
}

// ─── Field mapping (Prestation key → DB column) ─────────────────────────────

const FIELD_MAP: Record<string, string> = {
  prix        : "prix",
  envoyer     : "envoyer",
  statut      : "statut",
  prestataire : "prestataire",
  emailPresta : "email_presta",
  commentaire : "commentaire",
  statutPresta: "statut_presta",
  genDevis    : "gen_devis",
  date        : "date",
  heure       : "heure",
  nom         : "nom",
  prenom      : "prenom",
  tel         : "tel",
  email       : "email",
  adresse     : "adresse",
};

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function updatePrestation(
  id: number,
  updates: Record<string, string>
): Promise<void> {
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(updates)) {
    const col = FIELD_MAP[key];
    if (col) patch[col] = value;
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("prestations")
    .update(patch)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function getPrestations(): Promise<Prestation[]> {
  const { data, error } = await supabase
    .from("prestations")
    .select("*")
    .eq("archived", false)
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrestation);
}

export async function getPrestataires(): Promise<Prestataire[]> {
  const { data, error } = await supabase
    .from("prestataires")
    .select("*")
    .order("nom", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    nom  : (r.nom   || "").toString().trim(),
    email: (r.email || "").toString().trim(),
    tel  : (r.tel   || "").toString().trim(),
  }));
}

export async function getArchive(): Promise<Prestation[]> {
  const { data, error } = await supabase
    .from("prestations")
    .select("*")
    .eq("archived", true)
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrestation);
}

export async function appendPrestation(fields: {
  nom: string; prenom: string; tel: string; email: string;
  typePresta: string; quantite: string; adresse: string;
  date: string; heure: string; message: string; prix: string;
}): Promise<void> {
  const { error } = await supabase.from("prestations").insert({
    timestamp  : new Date().toLocaleString("fr-FR"),
    nom        : fields.nom,
    prenom     : fields.prenom,
    tel        : fields.tel,
    email      : fields.email,
    type_presta: fields.typePresta,
    quantite   : fields.quantite,
    adresse    : fields.adresse,
    date       : fields.date,
    heure      : fields.heure,
    message    : fields.message,
    prix       : fields.prix,
    archived   : false,
  });

  if (error) throw new Error(error.message);
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
