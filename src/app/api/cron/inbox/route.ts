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

  // Diagnostic : combien de clients issus du formulaire existent réellement.
  if (url.searchParams.get("count") === "1") {
    if (!supabase) return NextResponse.json({ error: "no db" }, { status: 503 });
    const { count } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("source", "Site (formulaire)");
    return NextResponse.json({ clientsFormulaire: count ?? 0 });
  }

  // SUPPRESSION des clients (+ prestations) créés par l'import (source = formulaire).
  if (url.searchParams.get("cleanup") === "1") {
    if (!supabase) return NextResponse.json({ error: "no db" }, { status: 503 });
    const { data: cls } = await supabase.from("clients").select("id").eq("source", "Site (formulaire)");
    const ids = (cls || []).map(c => c.id as string);
    if (!ids.length) return NextResponse.json({ trouves: 0, prestationsSupprimees: 0, clientsSupprimes: 0 });
    const rp = await supabase.from("prestations").delete().in("client_id", ids).select("id");
    const rc = await supabase.from("clients").delete().eq("source", "Site (formulaire)").select("id");
    return NextResponse.json({
      trouves: ids.length,
      prestationsSupprimees: rp.data?.length ?? 0,
      clientsSupprimes: rc.data?.length ?? 0,
      errP: rp.error?.message || null,
      errC: rc.error?.message || null,
    });
  }

  // Diagnostic persistance : empreinte de l'URL DB + écriture/relecture settings.
  if (url.searchParams.get("diag") === "1") {
    if (!supabase) return NextResponse.json({ error: "no db" }, { status: 503 });
    const dbUrl = process.env.SUPABASE_URL || "";
    const host = dbUrl.replace(/^https?:\/\//, "").split(".")[0]; // ref du projet Supabase
    const action = url.searchParams.get("act");
    if (action === "write") {
      const marker = `PERSIST-${Date.now()}`;
      const w = await supabase.from("settings").upsert({ key: "diag_persist", value: marker }, { onConflict: "key" }).select("key");
      const r = await supabase.from("settings").select("value").eq("key", "diag_persist").maybeSingle();
      return NextResponse.json({ dbRef: host, action: "write", marker, upsertErr: w.error?.message || null, relectureMemeRequete: r.data?.value ?? null });
    }
    const r = await supabase.from("settings").select("value").eq("key", "diag_persist").maybeSingle();
    return NextResponse.json({ dbRef: host, action: "read", valeurActuelle: r.data?.value ?? null });
  }

  const dry = url.searchParams.get("dry") === "1";
  const debug = url.searchParams.get("debug") === "1";
  const baseline = url.searchParams.get("baseline") === "1";
  const daysParam = parseInt(url.searchParams.get("days") || "", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;

  const res = await importInbox({ dry: dry || debug, debug, baseline, days });
  if (debug) return NextResponse.json({ mode: "DEBUG", totalTrouves: res.totalTrouves, debugSample: res.debugSample, erreurs: res.errors.slice(0, 3) });
  return NextResponse.json({
    mode: baseline ? "BASELINE (historique marqué traité, rien créé)" : dry ? "SIMULATION (aucune création)" : "IMPORT",
    crees: res.imported.length,
    ignores: res.skipped,
    erreurs: res.errors,
    details: res.imported,
  });
}
