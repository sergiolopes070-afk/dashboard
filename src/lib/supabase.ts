import { createClient } from "@supabase/supabase-js";
import { Prestation, Prestataire, Client } from "./constants";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                 || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ---------------------------------------------------------------------------
// Mapper : ligne Supabase (avec JOIN clients + prestataires) → Prestation UI
// ---------------------------------------------------------------------------
function rowToPrestation(r: Record<string, unknown>): Prestation {
  const str  = (v: unknown) => (v == null ? "" : String(v));
  const bool = (v: unknown) => v === true || v === "true";

  const client  = (r.clients     as Record<string, unknown> | null) ?? {};
  const presta  = (r.prestataires as Record<string, unknown> | null) ?? {};

  // commission DECIMAL + commission_type → "50%" ou "50"
  const commVal  = Number(r.commission) || 0;
  const commType = str(r.commission_type) || "percent";
  const commission = commVal > 0
    ? commType === "percent" ? `${commVal}%` : `${commVal}`
    : "";

  // date_intervention DATE "YYYY-MM-DD" → "DD/MM/YYYY"
  const rawDate = str(r.date_intervention);
  let date = "";
  if (rawDate) {
    const p = rawDate.split("-");
    if (p.length === 3) date = `${p[2]}/${p[1]}/${p[0]}`;
  }

  // heure_intervention TIME "HH:MM:SS" → "HH:MM"
  const heure = str(r.heure_intervention).slice(0, 5);

  return {
    row            : str(r.id),
    client_id      : str(r.client_id),
    prestataire_id : r.prestataire_id ? str(r.prestataire_id) : null,
    timestamp      : str(r.created_at),
    nom            : str(client.nom),
    prenom         : str(client.prenom),
    tel            : str(client.tel),
    email          : str(client.email),
    typePresta     : str(r.type_prestation),
    quantite       : str(r.quantite),
    adresse        : str(r.adresse) || str(client.adresse),
    date,
    heure,
    message        : str(r.message),
    prix           : str(r.prix),
    envoyer        : bool(r.mail_client_envoye) ? "OUI" : "",
    statut         : str(r.statut) as Prestation["statut"],
    rappel         : bool(r.rappel_j1_envoye) ? "OUI" : "",
    avis           : "",
    prestataire    : str(presta.nom),
    emailPresta    : str(presta.email),
    commentaire    : str(r.commentaire),
    statutPresta   : str(r.statut_presta) as Prestation["statutPresta"],
    lienWA         : str(r.lien_wa),
    genDevis       : bool(r.devis_genere) ? "FAIT" : "",
    devisPDF       : str(r.devis_url),
    commission,
    raisonArchivage: str(r.raison_archivage),
  };
}

// ---------------------------------------------------------------------------
// Convertit une update camelCase → payload Supabase typé
// ---------------------------------------------------------------------------
function toDbPayload(updates: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    switch (key) {
      case "statut":
        payload.statut = value;
        break;
      case "statutPresta":
        payload.statut_presta = value;
        break;
      case "prestataire_id":
        payload.prestataire_id = value || null;
        break;
      case "commentaire":
        payload.commentaire = value;
        break;
      case "prix":
        payload.prix = value ? parseFloat(value) : null;
        break;
      case "date": {
        if (!value) { payload.date_intervention = null; break; }
        const p = value.split("/");
        payload.date_intervention = p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : value;
        break;
      }
      case "heure":
        payload.heure_intervention = value || null;
        break;
      case "envoyer":
        payload.mail_client_envoye = value === "OUI";
        break;
      case "genDevis":
        payload.devis_genere = value === "FAIT" || value === "OUI";
        break;
      case "commission": {
        // "50%" → { commission: 50, commission_type: 'percent' }
        // "50"  → { commission: 50, commission_type: 'fixed' }
        if (!value) { payload.commission = 0; break; }
        if (value.endsWith("%")) {
          payload.commission      = parseFloat(value) || 0;
          payload.commission_type = "percent";
        } else {
          payload.commission      = parseFloat(value) || 0;
          payload.commission_type = "fixed";
        }
        break;
      }
      case "raisonArchivage":
        payload.raison_archivage = value;
        break;
      case "archive":
        payload.archive = value === "true";
        break;
      default:
        break;
    }
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------
export async function getPrestations(): Promise<Prestation[]> {
  const { data, error } = await supabase
    .from("prestations")
    .select("*, clients(*), prestataires(*)")
    .eq("archive", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrestation);
}

export async function getPrestataires(): Promise<Prestataire[]> {
  const { data, error } = await supabase
    .from("prestataires")
    .select("*")
    .eq("actif", true)
    .order("nom", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id   : String(r.id   || ""),
    nom  : String(r.nom  || ""),
    email: String(r.email || ""),
    tel  : String(r.tel_wa || ""),
  }));
}

export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id             : String(r.id || ""),
    prenom         : String(r.prenom || ""),
    nom            : String(r.nom || ""),
    tel            : String(r.tel || ""),
    email          : String(r.email || ""),
    adresse        : String(r.adresse || ""),
    source         : String(r.source || ""),
    statut         : String(r.statut || ""),
    tags           : Array.isArray(r.tags) ? r.tags : [],
    notes          : String(r.notes || ""),
    total_ca       : Number(r.total_ca) || 0,
    nb_prestations : Number(r.nb_prestations) || 0,
    created_at     : String(r.created_at || ""),
  }));
}

export async function getArchive(): Promise<Prestation[]> {
  const { data, error } = await supabase
    .from("prestations")
    .select("*, clients(*), prestataires(*)")
    .eq("archive", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrestation);
}

// ---------------------------------------------------------------------------
// Mise à jour
// ---------------------------------------------------------------------------
export async function updatePrestation(
  id: string,
  updates: Record<string, string>,
): Promise<void> {
  const payload = toDbPayload(updates);
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("prestations")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Archivage : set archive = true + raison (pas de déplacement de table)
// ---------------------------------------------------------------------------
export async function archivePrestation(id: string, raison: string): Promise<void> {
  const { error } = await supabase
    .from("prestations")
    .update({ archive: true, raison_archivage: raison || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Stats dashboard
// ---------------------------------------------------------------------------
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

  const toReassign    = prestations.filter((p) => p.statut === "PRESTATAIRE REFUSÉ – À RÉAFFECTER");
  const waitingPresta = prestations.filter((p) => p.statutPresta === "EN ATTENTE" || p.statutPresta === "EN ATTENTE PRESTA");

  const calcCommission = (p: Prestation) => {
    if (!p.commission) return 0;
    const prix = parseFloat(p.prix) || 0;
    if (p.commission.endsWith("%")) {
      return parseFloat(((prix * parseFloat(p.commission)) / 100).toFixed(2));
    }
    return parseFloat(p.commission) || 0;
  };

  const allPrestations = [...prestations, ...archive];
  const totalCA         = allPrestations.map((p) => parseFloat(p.prix) || 0).reduce((a, b) => a + b, 0);
  const archiveCA       = archive.map((p) => parseFloat(p.prix) || 0).reduce((a, b) => a + b, 0);
  const totalCommission = allPrestations.map(calcCommission).reduce((a, b) => a + b, 0);
  const totalBenefice   = parseFloat((totalCA - totalCommission).toFixed(2));
  const devisGeneres    = allPrestations.filter((p) => p.genDevis === "FAIT" || p.devisPDF).length;

  return {
    totalPrestations : prestations.length,
    totalClients     : new Set(allPrestations.map((p) => p.email).filter(Boolean)).size,
    totalPrestataires: prestataires.length,
    totalCA,
    archiveCA,
    totalCommission  : parseFloat(totalCommission.toFixed(2)),
    totalBenefice,
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
