import { NextResponse } from "next/server";
import { requirePresta } from "@/lib/require-auth";
import { getPrestataireIndispos, setPrestataireIndispo } from "@/lib/sheets";
import { supabase } from "@/lib/supabase";
import { sendPatronNotif } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Notifie le patron par email d'une nouvelle demande de congé / indisponibilité
// (non bloquant : l'enregistrement a déjà réussi).
async function notifierConge(pid: string, d: { date: string; debut: string; fin: string }): Promise<void> {
  try {
    let nom = "";
    if (supabase) {
      const { data } = await supabase.from("prestataires").select("nom").eq("id", pid).maybeSingle();
      nom = (data?.nom as string) || "";
    }
    const dateFr = d.date.split("-").reverse().join("/");
    const creneau = d.debut && d.fin ? `${d.debut} – ${d.fin}` : "Journée entière";
    await sendPatronNotif(
      `🌴 Demande de congé — ${nom || "prestataire"}`,
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;">
        <div style="background:#1C3557;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:16px;font-weight:bold;">🌴 Nouvelle demande de congé</div>
        <div style="border:1px solid #eef0f4;border-top:none;border-radius:0 0 12px 12px;padding:20px 22px;">
          <p style="margin:0 0 12px;font-size:14px;color:#374151;"><strong>${nom || "Un prestataire"}</strong> se déclare indisponible :</p>
          <div style="background:#F9FAFB;border-radius:10px;padding:14px 16px;font-size:15px;color:#1F2937;">📅 ${dateFr}<br/>⏰ ${creneau}</div>
          <p style="margin:16px 0 0;font-size:13px;color:#6B7280;">Pensez à en tenir compte dans le planning.</p>
        </div>
      </div>`,
      `${nom || "Un prestataire"} se déclare indisponible :\n\n📅 ${dateFr}\n⏰ ${creneau}\n\nPensez à en tenir compte dans le planning.`,
    );
  } catch { /* email non bloquant */ }
}

// GET → { indispos: [{date, debut, fin}, …] } du prestataire connecté.
export async function GET() {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ indispos: await getPrestataireIndispos(auth.pid) });
}

// POST { date, debut?, fin?, bloquer } → ajoute/retire une indispo (jour entier
// si debut/fin vides, sinon créneau). Prestataire connecté uniquement.
export async function POST(req: Request) {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  const b = await req.json() as { date?: string; debut?: string; fin?: string; bloquer?: boolean };
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  const hm = /^\d{2}:\d{2}$/;
  const debut = b.debut && hm.test(b.debut) ? b.debut : "";
  const fin = b.fin && hm.test(b.fin) ? b.fin : "";
  try {
    const indispos = await setPrestataireIndispo(auth.pid, { date: b.date, debut, fin }, !!b.bloquer);
    // Notifie le patron uniquement à la POSE d'un congé (pas au retrait).
    if (b.bloquer) await notifierConge(auth.pid, { date: b.date, debut, fin });
    return NextResponse.json({ indispos });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
