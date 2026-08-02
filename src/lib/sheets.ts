import { supabase } from "./supabase";
import { Prestation, Prestataire, Depense, ModePaiement } from "./constants";
import { getEntite, resolveEntite, Entite, ENTITE_OVERRIDE_KEY } from "./entite";
import { getSettingJSON } from "./settings";

// Lit la table de corrections manuelles d'entité (settings/entite_override).
async function getEntiteOverrides(): Promise<Record<string, Entite>> {
  return getSettingJSON<Record<string, Entite>>(ENTITE_OVERRIDE_KEY, {});
}

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
    commission     : row.commission != null ? String(row.commission) : "",
    commissionType : (row.commission_type === "euro" ? "€" : "%") as "%" | "€",
    archiveReason    : row.archive_reason || "",
    tags             : Array.isArray(client.tags) ? client.tags : (client.tags ? String(client.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : []),
    satisfaction     : row.satisfaction != null ? Number(row.satisfaction) : undefined,
    updatedAt        : (row.updated_at as string) || "",
    stripePaymentUrl : (row.stripe_payment_url as string) || "",
    modePaiement     : ((row.mode_paiement as string) || "") as ModePaiement,
    clientNotes      : Array.isArray(client.notes) ? client.notes : [],
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
      case "typePresta":   prestaPatch.type_prestation = value;                           break;
      case "message":      prestaPatch.message         = value;                           break;
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
      case "satisfaction": prestaPatch.satisfaction   = value ? parseInt(value) : null; break;
      case "lienWA":       prestaPatch.lien_wa        = value;                          break;
      case "devisPDF":          prestaPatch.devis_url           = value;  break;
      case "stripePaymentUrl":  prestaPatch.stripe_payment_url  = value;  break;
      case "modePaiement":      prestaPatch.mode_paiement       = value || null; break;
      case "commission":       prestaPatch.commission      = value ? parseFloat(value) : 0;           break;
      case "commissionType":   prestaPatch.commission_type = value === "€" ? "euro" : "percent";      break;
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
      case "adresse":
        clientPatch.adresse  = value; // met à jour la fiche client
        prestaPatch.adresse  = value; // met à jour l'adresse de la prestation
        break;
    }
  }

  if (Object.keys(prestaPatch).length > 0) {
    let patch = { ...prestaPatch };
    let lastError: string | undefined;

    // Retry removing unknown columns one by one (handles missing columns in Supabase schema)
    for (let attempt = 0; attempt < 10; attempt++) {
      const { error } = await supabase.from("prestations").update(patch).eq("id", id);
      if (!error) { lastError = undefined; break; }

      // Extract column name from "Could not find the 'xxx' column..." error
      const match = error.message.match(/find the '(\w+)' column/);
      if (match) {
        const col = match[1];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [col]: _removed, ...rest } = patch as Record<string, unknown>;
        patch = rest as typeof prestaPatch;
        lastError = error.message;
        if (Object.keys(patch).length === 0) break;
      } else {
        throw new Error(error.message);
      }
    }
    if (lastError && Object.keys(patch).length === 0) {
      // All fields stripped — nothing to save, silently skip
    }
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
  statut?: string; statutPresta?: string; commission?: string; commissionType?: string;
  commentaire?: string; modePaiement?: string;
}): Promise<string> {
  if (!supabase) throw new Error("Supabase non configuré");
  const db = supabase;
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
    const { data: existing } = await db
      .from("clients")
      .select("id")
      .eq("email", fields.email)
      .maybeSingle();

    if (existing) {
      clientId = existing.id;
    } else {
      const { data: created, error } = await db
        .from("clients").insert(clientData).select("id").single();
      if (error) throw new Error(error.message);
      clientId = created.id;
    }
  } else {
    const { data: created, error } = await db
      .from("clients").insert(clientData).select("id").single();
    if (error) throw new Error(error.message);
    clientId = created.id;
  }

  // Resolve prestataire UUID if provided
  let prestataireId: string | null = null;
  if (fields.prestataire) {
    const { data } = await db
      .from("prestataires").select("id").eq("nom", fields.prestataire).maybeSingle();
    prestataireId = data?.id ?? null;
  }

  const basePayload = {
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
    commentaire       : fields.commentaire || null,
    mode_paiement     : fields.modePaiement || null,
  };

  // Tente l'insertion avec les colonnes commission (peuvent ne pas exister encore)
  let result = await db.from("prestations").insert({
    ...basePayload,
    commission      : fields.commission ? parseFloat(fields.commission) : 0,
    commission_type : fields.commissionType === "€" ? "euro" : "percent",
  }).select("id").single();

  // Si la colonne commission n'existe pas encore → réessai sans
  if (result.error?.message?.includes("commission")) {
    result = await db.from("prestations").insert(basePayload).select("id").single();
  }

  if (result.error) throw new Error(result.error.message);
  return result.data.id as string;
}

// Ajoute une prestation supplémentaire à un client EXISTANT (articles multiples
// à la création). Ne crée pas de client → pas de doublon de fiche.
export async function insertPrestationForClient(clientId: string, f: {
  typePresta: string; quantite?: string; prix?: string; message?: string;
  adresse?: string; date?: string; heure?: string;
}): Promise<string> {
  if (!supabase) throw new Error("Supabase non configuré");
  const payload = {
    client_id         : clientId,
    type_prestation   : f.typePresta,
    quantite          : parseInt(f.quantite || "1") || 1,
    adresse           : f.adresse || "",
    date_intervention : f.date ? frToIso(f.date) : null,
    heure_intervention: f.heure || null,
    message           : f.message || "",
    prix              : f.prix ? parseFloat(f.prix) : null,
    statut            : "",
    archive           : false,
  };
  const { data, error } = await supabase.from("prestations").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

// Récupère le client_id d'une prestation (pour rattacher les articles supp).
export async function getClientIdOfPrestation(prestationId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("prestations").select("client_id").eq("id", prestationId).maybeSingle();
  return (data?.client_id as string) || null;
}

export async function archivePrestation(id: string, reason: string, modePaiement = ""): Promise<void> {
  if (!supabase) return;
  const patch: Record<string, unknown> = { archive: true, archive_reason: reason };
  if (modePaiement) patch.mode_paiement = modePaiement;
  const { error } = await supabase
    .from("prestations")
    .update(patch)
    .eq("id", id);
  if (error) {
    if (error.message.includes("archive_reason")) {
      const fallback: Record<string, unknown> = { archive: true };
      if (modePaiement) fallback.mode_paiement = modePaiement;
      const { error: e2 } = await supabase.from("prestations").update(fallback).eq("id", id);
      if (e2) throw new Error(e2.message);
    } else {
      throw new Error(error.message);
    }
  }
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

export async function updateClientTags(clientId: string, tags: string[]): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("clients").update({ tags }).eq("id", clientId);
  if (error) throw new Error(error.message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateClientNotes(clientId: string, notes: any[]): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("clients").update({ notes }).eq("id", clientId);
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

// ─── DÉPENSES ────────────────────────────────────────────────────────────────

export async function getDepenses(): Promise<Depense[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("depenses")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as Depense[];
}

export async function createDepense(
  fields: Omit<Depense, "id" | "created_at">
): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré");
  const { error } = await supabase.from("depenses").insert(fields);
  if (error) throw new Error(error.message);
}

// Insertion groupée (import de relevé bancaire). Renvoie le nombre de lignes créées.
export async function createDepenses(
  rows: Omit<Depense, "id" | "created_at">[]
): Promise<number> {
  if (!supabase) throw new Error("Supabase non configuré");
  if (!rows.length) return 0;
  const { data, error } = await supabase.from("depenses").insert(rows).select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? rows.length;
}

export async function updateDepense(
  id: string,
  fields: Partial<Omit<Depense, "id" | "created_at">>
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("depenses").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteDepense(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("depenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

// Nombre de prospects encore au statut NOUVEAU (= nouveaux clients à traiter).
async function getNouveauxProspects(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("statut", "NOUVEAU");
  if (error) return 0; // table absente ou inaccessible → on n'échoue pas le dashboard
  return count ?? 0;
}

export async function getDashboardStats() {
  const [prestations, prestataires, archive, entiteOverrides, nouveauxClients] = await Promise.all([
    getPrestations(),
    getPrestataires(),
    getArchive(),
    getEntiteOverrides(),
    getNouveauxProspects(),
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

  // Les annulations ne comptent pas dans le CA
  const CANCELLATION_REASONS = ["Annulation client", "Client injoignable", "Doublon"];
  const isCancelled = (p: Prestation) => CANCELLATION_REASONS.some(r => (p.archiveReason || "").startsWith(r));
  const archivePaid = archive.filter(p => !isCancelled(p));
  const totalCA  = [...prestations, ...archivePaid].map((p) => parseFloat(p.prix) || 0).reduce((a, b) => a + b, 0);
  const archiveCA = archivePaid.map((p) => parseFloat(p.prix) || 0).reduce((a, b) => a + b, 0);
  const devisGeneres = [...prestations, ...archive].filter((p) => p.genDevis === "FAIT" || p.devisPDF).length;

  // CA dissocié par entité juridique (Kinouclean SAS / Kinourent)
  const caParEntite: Record<string, number> = { "Kinouclean SAS": 0, "Kinourent": 0 };
  for (const p of [...prestations, ...archivePaid]) {
    caParEntite[resolveEntite(p.row, p.typePresta, entiteOverrides)] += parseFloat(p.prix) || 0;
  }

  return {
    totalPrestations : prestations.length,
    totalClients     : new Set([...prestations, ...archive].map((p) => p.email).filter(Boolean)).size,
    totalPrestataires: prestataires.length,
    totalCA,
    archiveCA,
    caParEntite,
    entiteOverrides,
    nouveauxClients,
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
