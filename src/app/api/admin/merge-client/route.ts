import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Outil d'administration ponctuel : fusionne les prestations ÉCLATÉES d'un client
// (une réservation multi-articles créée en plusieurs lignes) en UNE seule
// prestation « normale ». Regroupe par (date + heure) d'intervention identiques.
//
// Sécurité : même clé que le cron (CRON_SECRET). SIMULATION par défaut ; la
// fusion réelle (suppression des lignes en trop) n'a lieu qu'avec ?apply=1.
//   GET /api/admin/merge-client?key=<secret>&q=raki jihane            → simulation
//   GET /api/admin/merge-client?key=<secret>&q=raki jihane&apply=1    → fusion
// ─────────────────────────────────────────────────────────────────────────────

function getSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) {
    if (/^cron_?secret$/i.test(k) && v) return v;
  }
  return undefined;
}

const fmtEur = (n: number) => n.toFixed(2).replace(".", ",") + " €";

interface PRow {
  id: string;
  type_prestation: string | null;
  quantite: number | null;
  prix: number | null;
  message: string | null;
  date_intervention: string | null;
  heure_intervention: string | null;
  created_at: string | null;
  archive: boolean | null;
}

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const key    = url.searchParams.get("key");
  const q      = (url.searchParams.get("q") || "").trim();
  const apply  = url.searchParams.get("apply") === "1";

  const secret = getSecret();
  if (!secret)        return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (key !== secret) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!supabase)      return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  if (!q)             return NextResponse.json({ error: "Paramètre q (nom/prénom) requis" }, { status: 400 });

  // 1) Trouver le(s) client(s) correspondant au nom/prénom (souple).
  const terms = q.split(/\s+/).filter(Boolean);
  let clientsQuery = supabase.from("clients").select("id, nom, prenom, email, tel");
  for (const t of terms) {
    clientsQuery = clientsQuery.or(`nom.ilike.%${t}%,prenom.ilike.%${t}%`);
  }
  const { data: clients, error: cErr } = await clientsQuery;
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!clients || clients.length === 0) {
    return NextResponse.json({ error: `Aucun client trouvé pour « ${q} »` }, { status: 404 });
  }
  if (clients.length > 1) {
    return NextResponse.json({
      ambigu: true,
      message: "Plusieurs clients correspondent — relancez avec un nom plus précis.",
      clients: clients.map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom, email: c.email })),
    });
  }

  const client = clients[0];

  // 2) Charger ses prestations non archivées.
  const { data: prestas, error: pErr } = await supabase
    .from("prestations")
    .select("id, type_prestation, quantite, prix, message, date_intervention, heure_intervention, created_at, archive")
    .eq("client_id", client.id)
    .eq("archive", false)
    .order("created_at", { ascending: true });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const rows = (prestas || []) as PRow[];

  // 3) Regrouper par (date + heure) d'intervention identiques.
  const groups = new Map<string, PRow[]>();
  for (const r of rows) {
    const gkey = `${r.date_intervention || "∅"}||${r.heure_intervention || "∅"}`;
    const bucket = groups.get(gkey);
    if (bucket) bucket.push(r);
    else groups.set(gkey, [r]);
  }

  // On ne fusionne que les groupes contenant plusieurs lignes.
  const aFusionner: [string, PRow[]][] = Array.from(groups.entries()).filter(([, g]) => g.length > 1);

  const rapport = aFusionner.map(([gkey, g]) => {
    const items = g.map((r: PRow) => ({
      type: r.type_prestation || "Prestation",
      qty : r.quantite && r.quantite > 1 ? String(r.quantite) : "",
      prix: r.prix || 0,
    }));
    const typeFusionne = items.map(i => i.type).join(" + ");
    const total = items.reduce((s: number, i) => s + i.prix, 0);
    return {
      cle: gkey,
      nbLignes: g.length,
      garde: g[0].id,
      supprime: g.slice(1).map(r => r.id),
      resultat: { type: typeFusionne, prix: total },
      detail: items.map(i => `${i.type}${i.qty ? ` (${i.qty})` : ""} — ${fmtEur(i.prix)}`),
    };
  });

  // 4) Simulation → on s'arrête là.
  if (!apply) {
    return NextResponse.json({
      mode: "SIMULATION (aucune modification)",
      client: { id: client.id, nom: client.nom, prenom: client.prenom },
      totalPrestations: rows.length,
      groupesAFusionner: rapport,
      note: rapport.length === 0
        ? "Rien à fusionner (aucune réservation éclatée détectée)."
        : "Ajoutez &apply=1 à l'URL pour exécuter la fusion.",
    });
  }

  // 5) Fusion réelle.
  const effectue: unknown[] = [];
  for (const [, g] of aFusionner) {
    const items = g.map((r: PRow) => ({
      type: r.type_prestation || "Prestation",
      qty : r.quantite && r.quantite > 1 ? String(r.quantite) : "",
      prix: r.prix || 0,
    }));
    const typeFusionne = items.map(i => i.type).join(" + ");
    const total = items.reduce((s: number, i) => s + i.prix, 0);
    const breakdown = "Détail articles : " + items.map(i =>
      `${i.type}${i.qty ? ` (${i.qty})` : ""} — ${fmtEur(i.prix)}`).join(" · ");
    const garde = g[0];
    const nouveauMessage = garde.message ? `${garde.message}\n${breakdown}` : breakdown;

    const { data: upData, error: upErr } = await supabase
      .from("prestations")
      .update({ type_prestation: typeFusionne, prix: total, message: nouveauMessage })
      .eq("id", garde.id)
      .select("id");
    if (upErr) return NextResponse.json({ error: `MAJ échouée: ${upErr.message}`, effectue }, { status: 500 });

    const aSupprimer = g.slice(1).map(r => r.id);
    const { data: delData, error: delErr } = await supabase
      .from("prestations").delete().in("id", aSupprimer).select("id");
    if (delErr) return NextResponse.json({ error: `Suppression échouée: ${delErr.message}`, effectue }, { status: 500 });

    effectue.push({
      garde: garde.id, supprimees: aSupprimer, type: typeFusionne, prix: total,
      lignesMAJ: upData?.length ?? 0, lignesSupprimees: delData?.length ?? 0,
    });
  }

  return NextResponse.json({
    mode: "FUSION EFFECTUÉE",
    client: { id: client.id, nom: client.nom, prenom: client.prenom },
    groupesFusionnes: effectue,
  });
}
