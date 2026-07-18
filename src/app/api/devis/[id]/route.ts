import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { supabase } from "@/lib/supabase";
import { DevisPDF, DevisData, LigneSupp, getProfil } from "@/lib/devis-pdf";
import { resolveEntite, Entite, ENTITE_OVERRIDE_KEY } from "@/lib/entite";

export const dynamic = "force-dynamic";

// Corrections manuelles d'entité (settings/entite_override).
async function getEntiteOverrides(): Promise<Record<string, Entite>> {
  if (!supabase) return {};
  const { data } = await supabase.from("settings").select("value").eq("key", ENTITE_OVERRIDE_KEY).maybeSingle();
  try { return data?.value ? (JSON.parse(data.value as string) as Record<string, Entite>) : {}; }
  catch { return {}; }
}

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

function buildRefNumber(id: string, prefix: string): string {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const seq = String(parseInt(id.replace(/-/g,"").slice(0,3), 16) % 1000).padStart(3,"0");
  return `${prefix}-${dateStr}-${seq}`;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url      = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  const etat     = url.searchParams.get("etat") || "";
  const avance   = url.searchParams.get("avance") === "1";
  const credit   = url.searchParams.get("credit") === "1";
  let lignesSupp: LigneSupp[] = [];
  try {
    const suppParam = url.searchParams.get("supp");
    if (suppParam) lignesSupp = JSON.parse(decodeURIComponent(suppParam));
  } catch { /* ignore */ }
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

    // Entité juridique (déduite du type, corrigée manuellement si besoin).
    const overrides = await getEntiteOverrides();
    const entite = resolveEntite(presta.id, presta.type_prestation || "", overrides);
    const profil = getProfil(entite);

    const devisData: DevisData = {
      refNumber       : buildRefNumber(presta.id, profil.refPrefix),
      date            : today(),
      validite        : addDays(30),
      clientNom       : client.nom    || "",
      clientPrenom    : client.prenom || "",
      clientEmail     : client.email  || "",
      clientTel       : client.tel    || "",
      clientAdresse   : client.adresse || presta.adresse || "",
      typePresta      : presta.type_prestation || "Prestation de nettoyage",
      quantite        : String(presta.quantite ?? "1"),
      adresse         : presta.adresse || "",
      etat            : etat || undefined,
      dateInter       : isoToFr(presta.date_intervention),
      heureInter      : (presta.heure_intervention || "").substring(0, 5),
      prix            : presta.prix != null ? String(presta.prix) : "0",
      message         : presta.message || "",
      avanceImmediate : avance || undefined,
      creditImpot     : credit || undefined,
      lignesSupp      : lignesSupp.length ? lignesSupp : undefined,
      entite          : entite,
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
