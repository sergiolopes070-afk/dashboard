import { supabase } from "./supabase";
import { Prestation, Prestataire } from "./constants";

// ─── Date helpers ────────────────────────────────────────────────────────────

/** ISO YYYY-MM-DD → DD/MM/YYYY */
function isoToFr(d: string | null): string {
  if (!d) return "";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

/** DD/MM/YYYY → ISO YYYY-MM-DD (or null) */
function frToIso(d: string): string | null {
  if (!d) return null;
  const p = d.split("/");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d || null;
}

// ─── Row mapper ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPrestation(row: Record<string, any>): Prestation {
  const client     = row.clients      || {};
  const prestataire = row.prestataires || {};

  return {
    row          : row.id as string,
    clientId     : (row.client_id as string) || "",
    timestamp    : (row.created_at as string) || "",
    nom          : client.nom      || "",
    prenom       : client.prenom   || "",
    tel          : client.tel      || "",
    email        : client.email    || "",
    typePresta   : row.type_prestation || "",
    quantite     : String(row.quantite ?? ""),
    adresse      : row.adresse     || "",
    date         : isoToFr(row.date_intervention),
    heure        : ((row.heure_intervention as string) || "").substring(0, 5),
    message      : row.message     || "",
    prix         : row.prix != null ? String(row.prix) : "",
    envoyer      : row.mail_client_envoye ? "OUI" : "",
    statut       : row.statut      || "" as Prestation["statut"],
    rappel       : row.rappel_j1_envoye ? "OUI" : "",
    avis         : "",
    prestataire  : prestataire.nom   || "",
    emailPresta  : prestataire.email || "",
    commentaire  : row.commentaire || "",
    statutPresta : row.statut_presta || "" as Prestation["statutPresta"],
    lienWA       : row.lien_wa     || "",
    genDevis     : row.devis_genere ? "FAIT" : "",
    devisPDF     : row.devis_url   || "",
  };
}

// ─── READ ────────────────────────────────────────────────────────────────────

export async function getPrestations(): Promise<Prestation[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("prestations")
    .select("*, clients(*), prestataires(*)")
    .eq("archive", false)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrestation);
}

export async function getPrestataires(): Promise<Prestataire[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("prestataires")
    .select("*")
    .eq("actif", true)
    .order("nom", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id   : r.id as string,
    nom  : (r.nom    || "").trim(),
    email: (r.email  || "").trim(),
    tel  : (r.tel_wa || "").trim(),
  }));
}

export async function getArchive(): Promise<Prestation[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("prestations")
    .select("*, clients(*), prestataires(*)")
    .eq("archive", true)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrestation);
}

// ─── WRITE ───────────────────────────────────────────────────────────────────

export async function updatePrestation(
  id: string,
  updates: Record<string, string>
): Promise<void> {
  if (!supabase) return;
  const prestaPatch: Record<string, unknown> = {};
  const clientPatch: Record<string, string>  = {};
  const CLIENT_FIELDS = ["nom", "prenom", "tel", "email", "adresse"] as const;

  for (const [key, value] of Object.entries(updates)) {
    switch (key) {
      case "statut":
        prestaPatch.statut = value;
        // Auto-archive dès que la prestation est marquée TERMINÉ
        if (value === "TERMINÉ") prestaPatch.archive = true;
        break;
      case "statutPresta": prestaPatch.statut_presta = value;                           break;
      case "prix":         prestaPatch.prix           = value ? parseFloat(value) : null; break;
      case "date":         prestaPatch.date_intervention  = frToIso(value);             break;
      case "heure":        prestaPatch.heure_intervention = value || null;              break;
      case "envoyer":      prestaPatch.mail_client_envoye = value === "OUI";            break;
      case "genDevis":     prestaPatch.devis_genere  = value === "OUI" || value === "FAIT"; break;
      case "commentaire":  prestaPatch.commentaire   = value;                           break;
      case "lienWA":       prestaPatch.lien_wa        = value;                          break;
      case "devisPDF":     prestaPatch.devis_url      = value;                          break;
      case "prestataire": {
        if (value) {
          const { data } = await supabase
            .from("prestataires")
            .select("id")
            .eq("nom", value)
            .maybeSingle();
          prestaPatch.prestataire_id = data?.id ?? null;
        } else {
          prestaPatch.prestataire_id = null;
        }
        break;
      }
      case "emailPresta": break; // stored on prestataire row, not here
      case "nom":     clientPatch.nom     = value; break;
      case "prenom":  clientPatch.prenom  = value; break;
      case "tel":     clientPatch.tel     = value; break;
      case "email":   clientPatch.email   = value; break;
      case "adresse": clientPatch.adresse = value; break;
    }
  }

  if (Object.keys(prestaPatch).length > 0) {
    const { error } = await supabase
      .from("prestations")
      .update(prestaPatch)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  if (Object.keys(clientPatch).length > 0) {
    const { data: presta, error: fetchErr } = await supabase
      .from("prestations")
      .select("client_id")
      .eq("id", id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    if (presta?.client_id) {
      const { error } = await supabase
        .from("clients")
        .update(clientPatch)
        .eq("id", presta.client_id);
      if (error) throw new Error(error.message);
    }
  }

  // Suppress "unused variable" warning for CLIENT_FIELDS
  void CLIENT_FIELDS;
}

export async function appendPrestation(fields: {
  nom: string; prenom: string; tel: string; email: string;
  typePresta: string; quantite: string; adresse: string;
  date: string; heure: string; message: string; prix: string;
  source?: string; statutClient?: string; prestataire?: string;
  statut?: string; statutPresta?: string;
}): Promise<string> {
  // Find or create client
  let clientId: string;
  const clientData = {
    nom    : fields.nom,
    prenom : fields.prenom,
    tel    : fields.tel,
    email  : fields.email,
    adresse: fields.adresse,
    source : fields.source  || null,
    statut : fields.statutClient || "NOUVEAU",
  };

  if (fields.email) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("email", fields.email)
      .maybeSingle();

    if (existing) {
      clientId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from("clients").insert(clientData).select("id").single();
      if (error) throw new Error(error.message);
      clientId = created.id;
    }
  } else {
    const { data: created, error } = await supabase
      .from("clients").insert(clientData).select("id").single();
    if (error) throw new Error(error.message);
    clientId = created.id;
  }

  // Resolve prestataire UUID if provided
  let prestataireId: string | null = null;
  if (fields.prestataire) {
    const { data } = await supabase
      .from("prestataires").select("id").eq("nom", fields.prestataire).maybeSingle();
    prestataireId = data?.id ?? null;
  }

  const { data: newPresta, error } = await supabase.from("prestations").insert({
    client_id         : clientId,
    prestataire_id    : prestataireId,
    type_prestation   : fields.typePresta,
    quantite          : parseInt(fields.quantite) || 1,
    adresse           : fields.adresse,
    date_intervention : frToIso(fields.date),
    heure_intervention: fields.heure || null,
    message           : fields.message,
    prix              : fields.prix ? parseFloat(fields.prix) : null,
    statut            : fields.statut || "",
    statut_presta     : fields.statutPresta || null,
    archive           : false,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return newPresta.id as string;
}

export async function deletePrestation(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("prestations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updatePrestataire(
  id: string,
  fields: { nom: string; email: string; tel: string }
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("prestataires")
    .update({ nom: fields.nom.trim(), email: fields.email.trim(), tel_wa: fields.tel.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePrestataire(id: string): Promise<void> {
  if (!supabase) return;
  // On désactive plutôt que de supprimer (préserve l'historique des prestations liées)
  const { error } = await supabase
    .from("prestataires")
    .update({ actif: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteClient(clientId: string): Promise<void> {
  if (!supabase) return;
  // Delete all prestations for this client first, then the client row
  const { error: pe } = await supabase.from("prestations").delete().eq("client_id", clientId);
  if (pe) throw new Error(pe.message);
  const { error: ce } = await supabase.from("clients").delete().eq("id", clientId);
  if (ce) throw new Error(ce.message);
}

export async function createPrestataire(fields: {
  nom: string;
  email: string;
  tel: string;
}): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré");
  const { error } = await supabase.from("prestataires").insert({
    nom  : fields.nom.trim(),
    email: fields.email.trim(),
    tel_wa: fields.tel.trim(),
    actif: true,
  });
  if (error) throw new Error(error.message);
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

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

  const toReassign   = prestations.filter((p) => p.statut === "PRESTATAIRE REFUSÉ – À RÉAFFECTER");
  const waitingPresta = prestations.filter((p) => p.statutPresta === "EN ATTENTE PRESTA");

  const totalCA  = [...prestations, ...archive].map((p) => parseFloat(p.prix) || 0).reduce((a, b) => a + b, 0);
  const archiveCA = archive.map((p) => parseFloat(p.prix) || 0).reduce((a, b) => a + b, 0);
  const devisGeneres = [...prestations, ...archive].filter((p) => p.genDevis === "FAIT" || p.devisPDF).length;

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
