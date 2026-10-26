import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { getSettingJSON, majSettingJSON } from "@/lib/settings";
import { updateClientNotes } from "@/lib/sheets";
import { sendPhotosInterventionEmail } from "@/lib/mailer";
import { cassepropre } from "@/lib/devisKinou";
import { buildArticles, renderPhotosPdf, imageFormat } from "@/lib/photosPdf";
import type { PhotoIntervention } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // téléchargement des photos + rendu PDF + SMTP

// Photos d'intervention → compte rendu PDF envoyé au client (depuis l'agenda).
//   GET              → { email, prenom, nbPhotos, envoi }   (infos de la feuille d'envoi)
//   GET ?pdf=1       → le PDF (aperçu, inline)
//   GET ?liste=1     → { photos } de la prestation seule (chargement à la demande)
//   POST { message?, to? } → envoie le PDF par Gmail ; { ok, email, envoi, journal }
// Le RDV regroupe les prestations du même client au même créneau (date + heure).
// Après envoi : réglage `photos_envoyees` { [prestationId]: { le, a } } + ligne au
// journal client (clients.notes).

const BUCKET = "depenses";
const PHOTO_PREFIX = "interventions/";
const MAX_PDF_BYTES = 18 * 1024 * 1024; // Gmail : 25 Mo max, pièce jointe encodée en base64 (+33 %)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Envoi = { le: string; a: string };

function isoToFr(s: string | null | undefined): string {
  if (!s) return "";
  const p = s.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

type Ctx = {
  ids: string[];
  clientId: string;
  email: string; prenom: string; nom: string;
  date: string; heure: string; adresse: string;
  prestations: string[]; prestataire: string;
  photos: PhotoIntervention[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const one = (v: any) => (Array.isArray(v) ? v[0] : v) || {};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

async function loadCtx(id: string): Promise<Ctx | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("prestations").select("*, clients(*), prestataires(nom)").eq("id", id).limit(1);
  const p = data?.[0];
  if (!p) return null;
  let rows = [p];
  // Prestations sœurs du même RDV (même client, même date, même heure).
  if (p.client_id && p.date_intervention) {
    let q = supabase.from("prestations").select("*, prestataires(nom)")
      .eq("client_id", p.client_id).eq("date_intervention", p.date_intervention);
    q = p.heure_intervention ? q.eq("heure_intervention", p.heure_intervention) : q.is("heure_intervention", null);
    const { data: sib } = await q;
    if (Array.isArray(sib) && sib.length) rows = [p, ...sib.filter(r => r.id !== p.id)];
  }
  const c = one(p.clients);
  const prestaNom = rows.map(r => str(one(r.prestataires).nom)).find(Boolean) || "";
  const photos: PhotoIntervention[] = rows.flatMap(r => (Array.isArray(r.photos) ? r.photos : []))
    .filter((x: PhotoIntervention) => x && typeof x.path === "string" && x.path.startsWith(PHOTO_PREFIX));
  const prestations = rows.map(r => {
    const t = str(r.type_prestation);
    const q = str(r.quantite);
    return t ? (q && q !== "1" ? `${t} (${q})` : t) : "";
  }).filter(Boolean);
  return {
    ids: rows.map(r => r.id as string),
    clientId: str(p.client_id),
    email: str(c.email), prenom: str(c.prenom), nom: str(c.nom),
    date: isoToFr(p.date_intervention), heure: str(p.heure_intervention).substring(0, 5),
    adresse: str(p.adresse) || str(c.adresse),
    prestations: Array.from(new Set(prestations)),
    prestataire: prestaNom ? cassepropre(prestaNom.split(/\s+/)[0]) : "",
    photos,
  };
}

// Téléchargement depuis le bucket (pas d'URL arbitraire) : version redimensionnée
// si la transformation d'images Supabase est disponible, sinon l'original.
async function download(p: PhotoIntervention): Promise<Buffer | null> {
  if (!supabase) return null;
  const st = supabase.storage.from(BUCKET);
  try {
    const t = await st.download(p.path, { transform: { width: 1200, height: 1200, resize: "contain", quality: 70, format: "origin" } });
    if (!t.error && t.data && t.data.size > 0) {
      const b = Buffer.from(await t.data.arrayBuffer());
      if (imageFormat(b)) return b; // sinon (WebP…) → original
    }
  } catch { /* transformation indisponible */ }
  const o = await st.download(p.path);
  if (o.error || !o.data) return null;
  return Buffer.from(await o.data.arrayBuffer());
}

async function buildPdf(ctx: Ctx): Promise<{ pdf: Buffer; inclus: number; omis: number }> {
  const { articles, omis, inclus } = await buildArticles(ctx.photos, download);
  const pdf = await renderPhotosPdf({
    client: [ctx.prenom, ctx.nom].filter(Boolean).map(cassepropre).join(" "),
    date: ctx.date, heure: ctx.heure, prestations: ctx.prestations,
    adresse: ctx.adresse, prestataire: ctx.prestataire, articles, omis,
  });
  return { pdf, inclus, omis };
}

const fichier = (ctx: Ctx) => `KinouClean-photos-${(ctx.date || new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })).replace(/\//g, "-")}.pdf`;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  // ?liste=1 → { photos } : tableau complet de CETTE prestation (la liste archive
  // n'envoie que nbPhotos ; l'agenda charge les photos à l'ouverture du RDV).
  if (new URL(req.url).searchParams.get("liste") === "1") {
    const { data, error } = await supabase.from("prestations").select("photos").eq("id", params.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Prestation introuvable" }, { status: 404 });
    return NextResponse.json({ photos: Array.isArray(data.photos) ? data.photos : [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const ctx = await loadCtx(params.id);
  if (!ctx) return NextResponse.json({ error: "Prestation introuvable" }, { status: 404 });

  if (new URL(req.url).searchParams.get("pdf") !== "1") {
    const map = await getSettingJSON<Record<string, Envoi>>("photos_envoyees", {});
    const envoi = ctx.ids.map(i => map[i]).filter(Boolean).sort((a, b) => b.le.localeCompare(a.le))[0] || null;
    return NextResponse.json({ email: ctx.email, prenom: ctx.prenom, nbPhotos: ctx.photos.length, envoi });
  }

  if (!ctx.photos.length) return NextResponse.json({ error: "Aucune photo sur cette intervention." }, { status: 400 });
  try {
    const { pdf, inclus } = await buildPdf(ctx);
    if (!inclus) return NextResponse.json({ error: "Aucune photo n'a pu être chargée (format non pris en charge ou fichier absent du stockage)." }, { status: 502 });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fichier(ctx)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Génération du PDF impossible : ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const body = await req.json().catch(() => ({})) as { message?: string; to?: string };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";

  const ctx = await loadCtx(params.id);
  if (!ctx) return NextResponse.json({ error: "Prestation introuvable" }, { status: 404 });
  const to = (typeof body.to === "string" && body.to.trim()) ? body.to.trim() : ctx.email;
  if (!to) return NextResponse.json({ error: "Pas d'adresse email sur la fiche client — ajoute-la avant d'envoyer les photos." }, { status: 400 });
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: `Adresse email invalide : ${to}` }, { status: 400 });
  if (!ctx.photos.length) return NextResponse.json({ error: "Aucune photo sur cette intervention." }, { status: 400 });

  let built: { pdf: Buffer; inclus: number; omis: number };
  try { built = await buildPdf(ctx); }
  catch (e) { return NextResponse.json({ error: `Génération du PDF impossible : ${e instanceof Error ? e.message : String(e)}` }, { status: 500 }); }
  if (!built.inclus) return NextResponse.json({ error: "Aucune photo n'a pu être chargée (format non pris en charge ou fichier absent du stockage)." }, { status: 502 });
  if (built.pdf.length > MAX_PDF_BYTES) {
    return NextResponse.json({ error: `PDF trop lourd (${(built.pdf.length / 1048576).toFixed(1)} Mo) — Gmail risque de le refuser.` }, { status: 413 });
  }

  try {
    await sendPhotosInterventionEmail(to, {
      prenom: ctx.prenom, typePresta: ctx.prestations.length === 1 ? ctx.prestations[0] : "",
      date: ctx.date, message, pdf: built.pdf, filename: fichier(ctx),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[prestations/photos] échec :", msg);
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Gmail non connecté") ? 503 : 502 });
  }

  // Marquage (best effort : l'email est déjà parti).
  const now = new Date().toISOString();
  const envoi: Envoi = { le: now, a: to };
  let warn = "";
  try {
    await majSettingJSON<Record<string, Envoi>>("photos_envoyees", {}, map => { for (const i of ctx.ids) map[i] = envoi; });
  } catch (e) { warn = e instanceof Error ? e.message : String(e); console.error("[prestations/photos] marquage KO :", warn); }

  // Journal client (notes : plus récente en tête, même format que ClientFiche).
  const jjmm = ctx.date ? ctx.date.slice(0, 5) : new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });
  const journal = { id: crypto.randomUUID(), date: now, texte: `📸 Photos de l'intervention du ${jjmm} envoyées par email (à ${to})`, type: "📧" };
  let journalOk = false;
  if (ctx.clientId) {
    try {
      const { data } = await supabase.from("clients").select("notes").eq("id", ctx.clientId).limit(1);
      const notes = Array.isArray(data?.[0]?.notes) ? data![0].notes : [];
      await updateClientNotes(ctx.clientId, [journal, ...notes]);
      journalOk = true;
    } catch (e) { console.error("[prestations/photos] journal KO :", e); }
  }

  return NextResponse.json({
    ok: true, email: to, envoi, inclus: built.inclus, omis: built.omis,
    journal: journalOk ? journal : null, ...(warn ? { warn: `Envoi non mémorisé : ${warn}` } : {}),
  });
}
