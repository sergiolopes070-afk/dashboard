import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const rawUrl = searchParams.get("url");
  const name   = searchParams.get("name") || "devis.pdf";

  if (!rawUrl) {
    return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 });
  }

  // Anti-SSRF : on résout l'URL (relative ou absolue) contre l'origine de l'app,
  // puis on n'autorise QUE la même origine et le chemin des devis (/api/devis/…).
  // Toute URL externe / IP interne / autre chemin est refusée.
  let target: URL;
  try {
    target = new URL(rawUrl, origin);
  } catch {
    return NextResponse.json({ error: "URL invalide" }, { status: 400 });
  }

  if (target.origin !== origin || !target.pathname.startsWith("/api/devis/")) {
    return NextResponse.json({ error: "URL non autorisée" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(target.toString());
  } catch {
    return NextResponse.json({ error: "Impossible de récupérer le fichier" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "PDF introuvable" }, { status: 404 });
  }

  const buffer   = await res.arrayBuffer();
  const filename = name.endsWith(".pdf") ? name : `${name}.pdf`;

  return new Response(buffer, {
    headers: {
      "Content-Type"       : "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
