import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function page(title: string, icon: string, color: string, message: string, detail: string) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} – KinouClean</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:20px;box-shadow:0 8px 32px rgba(0,0,0,.12);max-width:460px;width:100%;overflow:hidden}
    .header{background:#1e1e2e;padding:32px 24px;text-align:center}
    .icon{font-size:56px;margin-bottom:8px}
    .body{padding:32px 28px}
    h1{font-size:22px;font-weight:700;color:#111;margin-bottom:8px}
    p{font-size:15px;color:#555;line-height:1.6}
    .badge{display:inline-block;margin-top:16px;padding:6px 16px;border-radius:999px;font-size:13px;font-weight:700;color:#fff;background:${color}}
    .detail{margin-top:20px;background:#f8f9fa;border-radius:12px;padding:16px;font-size:14px;color:#444;line-height:1.7}
    .footer{padding:16px 28px 28px;text-align:center;font-size:12px;color:#aaa}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">${icon}</div>
    </div>
    <div class="body">
      <h1>${title}</h1>
      <p>${message}</p>
      <div class="badge">${title}</div>
      ${detail ? `<div class="detail">${detail}</div>` : ""}
    </div>
    <div class="footer">KinouClean · Gestion des missions</div>
  </div>
</body>
</html>`;
}

function errorPage(msg: string) {
  return page("Lien invalide", "⚠️", "#ef4444", msg, "");
}

export async function GET(req: Request) {
  if (!supabase) {
    return new NextResponse(errorPage("Service temporairement indisponible."), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const url    = new URL(req.url);
  const id     = url.searchParams.get("id");
  const action = url.searchParams.get("action"); // "accepter" | "refuser"

  if (!id || !["accepter", "refuser"].includes(action ?? "")) {
    return new NextResponse(errorPage("Ce lien est invalide ou incomplet."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Fetch mission details
  const { data: presta, error: fetchErr } = await supabase
    .from("prestations")
    .select("*, clients(*), prestataires(*)")
    .eq("id", id)
    .single();

  if (fetchErr || !presta) {
    return new NextResponse(errorPage("Mission introuvable. Le lien est peut-être expiré."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const client      = presta.clients       || {};
  const prestataire = presta.prestataires  || {};
  const dateStr     = presta.date_intervention
    ? new Date(presta.date_intervention).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const heureStr    = (presta.heure_intervention || "").substring(0, 5) || "—";

  const detail = [
    `👤 <strong>Client :</strong> ${client.prenom || ""} ${client.nom || ""}`,
    `🧹 <strong>Prestation :</strong> ${presta.type_prestation || "—"}`,
    `📍 <strong>Adresse :</strong> ${presta.adresse || "—"}`,
    `📅 <strong>Date :</strong> ${dateStr} à ${heureStr}`,
    `💶 <strong>Prix :</strong> ${presta.prix != null ? `${presta.prix} €` : "—"}`,
  ].join("<br/>");

  if (action === "accepter") {
    const { error: upErr } = await supabase
      .from("prestations")
      .update({ statut_presta: "CONFIRMÉ PRESTA", statut: "CONFIRMÉ" })
      .eq("id", id);

    if (upErr) {
      return new NextResponse(errorPage("Erreur lors de la mise à jour. Veuillez réessayer."), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new NextResponse(
      page(
        "Mission acceptée ✅",
        "✅",
        "#22c55e",
        `Merci <strong>${prestataire.nom || ""}!</strong> Vous avez accepté cette mission. La fiche client a été mise à jour automatiquement.`,
        detail,
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // action === "refuser"
  const { error: upErr } = await supabase
    .from("prestations")
    .update({ statut_presta: "REFUSÉ PRESTA", statut: "PRESTATAIRE REFUSÉ – À RÉAFFECTER" })
    .eq("id", id);

  if (upErr) {
    return new NextResponse(errorPage("Erreur lors de la mise à jour. Veuillez réessayer."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new NextResponse(
    page(
      "Mission refusée",
      "❌",
      "#ef4444",
      `Vous avez refusé cette mission. La fiche client a été mise à jour et la mission sera réaffectée à un autre prestataire.`,
      detail,
    ),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
