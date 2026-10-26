// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp SEMI-AUTOMATIQUE des prospects — partie serveur (emails au patron).
// Même liste que la pop-up « WhatsApp à envoyer » du tableau de bord : on réutilise
// EXACTEMENT waAEnvoyer / waMessage / waLien (src/lib/waMessages.ts) — prospects
// actifs, pas déjà clients, avec un mobile, dont l'email de l'étape est parti
// aujourd'hui et sans WhatsApp noté pour cette étape aujourd'hui.
//
// Utilisé par :
//   • le résumé du matin (finaliserRelancesAuto, après les relances auto) ;
//   • l'email de 18h (/api/cron/rappels) : WhatsApp pas encore envoyés du jour.
// Les emails n'affichent que le NOMBRE + un bouton vers le tableau de bord ; la
// liste complète reste dans les sorties JSON (test / simulation).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "./supabase";
import { getSettingRaw } from "./settings";
import { indexClients } from "./prospectRelance";
import { waAEnvoyer, waMessage, waLien, waLibelle, waDonneesProspect, WaEtape, WaSuivi } from "./waMessages";
import { jourParis } from "./prospectRelanceCadence";

export interface WaLigneJour {
  id: string;
  nom: string;
  etape: WaEtape;
  libelle: string;     // « Relance devis R2 »
  prestation: string;
  message: string;     // texte prêt à envoyer
  lien: string;        // https://wa.me/33…?text=…
}

// Prospects avec un WhatsApp en attente AUJOURD'HUI (Paris). Lève une erreur si
// la lecture échoue (l'appelant décide : section omise + erreur signalée).
export async function listeWhatsAppDuJour(today: string = jourParis()): Promise<WaLigneJour[]> {
  if (!supabase) throw new Error("Supabase non configuré");
  const [{ data, error }, rawSuivi, dejaClientDe] = await Promise.all([
    supabase.from("prospects").select("id, prenom, nom, genre, email, tel, statut, type_presta, besoins, budget")
      .order("created_at", { ascending: false }),
    getSettingRaw("prospects_suivi"),
    indexClients(),
  ]);
  if (error) throw new Error(`Lecture prospects : ${error.message}`);
  let suiviAll: Record<string, WaSuivi & { devisNum?: string; devisDate?: string; remise?: unknown }> = {}; // remise → R3 WhatsApp (waDonneesProspect)
  try { suiviAll = rawSuivi ? JSON.parse(rawSuivi) : {}; } catch { throw new Error("Lecture du suivi prospects impossible"); }

  const out: WaLigneJour[] = [];
  for (const row of data || []) {
    const id = row.id as string;
    const suivi = suiviAll[id] || {};
    const p = {
      statut: (row.statut as string) || "", tel: (row.tel as string) || "", dejaClient: dejaClientDe(row), suivi,
      genre: (row.genre as string) || "", prenom: (row.prenom as string) || "", nom: (row.nom as string) || "",
      typePresta: (row.type_presta as string) || "", budget: (row.budget as string) || "",
      besoins: Array.isArray(row.besoins) ? row.besoins : [],
    };
    const etape = waAEnvoyer(p, today);
    if (!etape) continue;
    const donnees = waDonneesProspect(p);
    const message = waMessage(etape, donnees);
    const lien = waLien(p.tel, message);
    if (!lien) continue; // garde-fou (waAEnvoyer exige déjà un mobile)
    out.push({
      id, nom: `${p.prenom} ${p.nom}`.trim() || "(sans nom)", etape, libelle: waLibelle(etape),
      prestation: donnees.prestation || "", message, lien,
    });
  }
  return out;
}

// ─── Rendu email (Gmail mobile : styles en ligne, mise en page en tableaux) ──
// L'email ne contient QUE le nombre de WhatsApp (et la répartition par type) +
// un bouton vers le tableau de bord (?whatsapp=1 ouvre la pop-up « enchaîner »).
// Aucun nom, message ni lien wa.me : tout se fait depuis le tableau de bord.
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const waUrl = (baseUrl: string | undefined) => `${(baseUrl || "").replace(/\/+$/, "")}/?whatsapp=1`;

// Titre par défaut : « 💬 3 messages WhatsApp à envoyer aujourd'hui ».
export const waTitreResume = (n: number, suffixe = "à envoyer aujourd'hui") =>
  `💬 ${n} message${n > 1 ? "s" : ""} WhatsApp ${suffixe}`;

// « Relances devis : 3 · Demandes d'infos : 2 » (aucune donnée personnelle).
export function waRepartition(lignes: WaLigneJour[]): string {
  const devis = lignes.filter(l => l.etape.startsWith("devis")).length;
  const infos = lignes.length - devis;
  return [devis ? `Relances devis : ${devis}` : "", infos ? `Demandes d'infos : ${infos}` : ""].filter(Boolean).join(" · ");
}

// Section HTML (une ligne <tr> à insérer dans un tableau de 100 %).
export function waSectionHtml(lignes: WaLigneJour[], titre: string, baseUrl?: string): string {
  if (!lignes.length) return "";
  const rep = waRepartition(lignes);
  return `
      <tr><td style="padding:10px 16px 18px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#1C3557;margin:8px 0 4px;">${esc(titre)}</div>
        ${rep ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;margin-bottom:12px;">${esc(rep)}</div>` : ""}
        ${baseUrl ? `<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td bgcolor="#25D366" align="center" style="border-radius:10px;">
            <a href="${esc(waUrl(baseUrl))}" target="_blank" style="display:block;padding:14px 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">Ouvrir sur le tableau de bord</a>
          </td>
        </tr></table>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;margin-top:8px;">Sur le tableau de bord, un bouton enchaîne les envois un par un.</div>` : ""}
      </td></tr>`;
}

// Version texte brut.
export function waSectionTexte(lignes: WaLigneJour[], titre: string, baseUrl?: string): string {
  if (!lignes.length) return "";
  const rep = waRepartition(lignes);
  return `\n${titre}\n${rep ? rep + "\n" : ""}${baseUrl ? `Ouvrir sur le tableau de bord : ${waUrl(baseUrl)}\n` : ""}`;
}

// Vue JSON (sortie des crons en test/simulation) : sans le texte complet.
export const waVueJson = (l: WaLigneJour) => ({ id: l.id, nom: l.nom, etape: l.etape, libelle: l.libelle, prestation: l.prestation, lien: l.lien });
