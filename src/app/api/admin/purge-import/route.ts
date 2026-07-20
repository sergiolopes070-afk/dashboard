import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Suppression des clients (+ leurs prestations) créés par l'import email
// (source = "Site (formulaire)"). Route isolée (aucune dépendance email) pour
// écarter tout souci de build. Protégée par CRON_SECRET.
//   ?key=<secret>          → compte ce qui existe
//   ?key=<secret>&go=1     → supprime réellement
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
  if (!secret || url.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const SRC = "Site (formulaire)";
  const { data: cls, error: e1 } = await supabase.from("clients").select("id").eq("source", SRC);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const ids = (cls || []).map(c => c.id as string);

  if (url.searchParams.get("go") !== "1") {
    return NextResponse.json({ aSupprimer: ids.length, note: "Ajoute &go=1 pour supprimer." });
  }
  if (!ids.length) return NextResponse.json({ prestationsSupprimees: 0, clientsSupprimes: 0 });

  // Supprime les prestations par lots (évite une clause IN trop longue).
  let prestSupp = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const lot = ids.slice(i, i + 50);
    const rp = await supabase.from("prestations").delete().in("client_id", lot).select("id");
    if (rp.error) return NextResponse.json({ error: `prestations: ${rp.error.message}`, prestSupp }, { status: 500 });
    prestSupp += rp.data?.length ?? 0;
  }
  const rc = await supabase.from("clients").delete().eq("source", SRC).select("id");
  if (rc.error) return NextResponse.json({ error: `clients: ${rc.error.message}`, prestationsSupprimees: prestSupp }, { status: 500 });

  return NextResponse.json({ prestationsSupprimees: prestSupp, clientsSupprimes: rc.data?.length ?? 0 });
}
