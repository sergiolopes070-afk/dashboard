import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  getWhatsAppCreds, sendWhatsAppTemplate, normaliserMobileWA, WhatsAppError, whatsAppErrorText,
  WA_TEMPLATE_CLIENT, WA_TEMPLATE_PRESTA, WA_TEMPLATE_LANG,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp (API officielle Meta) — réservé au patron.
//   GET  → état de configuration (sans jamais renvoyer le token).
//   POST { to } → envoie le modèle client « rappel_rdv_client » avec des valeurs
//          fictives au numéro saisi. Déclenché UNIQUEMENT par le bouton
//          « Envoyer un test à mon numéro » de la page Configuration.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const creds = await getWhatsAppCreds();
  return NextResponse.json({
    configured: !!creds,
    source: creds?.source ?? null,
    phoneIdFin: creds ? creds.phoneId.slice(-4) : null,
    templates: { client: WA_TEMPLATE_CLIENT, prestataire: WA_TEMPLATE_PRESTA, langue: WA_TEMPLATE_LANG },
  });
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({})) as { to?: string };
  const to = normaliserMobileWA(body.to);
  if (!to) {
    return NextResponse.json({ ok: false, error: "Numéro invalide : saisissez un mobile (06/07… ou +33 6/7…)." }, { status: 400 });
  }
  if (!(await getWhatsAppCreds())) {
    return NextResponse.json({ ok: false, error: "WhatsApp non configuré (token / Phone Number ID manquants)." }, { status: 503 });
  }

  // Valeurs fictives, dans l'ordre des paramètres du modèle client.
  const params = ["Test", "Ménage + Repassage", "mardi 1 janvier 2030", "09:00", "1 rue de l'Exemple, 75001 Paris", "notre équipe"];
  try {
    const r = await sendWhatsAppTemplate(to, WA_TEMPLATE_CLIENT, WA_TEMPLATE_LANG, params);
    return NextResponse.json({ ok: true, id: r.id, to, template: WA_TEMPLATE_CLIENT });
  } catch (e) {
    const meta = e instanceof WhatsAppError ? { code: e.code, status: e.status, details: e.details } : {};
    return NextResponse.json({ ok: false, error: whatsAppErrorText(e), ...meta }, { status: 502 });
  }
}
