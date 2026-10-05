import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getSettingJSON, setSettingRaw } from "@/lib/settings";
import { sendProspectRelanceEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Suivi commercial d'un prospect (devis envoyé + relances manuelles), stocké dans
// settings/prospects_suivi (aucune colonne DB à créer).
//   POST { action: "devis_envoye" }  → bascule « devis envoyé » + date, statut → CONTACTÉ.
//   POST { action: "relance" }       → envoie la relance suivante (1→2→3), statut → RELANCÉ.
const SUIVI_KEY = "prospects_suivi";
type Suivi = { devisEnvoye?: boolean; devisDate?: string; relanceNiveau?: number; relanceDate?: string };

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const { id } = params;
  const { action } = await req.json() as { action?: string };

  const all = await getSettingJSON<Record<string, Suivi>>(SUIVI_KEY, {});
  const cur: Suivi = all[id] || {};
  const todayFr = new Date().toLocaleDateString("fr-FR");

  if (action === "devis_envoye") {
    const nowOn = !cur.devisEnvoye;
    all[id] = { ...cur, devisEnvoye: nowOn, devisDate: nowOn ? todayFr : cur.devisDate };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: errSet }, { status: 500 });
    // Un prospect avec un devis envoyé n'est plus « Nouveau ».
    if (nowOn) await supabase.from("prospects").update({ statut: "CONTACTÉ", updated_at: new Date().toISOString() }).eq("id", id).eq("statut", "NOUVEAU");
    return NextResponse.json({ suivi: all[id] });
  }

  if (action === "relance") {
    const { data: p } = await supabase
      .from("prospects").select("prenom, email, type_presta, besoins, budget").eq("id", id).single();
    if (!p) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    if (!p.email) return NextResponse.json({ error: "Ce prospect n'a pas d'adresse email." }, { status: 400 });

    const niveau = Math.min((cur.relanceNiveau || 0) + 1, 3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const besoins: any[] = Array.isArray(p.besoins) ? p.besoins : [];
    const prestation = (besoins[0]?.typePresta as string) || (p.type_presta as string) || "";
    const prix = (besoins[0]?.prix as string) || (p.budget as string) || "";

    const ok = await sendProspectRelanceEmail(p.email as string, niveau, {
      prenom: (p.prenom as string) || "", prestation, devisDate: cur.devisDate, prix,
    });
    if (!ok) return NextResponse.json({ error: "Gmail non connecté (Configuration → Connexion Gmail)." }, { status: 503 });

    all[id] = { ...cur, relanceNiveau: niveau, relanceDate: new Date().toISOString() };
    const errSet = await setSettingRaw(SUIVI_KEY, JSON.stringify(all));
    if (errSet) return NextResponse.json({ error: `Relance envoyée mais suivi non enregistré : ${errSet}` }, { status: 500 });
    await supabase.from("prospects").update({ statut: "RELANCÉ", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ suivi: all[id], niveau });
  }

  return NextResponse.json({ error: "action invalide" }, { status: 400 });
}
