import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Caractères qui casseraient la syntaxe du filtre PostgREST `.or()`
// (virgule = séparateur, parenthèses = groupes, guillemets/backslash = échappement).
const sanitize = (s: string) => s.replace(/[,()"'\\*:]/g, " ").replace(/\s+/g, " ").trim();

// Téléphone : on ne garde que les chiffres et on compare sur les 9 derniers
// (« 06 12 34 56 78 », « 0612345678 », « +33 6 12… » → même client).
// Motif ilike « %6%1%2%…% » : tolère espaces, points, tirets dans la valeur stockée.
const motifTel = (s: string) => {
  const d = s.replace(/\D/g, "").slice(-9);
  return d ? `%${d.split("").join("%")}%` : null;
};

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const brut = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const q = sanitize(brut);
  if (!q || q.length < 2) return NextResponse.json([]);
  if (!supabase) return NextResponse.json([]);

  // Requête « téléphone » : uniquement chiffres / + / espaces / . / - et au moins 6 chiffres.
  const estTel = /^[\d\s+.\-]+$/.test(brut) && brut.replace(/\D/g, "").length >= 6;
  const tel = estTel ? motifTel(brut) : null;
  // Sinon : chaque mot doit matcher au moins une colonne (« Jean Dupont » = « dupont jean »).
  const mots = estTel ? [] : q.split(" ").filter(Boolean).slice(0, 5);

  // Filtre OR pour un mot donné sur une liste de colonnes (+ colonne tel si le mot est numérique).
  const orMot = (mot: string, cols: string[], colTel?: string) => {
    const parts = cols.map(c => `${c}.ilike.%${mot}%`);
    const t = colTel && /\d{4,}/.test(mot) ? motifTel(mot) : null;
    if (colTel && t) parts.push(`${colTel}.ilike.${t}`);
    return parts.join(",");
  };

  let qClients = supabase.from("clients").select("id, nom, prenom, tel, email, adresse").limit(12);
  let qPrestataires = supabase.from("prestataires").select("id, nom, email, tel_wa, actif").limit(3);
  let qProspects = supabase.from("prospects").select("id, nom, prenom, tel, email, statut").limit(4);
  let qPrestations = supabase
    .from("prestations")
    .select("id, client_id, type_prestation, adresse, date_intervention, clients(nom, prenom)")
    .eq("archive", false)
    .order("date_intervention", { ascending: false })
    .limit(4);

  if (tel) {
    qClients = qClients.ilike("tel", tel);
    qPrestataires = qPrestataires.ilike("tel_wa", tel);
    qProspects = qProspects.ilike("tel", tel);
  } else {
    // Plusieurs .or() chaînés = ET entre eux côté PostgREST.
    for (const m of mots) {
      qClients = qClients.or(orMot(m, ["nom", "prenom", "email", "adresse"], "tel"));
      qPrestataires = qPrestataires.or(orMot(m, ["nom", "email"], "tel_wa"));
      qProspects = qProspects.or(orMot(m, ["nom", "prenom", "email"], "tel"));
      qPrestations = qPrestations.or(orMot(m, ["type_prestation", "adresse"]));
    }
  }

  const [{ data: clients }, { data: prestations }, { data: prospects }, { data: prestataires }] = await Promise.all([
    qClients,
    // Un numéro de téléphone ne désigne pas une prestation : on n'interroge pas la table.
    tel ? Promise.resolve({ data: [] as unknown[] }) : qPrestations,
    qProspects,
    qPrestataires,
  ]);

  type ClientRow = { id: string; nom: string; prenom: string; tel: string; email: string; adresse: string };
  type ClientJoin = { nom: string; prenom: string };
  type PrestaRow = { id: string; client_id: string | null; type_prestation: string; adresse: string; date_intervention: string; clients: ClientJoin | ClientJoin[] | null };
  type ProspectRow = { id: string; nom: string; prenom: string; tel: string; email: string; statut: string };
  type PrestataireRow = { id: string; nom: string; email: string; tel_wa: string; actif: boolean };

  // Dédoublonnage : une même personne peut avoir plusieurs fiches en base
  // (RDV reprogrammé → nouvelle fiche). On n'en garde qu'une par identité.
  const vus = new Set<string>();
  const clientsUniques = ((clients ?? []) as ClientRow[]).filter((c) => {
    const cle = (c.email || `${c.nom}|${c.prenom}|${c.tel}`).toLowerCase().trim();
    if (!cle || vus.has(cle)) return false;
    vus.add(cle);
    return true;
  }).slice(0, 5);

  // Date ISO → « 12/03/2026 »
  const fmtDate = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d ?? "";
  };

  const results = [
    ...clientsUniques.map((c) => ({
      type    : "client",
      label   : `${c.prenom ?? ""} ${c.nom ?? ""}`.trim(),
      sub     : [c.email, c.tel, c.adresse].filter(Boolean).join(" · "),
      href    : `/clients?fiche=${c.id}`,
      clientId: c.id,          // ← ouverture directe de la fiche (sans navigation)
      status  : null,
    })),
    ...((prospects ?? []) as ProspectRow[]).map((p) => ({
      type      : "prospect",
      label     : `${p.prenom ?? ""} ${p.nom ?? ""}`.trim(),
      sub       : [p.statut, p.email || p.tel].filter(Boolean).join(" · "),
      href      : `/prospects?fiche=${p.id}`, // ← ouvre directement la fiche (même perdue)
      prospectId: p.id,
      status    : p.statut,
    })),
    ...((prestations ?? []) as PrestaRow[]).map((p) => {
      // La jointure many-to-one renvoie un objet (parfois un tableau selon le typage) → on gère les deux.
      const cl = Array.isArray(p.clients) ? p.clients[0] : p.clients;
      const nomClient = cl ? `${cl.prenom ?? ""} ${cl.nom ?? ""}`.trim() : "";
      return {
        type    : "prestation",
        label   : nomClient || p.type_prestation || "—",
        sub     : [nomClient ? p.type_prestation : "", fmtDate(p.date_intervention), p.adresse].filter(Boolean).join(" · "),
        href    : p.client_id ? `/clients?fiche=${p.client_id}` : "/agenda",
        clientId: p.client_id ?? undefined, // ← ouvre la fiche du client concerné
        status  : null,
      };
    }),
    ...((prestataires ?? []) as PrestataireRow[]).map((p) => ({
      type  : "prestataire",
      label : p.nom ?? "—",
      sub   : [p.tel_wa, p.email, p.actif === false ? "inactif" : ""].filter(Boolean).join(" · "),
      href  : "/prestataires",
      status: null,
    })),
  ];

  return NextResponse.json(results);
}
