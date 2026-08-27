import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendConfirmationEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// TEMPORAIRE (à clé) : envoie le mail de confirmation au DERNIER client ajouté.
// ?dry=1 → identifie sans envoyer. Protégé par ?key=<CRON_SECRET>.
function getSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) if (/^cron_?secret$/i.test(k) && v) return v;
  return undefined;
}
function isoToFr(d: string | null): string {
  if (!d) return "";
  const p = String(d).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = getSecret();
  if (!secret || url.searchParams.get("key") !== secret) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  const dry = url.searchParams.get("dry") === "1";

  const { data, error } = await supabase
    .from("prestations")
    .select("id, type_prestation, quantite, adresse, date_intervention, heure_intervention, prix, created_at, clients(prenom, nom, email)")
    .eq("archive", false)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data || [];
  const withEmail = rows.find(r => {
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    return c && c.email;
  });
  if (!withEmail) return NextResponse.json({ error: "Aucun client récent avec un email" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = Array.isArray(withEmail.clients) ? withEmail.clients[0] : withEmail.clients;
  const cible = { prenom: c.prenom || "", nom: c.nom || "", email: c.email as string, date: isoToFr(withEmail.date_intervention), type: withEmail.type_prestation || "", cree: withEmail.created_at };

  if (dry) return NextResponse.json({ dry: true, cible });

  const ok = await sendConfirmationEmail(cible.email, {
    prenom: cible.prenom, typePresta: withEmail.type_prestation || "", quantite: String(withEmail.quantite ?? ""),
    adresse: withEmail.adresse || "", date: cible.date, heure: ((withEmail.heure_intervention as string) || "").substring(0, 5),
    prix: withEmail.prix != null ? String(withEmail.prix) : "",
  });
  if (!ok) return NextResponse.json({ error: "Gmail non connecté" }, { status: 503 });
  return NextResponse.json({ sent: true, to: cible.email, prenom: cible.prenom, nom: cible.nom, date: cible.date });
}
