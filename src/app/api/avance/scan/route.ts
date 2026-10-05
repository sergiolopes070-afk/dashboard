import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { scanAvanceInscrits, getInscrits } from "@/lib/avanceInscrits";
import { supabase } from "@/lib/supabase";
import { normEmail, normTel } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scanne la boîte Gmail pour les emails d'inscription à l'Avance Immédiate et
// mémorise les clients inscrits (badge vert en fiche).
//   • Bouton dashboard  → session (requireAuth).
//   • Cron / test       → x-vercel-cron ou ?key=<CRON_SECRET>.
function getSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) if (/^cron_?secret$/i.test(k) && v) return v;
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = getSecret();
  const key = url.searchParams.get("key");
  const cronOk = !!req.headers.get("x-vercel-cron") || (!!secret && key === secret);
  if (!cronOk) {
    const unauth = await requireAuth();
    if (unauth) return unauth;
  }
  // Audit : croise les inscrits détectés avec les clients réels du dashboard.
  // Dit combien d'inscrits correspondent à un client (par email OU téléphone),
  // et liste ceux qui ne matchent pas (pas encore client, ou format de tél différent).
  if (url.searchParams.get("audit") === "1") {
    if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
    const inscrits = await getInscrits();
    const { data } = await supabase.from("clients").select("prenom, nom, tel, email");
    const clients = data || [];
    const cTels   = new Set(clients.map(c => normTel((c.tel as string) || "")).filter(Boolean));
    const cEmails = new Set(clients.map(c => normEmail((c.email as string) || "")).filter(Boolean));
    let parEmail = 0, parTel = 0, matched = 0;
    const nonMatches: { nom: string; tel: string; email: string }[] = [];
    for (const i of inscrits) {
      const okEmail = !!i.email && cEmails.has(i.email);
      const okTel   = !!i.tel && cTels.has(i.tel);
      if (okEmail) parEmail++;
      if (okTel) parTel++;
      if (okEmail || okTel) matched++;
      else nonMatches.push({ nom: i.nom, tel: i.tel, email: i.email });
    }
    return NextResponse.json({
      inscritsDetectes: inscrits.length,
      clientsEnBase: clients.length,
      correspondances: matched,
      parEmail, parTel,
      sansCorrespondance: nonMatches.length,
      exemplesSansMatch: nonMatches.slice(0, 15),
    });
  }

  const daysParam = parseInt(url.searchParams.get("days") || "", 10);
  const res = await scanAvanceInscrits({ days: Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined });
  return NextResponse.json(res);
}
