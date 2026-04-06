import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const rawUrl = searchParams.get("url");
  const name   = searchParams.get("name") || "devis.pdf";

  if (!rawUrl) {
    return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 });
  }

  // Si l'URL est relative (ex: /api/devis/UUID), on la transforme en URL absolue
  const url = rawUrl.startsWith("http") ? rawUrl : `${origin}${rawUrl}`;

  let res: Response;
  try {
    res = await fetch(url);
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
