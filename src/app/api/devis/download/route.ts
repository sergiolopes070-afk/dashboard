import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const name = searchParams.get("name") || "devis.pdf";

  if (!url) {
    return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return NextResponse.json({ error: "Impossible de récupérer le fichier" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "PDF introuvable" }, { status: 404 });
  }

  const buffer = await res.arrayBuffer();
  const filename = name.endsWith(".pdf") ? name : `${name}.pdf`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
