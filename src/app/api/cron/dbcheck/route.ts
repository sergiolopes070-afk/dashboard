import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Test de fiabilité DB : écrit un marqueur dans settings puis le relit.
// Protégé par CRON_SECRET (?key=). ?write=1 écrit, sinon lit.
function secret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) if (/^cron_?secret$/i.test(k) && v) return v;
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = secret();
  if (!s || url.searchParams.get("key") !== s) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "no db" }, { status: 503 });

  const dbRef = (process.env.SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0];

  // Décode le RÔLE de la clé utilisée par l'app (sans exposer la clé).
  if (url.searchParams.get("role") === "1") {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    let role = "(illisible)";
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64").toString()).role; } catch { /* pas un JWT */ }
    return NextResponse.json({ dbRef, roleDeLaCle: role, note: role === "service_role" ? "OK: contourne la RLS" : "PROBLÈME: soumis à la RLS → UPDATE/DELETE bloqués" });
  }

  // Compare la MÊME lecture via maybeSingle vs via tableau .select().
  if (url.searchParams.get("compare") === "1") {
    const viaSingle = await supabase.from("settings").select("value").eq("key", "dbcheck").maybeSingle();
    const viaArray  = await supabase.from("settings").select("value").eq("key", "dbcheck").limit(1);
    return NextResponse.json({
      dbRef,
      viaMaybeSingle: viaSingle.data?.value ?? null,
      viaTableau: viaArray.data?.[0]?.value ?? null,
      identiques: (viaSingle.data?.value ?? null) === (viaArray.data?.[0]?.value ?? null),
    });
  }

  // Diagnostic approfondi : doublons de lignes + UPDATE direct.
  if (url.searchParams.get("deep") === "1") {
    const rows = await supabase.from("settings").select("key, value").eq("key", "dbcheck");
    const marker = `DIRECT-${Date.now()}`;
    const up = await supabase.from("settings").update({ value: marker }).eq("key", "dbcheck").select("key, value");
    const relu = await supabase.from("settings").select("value").eq("key", "dbcheck");
    return NextResponse.json({
      dbRef,
      lignesPourCetteCle: rows.data?.length ?? 0,
      valeursExistantes: (rows.data || []).map(r => r.value),
      updateAffecte: up.data?.length ?? 0,
      updateErr: up.error?.message || null,
      relectureApresUpdate: (relu.data || []).map(r => r.value),
    });
  }

  if (url.searchParams.get("write") === "1") {
    const marker = url.searchParams.get("v") || `M-${Date.now()}`;
    const w = await supabase.from("settings").upsert({ key: "dbcheck", value: marker }, { onConflict: "key" }).select("key");
    const relu = await supabase.from("settings").select("value").eq("key", "dbcheck").maybeSingle();
    return NextResponse.json({ dbRef, action: "write", ecrit: marker, upsertErr: w.error?.message || null, reluMemeRequete: relu.data?.value ?? null });
  }
  const r = await supabase.from("settings").select("value").eq("key", "dbcheck").maybeSingle();
  return NextResponse.json({ dbRef, action: "read", valeur: r.data?.value ?? null });
}
