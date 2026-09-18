import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { scanAvanceInscrits } from "@/lib/avanceInscrits";

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
  const daysParam = parseInt(url.searchParams.get("days") || "", 10);
  const res = await scanAvanceInscrits({ days: Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined });
  return NextResponse.json(res);
}
