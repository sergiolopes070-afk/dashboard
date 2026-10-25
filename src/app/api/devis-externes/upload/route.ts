import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { BUCKET, FOLDER, parseKind, validId } from "../_store";

export const dynamic = "force-dynamic";

// Pièce jointe d'un devis externe (PDF ou image) → bucket public `depenses`
// (même bucket/pattern que les justificatifs de dépenses et les photos),
// dossier dédié devis-externes/<kind>/<id>/.
//   • multipart { kind, id, file }            → upload via le serveur (≤ 4 Mo : limite
//                                                de corps de requête Vercel ≈ 4,5 Mo).
//   • JSON { kind, id, nom, type, size }      → URL d'upload signée : le navigateur
//                                                envoie lui-même le fichier (gros PDF,
//                                                photo de téléphone…), jusqu'à 20 Mo.
// Réponse : { url, path, nom, type } (+ signedUrl en mode JSON).
const MAX_DIRECT = 4 * 1024 * 1024;
const MAX_SIGNED = 20 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif|gif))$/i;
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif", "gif"];

function buildPath(kind: string, id: string, nom: string) {
  const ext = (nom.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "pdf";
  return { ext, path: `${FOLDER}/${kind}/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}` };
}

function typeOk(type: string, ext: string) {
  return ALLOWED.test(type) || (!type && ALLOWED_EXT.includes(ext));
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  try {
    // ── Mode URL signée (gros fichiers) ──
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const b = await req.json() as { kind?: string; id?: string; nom?: string; type?: string; size?: number };
      const kind = parseKind(b.kind);
      if (!kind || !validId(b.id)) return NextResponse.json({ error: "kind / id invalides" }, { status: 400 });
      const nom = String(b.nom || "devis.pdf").slice(0, 200);
      const { ext, path } = buildPath(kind, b.id, nom);
      if (!typeOk(String(b.type || ""), ext)) return NextResponse.json({ error: "Format non accepté (PDF ou image uniquement)." }, { status: 400 });
      if ((b.size || 0) > MAX_SIGNED) return NextResponse.json({ error: "Fichier trop lourd (20 Mo max)." }, { status: 400 });

      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw new Error(error?.message || "URL d'upload indisponible");
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return NextResponse.json({ signedUrl: data.signedUrl, url: publicUrl, path, nom, type: String(b.type || "") });
    }

    // ── Mode classique (multipart) ──
    const form = await req.formData();
    const kind = parseKind(form.get("kind"));
    const id = form.get("id");
    const file = form.get("file") as File | null;
    if (!kind || !validId(id)) return NextResponse.json({ error: "kind / id invalides" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
    const { ext, path } = buildPath(kind, id, file.name);
    if (!typeOk(file.type, ext)) return NextResponse.json({ error: "Format non accepté (PDF ou image uniquement)." }, { status: 400 });
    if (file.size > MAX_DIRECT) return NextResponse.json({ error: "Fichier trop lourd pour l'envoi direct (4 Mo max)." }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: file.type || undefined });
    if (error) throw new Error(error.message);
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: publicUrl, path, nom: file.name, type: file.type });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
