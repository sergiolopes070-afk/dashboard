// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Cloud API (Meta, API OFFICIELLE) — envoi de messages.
//
// Identifiants : variables d'env WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID
// (prioritaires), sinon réglages `whatsapp_token` / `whatsapp_phone_number_id`
// enregistrés depuis la page Configuration (même schéma que Gmail/Stripe).
// Tant que rien n'est configuré, AUCUN appel réseau n'est possible.
//
// Messages « à l'initiative de l'entreprise » (rappels de la veille) : Meta
// impose des MODÈLES (templates) approuvés → sendWhatsAppTemplate().
// Le texte libre (sendWhatsAppText) ne marche que dans la fenêtre de 24 h
// après le dernier message du destinataire.
// ─────────────────────────────────────────────────────────────────────────────
import { getSettingRaw } from "./settings";

const GRAPH_VERSION = "v21.0";

// ─── Modèles attendus côté Meta (à créer dans WhatsApp Manager) ─────────────
// Langue : « French » (code fr). Catégorie : Utility.
//
// rappel_rdv_client — 6 paramètres de corps, dans CET ordre :
//   {{1}} prénom du client
//   {{2}} prestation(s) (regroupées : « Ménage + Repassage »)
//   {{3}} date en toutes lettres (« mardi 27 octobre 2026 »)
//   {{4}} heure (« 09:00 », ou « horaire à confirmer »)
//   {{5}} adresse
//   {{6}} prestataire (prénom(s), ou « notre équipe »)
//
// mission_prestataire — 7 paramètres de corps, dans CET ordre :
//   {{1}} prénom du prestataire
//   {{2}} date en toutes lettres
//   {{3}} heure
//   {{4}} prestation(s)
//   {{5}} nom du client
//   {{6}} adresse
//   {{7}} téléphone du client
export const WA_TEMPLATE_CLIENT = "rappel_rdv_client";
export const WA_TEMPLATE_PRESTA = "mission_prestataire";
export const WA_TEMPLATE_LANG   = "fr";

// ─── Identifiants ────────────────────────────────────────────────────────────

export type WhatsAppCreds = { token: string; phoneId: string; source: "env" | "settings" };

/** Identifiants WhatsApp (env prioritaire, sinon réglages), ou null. */
export async function getWhatsAppCreds(): Promise<WhatsAppCreds | null> {
  const envToken = process.env.WHATSAPP_TOKEN?.trim();
  const envPhone = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (envToken && envPhone) return { token: envToken, phoneId: envPhone, source: "env" };
  const token   = envToken || (await getSettingRaw("whatsapp_token"))?.trim() || "";
  const phoneId = envPhone || (await getSettingRaw("whatsapp_phone_number_id"))?.trim() || "";
  if (!token || !phoneId) return null;
  return { token, phoneId, source: "settings" };
}

export async function isWhatsAppConfigured(): Promise<boolean> {
  return (await getWhatsAppCreds()) !== null;
}

// ─── Erreurs lisibles ────────────────────────────────────────────────────────

const AIDE_CODES: Record<number, string> = {
  190   : "Token expiré ou invalide — générez un token permanent (utilisateur système) dans Meta Business.",
  10    : "Permission refusée — le token n'a pas les droits whatsapp_business_messaging.",
  100   : "Paramètre invalide (Phone Number ID erroné, ou valeur de modèle refusée).",
  368   : "Compte temporairement bloqué par Meta (non-respect des règles).",
  130429: "Limite de débit Meta atteinte — réessayez plus tard.",
  131000: "Erreur interne Meta — réessayez plus tard.",
  131005: "Accès refusé — vérifiez les permissions du token.",
  131008: "Paramètre obligatoire manquant.",
  131009: "Valeur de paramètre invalide (numéro mal formé ?).",
  131026: "Message non délivrable — numéro sans WhatsApp, ou destinataire n'ayant pas accepté les nouvelles conditions.",
  131030: "Numéro non autorisé : en mode test Meta, ajoutez-le à la liste des destinataires autorisés.",
  131031: "Compte WhatsApp Business verrouillé.",
  131047: "Plus de 24 h depuis le dernier message du destinataire — seul un modèle approuvé peut être envoyé.",
  131049: "Message non livré par Meta pour préserver l'engagement (trop de messages marketing).",
  131051: "Type de message non pris en charge.",
  131056: "Trop de messages envoyés au même numéro en peu de temps.",
  132000: "Nombre de paramètres différent de celui du modèle approuvé.",
  132001: "Modèle introuvable : nom ou langue (fr) incorrects, ou modèle pas encore approuvé.",
  132005: "Texte du modèle trop long une fois les paramètres insérés.",
  132007: "Le contenu des paramètres enfreint les règles Meta.",
  132012: "Format des paramètres incorrect pour ce modèle.",
  132015: "Modèle mis en pause par Meta (mauvaise qualité).",
  132016: "Modèle désactivé par Meta.",
  133010: "Numéro d'envoi pas encore enregistré sur l'API Cloud.",
};

export class WhatsAppError extends Error {
  code: number | null;
  status: number;
  details: string;
  /** Phrase en français, prête à afficher. */
  lisible: string;
  constructor(status: number, code: number | null, metaMessage: string, details = "") {
    const aide = code != null ? AIDE_CODES[code] : undefined;
    const lisible = `${code != null ? `Erreur Meta ${code}` : `Erreur HTTP ${status}`} : ${aide ?? metaMessage}` +
      (aide && metaMessage ? ` (${metaMessage}${details ? ` — ${details}` : ""})` : details ? ` — ${details}` : "");
    super(lisible);
    this.name = "WhatsAppError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.lisible = lisible;
  }
}

/** Message d'erreur affichable, quelle que soit l'exception. */
export function whatsAppErrorText(e: unknown): string {
  if (e instanceof WhatsAppError) return e.lisible;
  if (e instanceof Error) return e.message;
  return String(e);
}

// ─── Appel Graph API ─────────────────────────────────────────────────────────

async function graphPost(body: Record<string, unknown>): Promise<{ messages?: { id: string }[] }> {
  const creds = await getWhatsAppCreds();
  if (!creds) throw new WhatsAppError(0, null, "WhatsApp non configuré (token / Phone Number ID manquants)");

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(creds.phoneId)}/messages`, {
      method : "POST",
      headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
      body   : JSON.stringify({ messaging_product: "whatsapp", ...body }),
      cache  : "no-store",
      signal : AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new WhatsAppError(0, null, `Meta injoignable : ${e instanceof Error ? e.message : String(e)}`);
  }

  const raw = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* réponse non JSON */ }
  if (!res.ok || json?.error) {
    const err = json?.error || {};
    const code = typeof err.code === "number" ? err.code : null;
    const details = String(err.error_data?.details || "").slice(0, 300);
    throw new WhatsAppError(res.status, code, String(err.message || raw || res.statusText).slice(0, 300), details);
  }
  return json || {};
}

// ─── Numéros ─────────────────────────────────────────────────────────────────

/**
 * Numéro au format WhatsApp (chiffres, indicatif sans « + »), ou null.
 * Mobiles français : 06/07…, +33 6/7…, 0033 6/7…, 33 6/7… → 336XXXXXXXX.
 * Numéro international explicite (+XX… hors France) : accepté tel quel.
 * Fixes français (01–05, 09) : null (pas de WhatsApp fiable).
 */
export function normaliserMobileWA(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const brut = String(tel).trim();
  const plus = brut.startsWith("+") || brut.startsWith("00");
  let d = brut.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^0[67]\d{8}$/.test(d)) return "33" + d.slice(1);
  if (/^33[67]\d{8}$/.test(d)) return d;
  if (/^330[67]\d{8}$/.test(d)) return "33" + d.slice(3); // +33 (0)6…
  if (plus && !d.startsWith("33") && /^[1-9]\d{7,14}$/.test(d)) return d;
  return null;
}

/** Masque un numéro pour l'affichage (336•••••47). */
export const masquerTel = (n: string) => (n.length > 5 ? `${n.slice(0, 3)}•••••${n.slice(-2)}` : n);

// Meta refuse les paramètres vides, les retours à la ligne / tabulations et
// plus de 4 espaces consécutifs.
function nettoyerParam(v: string): string {
  const s = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (s || "—").slice(0, 1000);
}

// ─── Envois ──────────────────────────────────────────────────────────────────

/**
 * Envoie un modèle approuvé. `params` = paramètres du corps, dans l'ordre {{1}}, {{2}}…
 * Renvoie l'id du message accepté par Meta (la DÉLIVRANCE n'est pas garantie :
 * certains refus, ex. 131026, n'arrivent qu'ensuite via webhook). Lève WhatsAppError.
 */
export async function sendWhatsAppTemplate(to: string, name: string, lang: string, params: string[]): Promise<{ id: string | null }> {
  const json = await graphPost({
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      ...(params.length
        ? { components: [{ type: "body", parameters: params.map(p => ({ type: "text", text: nettoyerParam(p) })) }] }
        : {}),
    },
  });
  return { id: json.messages?.[0]?.id ?? null };
}

/** Message texte libre (uniquement dans la fenêtre de 24 h après un message du destinataire). */
export async function sendWhatsAppText(to: string, body: string): Promise<{ id: string | null }> {
  const text = body.length > 4000 ? `${body.slice(0, 3990)}…` : body;
  const json = await graphPost({ to, type: "text", text: { preview_url: false, body: text } });
  return { id: json.messages?.[0]?.id ?? null };
}
