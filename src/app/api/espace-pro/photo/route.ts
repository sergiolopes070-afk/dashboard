import { NextResponse } from "next/server";
import { requirePresta } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { prestationBelongsTo, addPrestationPhoto, removePrestationPhoto } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// POST (multipart) : { prestationId, article, phase: avant|apres, file } — ajoute
// une photo d'intervention. Le prestataire ne peut agir QUE sur ses missions.
export async function POST(req: Request) {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });

  const form = await req.formData();
  const prestationId = String(form.get("prestationId") || "");
  const article = String(form.get("article") || "Article").slice(0, 60);
  const phase = form.get("phase") === "apres" ? "apres" : "avant";
  const file = form.get("file") as File | null;
  if (!prestationId || !file) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

  if (!(await prestationBelongsTo(prestationId, auth.pid))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `interventions/${prestationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from("depenses").upload(path, buffer, { contentType: file.type || "image/jpeg" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from("depenses").getPublicUrl(path);
  const photo = { url: publicUrl, path, article, phase, at: new Date().toISOString() };
  await addPrestationPhoto(prestationId, photo);

  return NextResponse.json({ photo });
}

// DELETE : { prestationId, path } — retire une photo (mission du prestataire).
export async function DELETE(req: Request) {
  const auth = await requirePresta();
  if (auth instanceof NextResponse) return auth;
  const { prestationId, path } = await req.json() as { prestationId?: string; path?: string };
  if (!prestationId || !path) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  if (!(await prestationBelongsTo(prestationId, auth.pid))) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  await removePrestationPhoto(prestationId, path);
  return NextResponse.json({ success: true });
}
