import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { importInbox } from "@/lib/inbox";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Import des demandes de devis reçues par email (formulaire du site).
//   • Bouton du dashboard  → session (utilisateur connecté).
//   • Cron / test manuel   → en-tête x-vercel-cron ou ?key=<CRON_SECRET>.
//   • ?dry=1               → simulation (parse + liste, ne crée rien).
function getSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) {
    if (/^cron_?secret$/i.test(k) && v) return v;
  }
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = getSecret();
  const key = url.searchParams.get("key");
  const cronOk = !!req.headers.get("x-vercel-cron") || (!!secret && key === secret);

  if (!cronOk) {
    const unauth = await requireAuth(); // bouton du dashboard : session requise
    if (unauth) return unauth;
  }

  // Contrôle ciblé : ?find=<email> → où se trouve ce contact (prospects/clients) + ses champs.
  const find = url.searchParams.get("find");
  if (find && supabase) {
    const [pros, cli] = await Promise.all([
      supabase.from("prospects").select("id, prenom, nom, email, tel, statut, date_relance, created_at").ilike("email", find).limit(5),
      supabase.from("clients").select("id, prenom, nom, email, tel").ilike("email", find).limit(5),
    ]);
    return NextResponse.json({ email: find, prospects: pros.data || [], clients: cli.data || [] });
  }

  // Maintenance ponctuelle : donne une date de relance = aujourd'hui aux leads
  // déjà importés qui n'en ont pas (source formulaire), pour qu'ils apparaissent
  // dans « À rappeler ». Réservé au déclenchement à clé.
  if (url.searchParams.get("reviveLeads") === "1" && supabase) {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("prospects")
      .update({ date_relance: today })
      .eq("source", "Site (formulaire)")
      .is("date_relance", null)
      .select("prenom, email");
    return NextResponse.json({ revived: data?.length ?? 0, details: data || [], error: error?.message });
  }

  const dry = url.searchParams.get("dry") === "1";
  const debug = url.searchParams.get("debug") === "1";
  const baseline = url.searchParams.get("baseline") === "1";
  const daysParam = parseInt(url.searchParams.get("days") || "", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;
  const since = url.searchParams.get("since") || undefined;

  const res = await importInbox({ dry: dry || debug, debug, baseline, days, since });
  if (debug) return NextResponse.json({ mode: "DEBUG", totalTrouves: res.totalTrouves, debugAll: res.debugAll, debugSample: res.debugSample, erreurs: res.errors.slice(0, 3) });
  return NextResponse.json({
    mode: baseline ? "BASELINE (historique marqué traité, rien créé)" : dry ? "SIMULATION (aucune création)" : "IMPORT",
    crees: res.imported.length,
    ignores: res.skipped,
    erreurs: res.errors,
    details: res.imported,
  });
}
