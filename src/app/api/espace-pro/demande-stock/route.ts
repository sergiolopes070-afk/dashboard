import { NextResponse } from "next/server";
import { requirePresta } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { addDemande } from "@/lib/demandes";
import { getGmailTransporter } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Notifie le patron par email d'une nouvelle demande de matériel (non bloquant).
async function notifierPatron(d: { nom: string; categorie: string; quantite: string; details: string }): Promise<void> {
  try {
    const gmail = await getGmailTransporter();
    if (!gmail) return;
    const dest = process.env.AUTH_EMAIL || gmail.user;
    const ligne = [d.categorie, d.quantite ? `× ${d.quantite}` : "", d.details ? `— ${d.details}` : ""].filter(Boolean).join(" ");
    await gmail.transporter.sendMail({
      from: `"KinouClean" <${gmail.user}>`, to: dest,
      subject: `🧰 Demande de matériel — ${d.nom || "prestataire"}`,
      text: `${d.nom || "Un prestataire"} demande du matériel :\n\n${ligne}\n\nÀ traiter depuis le tableau de bord (carte « Demandes matériel »).`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;">
        <div style="background:#1C3557;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:16px;font-weight:bold;">🧰 Nouvelle demande de matériel</div>
        <div style="border:1px solid #eef0f4;border-top:none;border-radius:0 0 12px 12px;padding:20px 22px;">
          <p style="margin:0 0 10px;font-size:14px;color:#374151;"><strong>${d.nom || "Un prestataire"}</strong> a demandé :</p>
          <div style="background:#F9FAFB;border-radius:10px;padding:14px 16px;font-size:15px;color:#1F2937;">${ligne || "—"}</div>
          <p style="margin:16px 0 0;font-size:13px;color:#6B7280;">À traiter depuis le tableau de bord (carte « Demandes matériel »).</p>
        </div>
      </div>`,
    });
  } catch { /* l'enregistrement de la demande a réussi ; l'email n'est pas bloquant */ }
}

// POST { categorie, quantite?, details } — le prestataire connecté demande du
// matériel. La demande remonte sur le tableau de bord du patron.
export async function POST(req: Request) {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;

  const b = await req.json() as { categorie?: string; quantite?: string; details?: string };
  const categorie = (b.categorie || "Autre").slice(0, 40);
  const details = (b.details || "").slice(0, 400).trim();
  const quantite = (b.quantite || "").slice(0, 40).trim();
  if (!details && categorie === "Autre") return NextResponse.json({ error: "Précise ta demande" }, { status: 400 });

  // Nom du prestataire pour l'affichage côté patron.
  let nom = "";
  if (supabase) {
    const { data } = await supabase.from("prestataires").select("nom").eq("id", auth.pid).maybeSingle();
    nom = (data?.nom as string) || "";
  }

  try {
    const demande = await addDemande({ prestataireId: auth.pid, prestataireNom: nom, categorie, quantite, details });
    await notifierPatron({ nom, categorie, quantite, details });
    return NextResponse.json({ demande });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
