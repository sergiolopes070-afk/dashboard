import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return NextResponse.json([]);
  if (!supabase) return NextResponse.json([]);

  const like = `%${q}%`;

  const [{ data: clients }, { data: prestations }, { data: prospects }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, nom, prenom, tel, email, adresse")
      .or(`nom.ilike.${like},prenom.ilike.${like},email.ilike.${like},tel.ilike.${like}`)
      .limit(5),
    supabase
      .from("prestations")
      .select("id, type_prestation, adresse, date_intervention, clients(nom, prenom)")
      .or(`type_prestation.ilike.${like},adresse.ilike.${like}`)
      .eq("archive", false)
      .limit(4),
    supabase
      .from("prospects")
      .select("id, nom, prenom, tel, email, statut")
      .or(`nom.ilike.${like},prenom.ilike.${like},email.ilike.${like},tel.ilike.${like}`)
      .limit(4),
  ]);

  type ClientRow = { id: string; nom: string; prenom: string; tel: string; email: string; adresse: string };
  type PrestaRow = { id: string; type_prestation: string; adresse: string; date_intervention: string; clients: { nom: string; prenom: string }[] | null };
  type ProspectRow = { id: string; nom: string; prenom: string; tel: string; email: string; statut: string };

  const results = [
    ...(clients ?? []).map((c: ClientRow) => ({
      type   : "client",
      label  : `${c.prenom ?? ""} ${c.nom ?? ""}`.trim(),
      sub    : [c.email, c.tel].filter(Boolean).join(" · "),
      href   : "/clients",
      status : null,
    })),
    ...(prospects ?? []).map((p: ProspectRow) => ({
      type   : "prospect",
      label  : `${p.prenom ?? ""} ${p.nom ?? ""}`.trim(),
      sub    : [p.statut, p.email || p.tel].filter(Boolean).join(" · "),
      href   : "/prospects",
      status : p.statut,
    })),
    ...(prestations ?? []).map((p: PrestaRow) => ({
      type   : "prestation",
      label  : p.type_prestation ?? "—",
      sub    : [p.clients?.[0] ? `${p.clients[0].prenom ?? ""} ${p.clients[0].nom ?? ""}`.trim() : "", p.date_intervention].filter(Boolean).join(" · "),
      href   : "/agenda",
      status : null,
    })),
  ];

  return NextResponse.json(results);
}
