import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGmailTransporter, buildRappelMessage } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Cron quotidien 18h (Paris) : envoie à l'équipe (kinouclean@gmail.com) la liste
// des RDV du LENDEMAIN, chacun avec un lien WhatsApp prêt à cliquer pour envoyer
// le rappel au client. Si un client a plusieurs prestations le même jour, elles
// sont regroupées en un seul message.
//
// Sécurité : en-tête interne x-vercel-cron (invocation planifiée) OU ?key=<secret>.
// ?test=1 → renvoie le détail JSON sans envoyer l'email.
// ─────────────────────────────────────────────────────────────────────────────

function getCronSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) {
    if (/^cron_?secret$/i.test(k) && v) return v;
  }
  return undefined;
}

// `envoiAutorise` = secret valide. L'en-tête `x-vercel-cron` seul est accepté
// mais SANS droit d'envoi (il est falsifiable sur une URL publique) : la requête
// répond alors en lecture seule, comme un ?test=1.
function authorize(req: Request): { ok: boolean; envoiAutorise: boolean } {
  const secret = getCronSecret();
  const key = new URL(req.url).searchParams.get("key");
  const auth = req.headers.get("authorization");
  if (secret && (key === secret || auth === `Bearer ${secret}`)) return { ok: true, envoiAutorise: true };
  if (req.headers.get("x-vercel-cron")) return { ok: true, envoiAutorise: false };
  return { ok: false, envoiAutorise: false };
}

// Date de demain au format YYYY-MM-DD, en fuseau Europe/Paris.
function demainParisISO(): string {
  const todayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [y, m, d] = todayParis.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
const waTel = (tel: string) => tel.replace(/\s/g, "").replace(/^0/, "33");

export async function GET(req: Request) {
  const droits = authorize(req);
  if (!droits.ok) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  // Sans secret valide → lecture seule (aucun email envoyé).
  const test = new URL(req.url).searchParams.get("test") === "1" || !droits.envoiAutorise;
  const demainISO = demainParisISO();

  const { data, error } = await supabase
    .from("prestations")
    .select("id, type_prestation, heure_intervention, adresse, date_intervention, client_id, clients(prenom, nom, tel)")
    .eq("archive", false)
    .not("date_intervention", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = (data || []).filter(p => String(p.date_intervention).slice(0, 10) === demainISO);

  // Regroupement par client (téléphone en priorité, sinon client_id).
  type Grp = { prenom: string; nom: string; tel: string; prestations: string[]; heures: string[]; adresse: string };
  const groupes = new Map<string, Grp>();
  for (const p of rows) {
    const c = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
    const cle = (c.tel || p.client_id || p.id) as string;
    const g: Grp = groupes.get(cle) || { prenom: c.prenom || "", nom: c.nom || "", tel: c.tel || "", prestations: [], heures: [], adresse: p.adresse || "" };
    if (p.type_prestation) g.prestations.push(p.type_prestation);
    if (p.heure_intervention) g.heures.push(String(p.heure_intervention).slice(0, 5));
    if (!g.adresse && p.adresse) g.adresse = p.adresse;
    groupes.set(cle, g);
  }

  const rappels = Array.from(groupes.values()).map(g => {
    const heure = g.heures.sort()[0] || "";
    const message = buildRappelMessage({ prenom: g.prenom, prestations: g.prestations, date: frDate(demainISO), heure, adresse: g.adresse });
    const waLink = g.tel ? `https://wa.me/${waTel(g.tel)}?text=${encodeURIComponent(message)}` : null;
    return {
      client: `${g.prenom} ${g.nom}`.trim(),
      tel: g.tel || null,
      heure: heure || null,
      prestations: g.prestations,
      waLink,
    };
  }).sort((a, b) => (a.heure || "").localeCompare(b.heure || ""));

  if (test) {
    return NextResponse.json({ mode: "TEST (aucun email envoyé)", demain: demainISO, nbRappels: rappels.length, rappels });
  }

  if (rappels.length === 0) {
    return NextResponse.json({ demain: demainISO, nbRappels: 0, note: "Aucun RDV demain — pas d'email envoyé." });
  }

  const gmail = await getGmailTransporter();
  if (!gmail) return NextResponse.json({ error: "Gmail non connecté" }, { status: 503 });
  const dest = process.env.AUTH_EMAIL || gmail.user;

  // Bouton "table" (le standard email : compatible Gmail/Outlook/iOS) + lien
  // texte de secours juste en dessous, pour que ce soit TOUJOURS cliquable.
  const lignes = rappels.map(r => `
    <tr><td style="padding:14px 16px;border-bottom:1px solid #eef0f4;">
      <div style="font-size:15px;font-weight:bold;color:#1C3557;">${r.heure ? r.heure + " · " : ""}${r.client || "Client"}</div>
      <div style="font-size:13px;color:#6B7280;margin:2px 0 10px;">🧹 ${r.prestations.join(" + ") || "—"}${r.tel ? ` · 📞 ${r.tel}` : ""}</div>
      ${r.waLink
        ? `<table cellpadding="0" cellspacing="0" border="0"><tr>
             <td bgcolor="#25D366" style="border-radius:8px;">
               <a href="${r.waLink}" target="_blank" style="display:block;padding:11px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Envoyer le rappel WhatsApp</a>
             </td>
           </tr></table>
           <div style="font-size:11px;margin-top:6px;">
             <a href="${r.waLink}" target="_blank" style="color:#1C3557;">ou ouvrir le lien WhatsApp</a>
           </div>`
        : `<span style="font-size:12px;color:#9CA3AF;">Pas de numéro de téléphone</span>`}
    </td></tr>`).join("");

  // Version texte brut : les URL y sont cliquables dans tous les clients mail.
  const texte =
    `Rappels à envoyer — RDV du ${frDate(demainISO)} (${rappels.length})\n\n` +
    rappels.map(r =>
      `${r.heure ? r.heure + " · " : ""}${r.client || "Client"}` +
      `${r.prestations.length ? ` — ${r.prestations.join(" + ")}` : ""}` +
      `${r.tel ? ` — ${r.tel}` : ""}\n${r.waLink || "(pas de numéro)"}\n`
    ).join("\n");

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:28px 16px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#1C3557;padding:24px 28px;">
        <div style="color:#fff;font-size:18px;font-weight:bold;">🔔 Rappels à envoyer — RDV de demain</div>
        <div style="color:rgba(255,255,255,0.65);font-size:13px;margin-top:4px;">${frDate(demainISO)} · ${rappels.length} rendez-vous</div>
      </td></tr>
      <tr><td style="padding:6px 12px;">
        <p style="font-size:13px;color:#6B7280;padding:12px 4px 4px;">Cliquez sur chaque bouton pour ouvrir WhatsApp avec le message de rappel prérempli.</p>
        <table width="100%" cellpadding="0" cellspacing="0">${lignes}</table>
      </td></tr>
      <tr><td style="background:#1C3557;padding:14px 28px;text-align:center;">
        <div style="color:rgba(255,255,255,0.6);font-size:11px;">KinouClean · rappel automatique quotidien</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  try {
    await gmail.transporter.sendMail({
      from: `"KinouClean" <${gmail.user}>`, to: dest,
      subject: `🔔 ${rappels.length} rappel(s) à envoyer — RDV du ${frDate(demainISO)}`,
      text: texte,
      html,
    });
    return NextResponse.json({ demain: demainISO, nbRappels: rappels.length, envoyeA: dest });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur d'envoi" }, { status: 500 });
  }
}
