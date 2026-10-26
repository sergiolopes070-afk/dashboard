import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { STATUT_ANNULE } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Échappe les données dynamiques avant injection dans le HTML (anti-XSS).
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

const HTML = { "Content-Type": "text/html; charset=utf-8" };
const html = (body: string, status = 200) => new NextResponse(body, { status, headers: HTML });

function plusDActualite() {
  return page("Mission indisponible", "ℹ️", "#6b7280", "Cette mission n'est plus d'actualité.", "Elle a pu être annulée, archivée ou réaffectée. En cas de doute, contactez KinouClean.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Liens Accepter / Refuser envoyés aux prestataires (publics, sans connexion).
//   • GET  → page de CONFIRMATION avec un bouton (aucune modification) : les
//            scanners d'emails (antivirus, aperçus) pré-chargent les liens GET,
//            ce qui acceptait/refusait la mission tout seul.
//   • POST → applique la réponse, seulement si la mission est encore d'actualité :
//            non archivée, non annulée, et toujours attribuée au même prestataire
//            (paramètre optionnel `p` = prestataire_id dans les nouveaux liens).
// Les liens déjà envoyés (?id=…&action=…) restent valables : ils ouvrent la page
// de confirmation. (Pas de jeton HMAC : les liens sont générés côté navigateur,
// où aucun secret serveur n'est disponible.)
// ─────────────────────────────────────────────────────────────────────────────
type Lecture =
  | { ok: false; res: NextResponse }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { ok: true; id: string; action: "accepter" | "refuser"; presta: any; detail: string; nomPresta: string };

async function lire(id: string | null, action: string | null, prestaLien: string | null): Promise<Lecture> {
  if (!supabase) return { ok: false, res: html(errorPage("Service temporairement indisponible."), 503) };
  if (!id || (action !== "accepter" && action !== "refuser")) {
    return { ok: false, res: html(errorPage("Ce lien est invalide ou incomplet."), 400) };
  }

  // Fetch mission details
  const { data: presta, error: fetchErr } = await supabase
    .from("prestations")
    .select("*, clients(*), prestataires(*)")
    .eq("id", id)
    .single();

  if (fetchErr || !presta) return { ok: false, res: html(errorPage("Mission introuvable. Le lien est peut-être expiré."), 404) };

  // Mission plus d'actualité : archivée (terminée ou annulée), annulée, sans
  // prestataire, ou réaffectée à un autre prestataire que celui du lien.
  if (presta.archive || presta.statut === STATUT_ANNULE || !presta.prestataire_id || (prestaLien && prestaLien !== String(presta.prestataire_id))) {
    return { ok: false, res: html(plusDActualite(), 410) };
  }

  const client      = presta.clients       || {};
  const prestataire = presta.prestataires  || {};
  const dateStr     = presta.date_intervention
    ? new Date(presta.date_intervention).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const heureStr    = (presta.heure_intervention || "").substring(0, 5) || "—";

  const detail = [
    `👤 <strong>Client :</strong> ${escapeHtml(client.prenom || "")} ${escapeHtml(client.nom || "")}`,
    `🧹 <strong>Prestation :</strong> ${escapeHtml(presta.type_prestation || "—")}`,
    `📍 <strong>Adresse :</strong> ${escapeHtml(presta.adresse || "—")}`,
    `📅 <strong>Date :</strong> ${escapeHtml(dateStr)} à ${escapeHtml(heureStr)}`,
    `💶 <strong>Prix :</strong> ${presta.prix != null ? `${escapeHtml(String(presta.prix))} €` : "—"}`,
  ].join("<br/>");

  return { ok: true, id, action, presta, detail, nomPresta: prestataire.nom || "" };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const l = await lire(url.searchParams.get("id"), url.searchParams.get("action"), url.searchParams.get("p"));
  if (!l.ok) return l.res;

  const accepter = l.action === "accepter";
  const p = url.searchParams.get("p");
  // Formulaire POST vers la même route (aucune action tant que le bouton n'est pas cliqué).
  const form = `
    <form method="POST" action="/api/mission/reponse" style="margin-top:20px">
      <input type="hidden" name="id" value="${escapeHtml(l.id)}"/>
      <input type="hidden" name="action" value="${l.action}"/>
      ${p ? `<input type="hidden" name="p" value="${escapeHtml(p)}"/>` : ""}
      <button type="submit" style="width:100%;padding:14px 20px;border:0;border-radius:12px;font-size:16px;font-weight:700;color:#fff;cursor:pointer;background:${accepter ? "#22c55e" : "#ef4444"}">
        ${accepter ? "✅ Confirmer : j'accepte la mission" : "❌ Confirmer : je refuse la mission"}
      </button>
    </form>`;
  return html(page(
    accepter ? "Accepter la mission ?" : "Refuser la mission ?",
    accepter ? "🤝" : "✋",
    accepter ? "#22c55e" : "#ef4444",
    `${l.nomPresta ? `Bonjour <strong>${escapeHtml(l.nomPresta)}</strong>, ` : ""}confirmez votre réponse en cliquant sur le bouton ci-dessous.`,
    l.detail + form,
  ));
}

export async function POST(req: Request) {
  let id: string | null = null, action: string | null = null, prestaLien: string | null = null;
  try {
    const f = await req.formData();
    id = (f.get("id") as string | null) || null;
    action = (f.get("action") as string | null) || null;
    prestaLien = (f.get("p") as string | null) || null;
  } catch { /* corps illisible → lien invalide */ }
  const l = await lire(id, action, prestaLien);
  if (!l.ok) return l.res;

  const patch = l.action === "accepter"
    ? { statut_presta: "CONFIRMÉ PRESTA", statut: "CONFIRMÉ" }
    : { statut_presta: "REFUSÉ PRESTA", statut: "PRESTATAIRE REFUSÉ – À RÉAFFECTER" };
  // Conditions répétées dans l'UPDATE : si la mission a été archivée ou réaffectée
  // entre la lecture et l'écriture, aucune ligne n'est modifiée.
  const { data: maj, error: upErr } = await supabase!
    .from("prestations")
    .update(patch)
    .eq("id", l.id)
    .eq("archive", false)
    .eq("prestataire_id", l.presta.prestataire_id)
    .select("id");

  if (upErr) return html(errorPage("Erreur lors de la mise à jour. Veuillez réessayer."), 500);
  if (!maj?.length) return html(plusDActualite(), 410);

  if (l.action === "accepter") {
    return html(page(
      "Mission acceptée ✅",
      "✅",
      "#22c55e",
      `Merci <strong>${escapeHtml(l.nomPresta)}!</strong> Vous avez accepté cette mission. La fiche client a été mise à jour automatiquement.`,
      l.detail,
    ));
  }

  return html(page(
    "Mission refusée",
    "❌",
    "#ef4444",
    `Vous avez refusé cette mission. La fiche client a été mise à jour et la mission sera réaffectée à un autre prestataire.`,
    l.detail,
  ));
}
