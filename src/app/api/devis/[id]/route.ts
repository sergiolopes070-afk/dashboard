import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { supabase } from "@/lib/supabase";
import { DevisPDF, DevisData } from "@/lib/devis-pdf";

export const dynamic = "force-dynamic";

function today(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function isoToFr(s: string | null): string {
  if (!s) return "";
  const p = s.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const download = new URL(req.url).searchParams.get("download") === "1";
  try {
    if (!supabase) {
      return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
    }

    // Fetch the prestation with client data
    const { data: presta, error } = await supabase
      .from("prestations")
      .select("*, clients(*), prestataires(*)")
      .eq("id", params.id)
      .single();

    if (error || !presta) {
      return NextResponse.json({ error: "Prestation introuvable" }, { status: 404 });
    }

    const client = presta.clients || {};

    const devisData: DevisData = {
      refNumber    : `KC-${presta.id.slice(0, 8).toUpperCase()}`,
      date         : today(),
      validite     : addDays(30),
      clientNom    : client.nom    || "",
      clientPrenom : client.prenom || "",
      clientEmail  : client.email  || "",
      clientTel    : client.tel    || "",
      clientAdresse: client.adresse || presta.adresse || "",
      typePresta   : presta.type_prestation || "Prestation de nettoyage",
      quantite     : String(presta.quantite ?? "1"),
      adresse      : presta.adresse || "",
      dateInter    : isoToFr(presta.date_intervention),
      heureInter   : (presta.heure_intervention || "").substring(0, 5),
      prix         : presta.prix != null ? String(presta.prix) : "0",
      message      : presta.message || "",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(React.createElement(DevisPDF, { d: devisData }) as any);

    // Mark devis as generated in DB
    await supabase
      .from("prestations")
      .update({ devis_genere: true })
      .eq("id", params.id);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type"       : "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="devis-${devisData.refNumber}.pdf"`,
        "Cache-Control"      : "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[Devis API]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
