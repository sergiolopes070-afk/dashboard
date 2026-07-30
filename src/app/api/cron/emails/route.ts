import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSetting, getGmailTransporter, ACCROCHE, buildRelanceHtml } from "@/lib/mailer";
import { getSettingJSON } from "@/lib/settings";
import { importInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Cron quotidien des emails automatiques.
//
// MODES (sécurité anti-spam) :
//   • (aucun paramètre)  → SIMULATION : calcule et liste, n'envoie rien.
//                          C'est ce que fait le cron quotidien tant que
//                          ENVOI_AUTO_ACTIF = false.
//   • ?test=1            → TEST : envoie POUR DE VRAI, mais tous les emails sont
//                          redirigés vers TON adresse (AUTH_EMAIL). Aucun client
//                          n'est contacté. Sert à valider le rendu.
//   • ?send=1            → RÉEL : envoie vraiment aux clients (déclenchement manuel).
//
// ANTI-DOUBLON : la colonne prestations.relance_devis_niveau (0→3) mémorise la
// dernière relance envoyée. On n'envoie jamais deux fois le même niveau.
//
// Sécurité d'accès : secret CRON_SECRET (header Bearer envoyé par Vercel Cron,
// ou ?key=<secret> pour un test manuel).
// ─────────────────────────────────────────────────────────────────────────────

const AVIS_JOURS       = 2;         // demande d'avis à partir de J+2 (48h)
const AVIS_AGE_MAX     = 15;        // garde-fou : pas de demande d'avis sur une presta de plus de 15 j
const DONE_STATUTS     = ["CONFIRMÉ", "PAYÉ", "TERMINÉ"];

// Le cron quotidien reste en simulation tant que ce drapeau est false.
// On le passera à true une fois le rendu validé (étape 2 bis).
const ENVOI_AUTO_ACTIF = true;

// La demande d'avis N'EST PAS automatique : elle se décide manuellement à
// l'archivage (via /api/emails/send-avis), pour ne jamais solliciter un client
// mécontent. Le cron ne s'occupe donc que des relances devis.
const AVIS_AUTO_ACTIF = false;

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

// Cadence des relances À PARTIR du démarrage manuel (jours écoulés depuis le
// 1er envoi déclenché à la main) : niveau 1 = jour 0, niveau 2 = +2 j, niveau 3 = +4 j.
// Le cron ne DÉMARRE jamais une séquence : il ne fait que la poursuivre.
function niveauDepuisDemarrage(joursDepuisDemarrage: number): number {
  if (joursDepuisDemarrage >= 4) return 3;
  if (joursDepuisDemarrage >= 2) return 2;
  return 1;
}

// Heure UTC du cron planifié dans vercel.json ("0 8 * * *").
const CRON_HEURE_UTC = 8;

function getCronSecret(): string | undefined {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(process.env)) {
    if (/^cron_?secret$/i.test(k) && v) return v;
  }
  return undefined;
}

// Résultat d'autorisation. `simulationForcee` = requête reconnue comme un cron
// Vercel mais SANS secret valide : on laisse tourner en lecture seule (aucun
// email envoyé), car l'en-tête `x-vercel-cron` est falsifiable sur une URL
// publique. Seul le secret (Bearer ou ?key=) autorise un envoi réel.
function authorize(req: Request): { ok: boolean; reason?: string; simulationForcee?: boolean } {
  const secret = getCronSecret();
  const auth = req.headers.get("authorization");
  const key  = new URL(req.url).searchParams.get("key");
  // Secret valide (déclenchement manuel) → tous les droits, à toute heure.
  if (secret && (auth === `Bearer ${secret}` || key === secret)) return { ok: true };

  // Cron Vercel sans Bearer (variable d'env pas nommée exactement CRON_SECRET) :
  // on autorise l'envoi UNIQUEMENT dans la fenêtre horaire du cron planifié
  // (08:00 UTC, ±1h de tolérance pour les retards de planification). En dehors,
  // lecture seule → un déclenchement falsifié ne peut pas envoyer d'emails.
  if (req.headers.get("x-vercel-cron")) {
    const h = new Date().getUTCHours();
    const dansLaFenetre = h >= CRON_HEURE_UTC - 1 && h <= CRON_HEURE_UTC + 1;
    return { ok: true, simulationForcee: !dansLaFenetre };
  }
  return { ok: false, reason: "Non autorisé" };
}

// ─── Suivi anti-doublon (stocké dans la table `settings` déjà existante) ──────
// Aucun changement de structure de base n'est nécessaire : on garde l'état dans
// une seule ligne settings (clé `emails_auto_etat`, valeur = JSON).
//   { "<id prestation>": { relance: 0-3, relanceStart: ISO, avisEnvoye, avisAnnule } }
const ETAT_KEY = "emails_auto_etat";
type EtatPresta = { relance?: number; relanceStart?: string; avisEnvoye?: boolean; avisAnnule?: boolean };
type Etat = Record<string, EtatPresta>;

async function lireEtat(): Promise<Etat> {
  return getSettingJSON<Etat>(ETAT_KEY, {});
}

async function ecrireEtat(etat: Etat): Promise<string | null> {
  if (!supabase) return "Supabase non configuré";
  const { error } = await supabase.from("settings").upsert({ key: ETAT_KEY, value: JSON.stringify(etat) }, { onConflict: "key" });
  return error ? error.message : null;
}

// (Transporteur Gmail + templates de relance : voir src/lib/mailer.ts, partagés
//  avec la route de déclenchement manuel /api/emails/action.)

function buildAvisHtml(d: { prenom: string; typePresta: string; lien: string }): string {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#1C3557;padding:28px 32px;">
          <div style="color:#ffffff;font-size:20px;font-weight:bold;">KinouClean</div>
          <div style="color:rgba(255,255,255,0.6);font-size:11px;letter-spacing:2px;margin-top:4px;">NETTOYAGE PROFESSIONNEL À DOMICILE</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;color:#1F2937;margin:0 0 16px;">Bonjour ${d.prenom || ""},</p>
          <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0 0 20px;">
            Merci de votre confiance pour votre prestation${d.typePresta ? ` de ${d.typePresta.toLowerCase()}` : ""} ✨.
            Votre satisfaction est notre priorité — auriez-vous un instant pour partager votre avis ?
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
            <a href="${d.lien}" style="display:inline-block;background:#F97316;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:10px;">⭐ Laisser mon avis</a>
          </td></tr></table>
          <p style="font-size:13px;color:#9CA3AF;line-height:1.6;margin:0 0 20px;text-align:center;">Cela ne prend qu'une minute et nous aide énormément 🙏</p>
          <p style="font-size:15px;color:#4B5563;line-height:1.6;margin:0;">À très bientôt,<br/><strong>L'équipe KinouClean</strong></p>
        </td></tr>
        <tr><td style="background:#1C3557;padding:16px 32px;text-align:center;">
          <div style="color:rgba(255,255,255,0.6);font-size:11px;">KinouClean · Organisme agréé SAP n° D3289580</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const reqUrl   = new URL(req.url);
  const params   = reqUrl.searchParams;
  const baseUrl  = process.env.NEXT_PUBLIC_BASE_URL || reqUrl.origin;
  // Sans secret valide (en-tête cron falsifiable) → simulation stricte : on
  // calcule et on liste, mais AUCUN email ne part.
  const mode: "simulation" | "test" | "reel" =
    auth.simulationForcee ? "simulation"
    : params.get("dry") === "1" ? "simulation"   // inspection lecture seule (aucun envoi)
    : params.get("test") === "1" ? "test"
    : params.get("send") === "1" ? "reel"
    : ENVOI_AUTO_ACTIF ? "reel" : "simulation";

  const testEmail = process.env.AUTH_EMAIL || null;
  if (mode === "test" && !testEmail) {
    return NextResponse.json({ error: "AUTH_EMAIL introuvable : impossible d'envoyer le test" }, { status: 500 });
  }

  // Import auto des demandes de devis reçues par email (formulaire du site).
  // Fenêtre courte (7 j) + double garde-fou anti-doublon (Message-ID + email/tél).
  // Ne bloque jamais le traitement des relances en cas d'erreur IMAP.
  let inboxImport: unknown = null;
  if (mode !== "test" && mode !== "simulation") {
    try { const r = await importInbox({ days: 7 }); inboxImport = { crees: r.imported.length, ignores: r.skipped, erreurs: r.errors }; }
    catch (e) { inboxImport = { erreur: e instanceof Error ? e.message : "import inbox échoué" }; }
  }

  const { data, error } = await supabase
    .from("prestations")
    .select("id, prix, statut, created_at, date_intervention, type_prestation, client_id, clients(id, prenom, nom, email)")
    .eq("archive", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // État anti-doublon (aucune colonne à créer : stocké dans `settings`).
  const etat = await lireEtat();
  let etatModifie = false;

  // DIAG (simulation only) : pour chaque relance suivie, récupère l'état réel de
  // la prestation SANS filtre archive → explique pourquoi une séquence est gelée.
  let diagCles: unknown[] = [];
  if (mode === "simulation") {
    const ids = Object.keys(etat).filter(k => etat[k]?.relance);
    if (ids.length) {
      const { data: allp } = await supabase
        .from("prestations")
        .select("id, archive, date_intervention, statut, type_prestation, clients(prenom, nom)")
        .in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byId: Record<string, any> = {};
      for (const r of allp || []) byId[r.id as string] = r;
      diagCles = ids.map(id => {
        const r = byId[id];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = r ? (Array.isArray(r.clients) ? r.clients[0] : r.clients) || {} : {};
        return {
          id, niveau: etat[id]?.relance,
          existe: !!r,
          archive: r?.archive ?? null,
          aDate: !!(r?.date_intervention),
          statut: r?.statut ?? null,
          nom: r ? `${c.prenom || ""} ${c.nom || ""}`.trim() : "(prestation supprimée)",
          gelePar: !r ? "prestation supprimée"
            : r.archive ? "prestation archivée"
            : r.date_intervention ? "date posée (RDV) → relances stoppées"
            : ["CONFIRMÉ","PAYÉ","TERMINÉ","ANNULÉ"].includes(r.statut) ? `statut ${r.statut}`
            : null,
        };
      });
    }
  }

  // Préférence fiscale par client (avance immédiate / crédit d'impôt).
  const fiscalClients = await getSettingJSON<Record<string, string>>("fiscal_clients", {});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data || [];

  const envoyes:  unknown[] = [];
  const aEnvoyer: unknown[] = [];
  const aDemarrer: unknown[] = [];     // devis sans séquence démarrée (action manuelle attendue)
  const demandeAvis: unknown[] = [];   // avis à envoyer (mode simulation) / bloqués
  const avisEnvoyes: unknown[] = [];   // avis réellement envoyés (test/réel)
  const erreurs:  unknown[] = [];
  const diagRelances: unknown[] = [];  // diagnostic : toutes les relances démarrées + pourquoi elles avancent ou pas

  const gmail = mode === "simulation" ? null : await getGmailTransporter();
  if (mode !== "simulation" && !gmail) {
    return NextResponse.json({
      error: "Gmail non connecté : va dans Configuration → Connexion Gmail (adresse + mot de passe d'application).",
    }, { status: 503 });
  }

  for (const p of rows) {
    const client = Array.isArray(p.clients) ? (p.clients[0] || {}) : (p.clients || {});
    const nom    = `${client.prenom || ""} ${client.nom || ""}`.trim() || "(client sans nom)";
    const email  = client.email || null;
    const prix   = parseFloat(p.prix);

    const devisExiste = !isNaN(prix) && prix > 0;
    const aUneDate    = !!(p.date_intervention && String(p.date_intervention).trim());
    const clos        = DONE_STATUTS.includes(p.statut) || p.statut === "ANNULÉ";

    // Diagnostic : toute prestation dont une relance a démarré, avec les motifs
    // qui l'empêchent éventuellement d'avancer (date d'intervention, statut clos…).
    const niveauEtat = Number(etat[p.id]?.relance ?? 0);
    if (niveauEtat >= 1) {
      const jrs = daysSince(etat[p.id]?.relanceStart || p.created_at);
      diagRelances.push({
        nom, niveauActuel: niveauEtat,
        joursDepuisDemarrage: jrs,
        niveauCible: jrs == null ? niveauEtat : niveauDepuisDemarrage(jrs),
        statut: p.statut || "(vide)",
        aUneDate, devisExiste, clos, email: email || null,
        bloquePar: !devisExiste ? "prix/devis absent"
          : aUneDate ? "date d'intervention renseignée → relances stoppées"
          : clos ? `statut clos (${p.statut})`
          : !email ? "pas d'email"
          : null,
      });
    }

    // ── Relance devis (séquence DÉMARRÉE MANUELLEMENT uniquement) ──
    // Le cron ne démarre jamais une relance : il poursuit celles que l'utilisateur
    // a lancées via le bouton (niveau 1 envoyé à la main + date de démarrage).
    if (devisExiste && !aUneDate && !clos) {
      const actuel = Number(etat[p.id]?.relance ?? 0);
      const start  = etat[p.id]?.relanceStart || null;

      if (actuel < 1) {
        // Pas encore démarrée → on la signale seulement (action manuelle attendue).
        const age = daysSince(p.created_at);
        aDemarrer.push({ nom, email, prix, ageJours: age });
      } else if (actuel < 3) {
        // Séquence en cours : on avance d'UN cran à la fois (jamais de saut), pour
        // garantir que chaque étape (2 puis 3) parte réellement au client — même si
        // le cron a manqué un jour. Cadence depuis le démarrage manuel :
        //   niveau 2 dès J+2, niveau 3 dès J+4. (repli created_at pour l'historique)
        const joursDepuis = daysSince(start || p.created_at);
        const prochain = actuel + 1;                 // 2 puis 3
        const seuilJours = prochain === 2 ? 2 : 4;   // J requis pour ce prochain niveau
        const cible = (joursDepuis != null && joursDepuis >= seuilJours) ? prochain : actuel;
        if (cible > actuel) {
          const info = { nom, email, prix, niveau: cible, joursDepuisDemarrage: joursDepuis };
          if (!email) {
            aEnvoyer.push({ ...info, bloque: "pas d'email" });
          } else if (mode === "simulation") {
            aEnvoyer.push(info);
          } else {
            const dest = mode === "test" ? testEmail! : email;
            try {
              await gmail!.transporter.sendMail({
                from   : `"KinouClean" <${gmail!.user}>`,
                to     : dest,
                subject: (ACCROCHE[cible] ?? ACCROCHE[1]).objet + (mode === "test" ? ` [TEST — destiné à ${email}]` : ""),
                html   : buildRelanceHtml({ prenom: client.prenom || "", typePresta: p.type_prestation || "", prix: p.prix, niveau: cible, fiscal: fiscalClients[client.id || p.client_id] }),
              });
              if (mode === "reel") {
                etat[p.id] = { ...(etat[p.id] ?? {}), relance: cible };
                etatModifie = true;
              }
              envoyes.push({ ...info, envoyeA: dest });
            } catch (e: unknown) {
              erreurs.push({ ...info, erreur: e instanceof Error ? e.message : "Erreur envoi" });
            }
          }
        }
      }
    }

    // ── Demande d'avis : désactivée dans le cron (décidée à l'archivage) ──
    if (AVIS_AUTO_ACTIF && DONE_STATUTS.includes(p.statut)) {
      const age = daysSince(p.date_intervention);
      const dejaEnvoye = !!etat[p.id]?.avisEnvoye;
      const annule     = !!etat[p.id]?.avisAnnule;
      if (age != null && age >= AVIS_JOURS && age <= AVIS_AGE_MAX && !dejaEnvoye && !annule) {
        const clientId = client.id || p.client_id;
        const info = { nom, email, prestation: p.type_prestation || "—", dateIntervention: p.date_intervention };

        if (!email || !clientId) {
          demandeAvis.push({ ...info, bloque: !email ? "pas d'email" : "client sans id" });
        } else if (mode === "simulation") {
          demandeAvis.push(info);
        } else {
          const dest = mode === "test" ? testEmail! : email;
          const lienParams = new URLSearchParams({ nom });
          if (p.type_prestation) lienParams.set("prestation", p.type_prestation);
          const lien = `${baseUrl}/avis/${clientId}?${lienParams.toString()}`;
          try {
            await gmail!.transporter.sendMail({
              from   : `"KinouClean" <${gmail!.user}>`,
              to     : dest,
              subject: "Votre avis compte pour nous ⭐" + (mode === "test" ? ` [TEST — destiné à ${email}]` : ""),
              html   : buildAvisHtml({ prenom: client.prenom || "", typePresta: p.type_prestation || "", lien }),
            });
            if (mode === "reel") {
              etat[p.id] = { ...(etat[p.id] ?? {}), avisEnvoye: true };
              etatModifie = true;
            }
            avisEnvoyes.push({ ...info, envoyeA: dest });
          } catch (e: unknown) {
            erreurs.push({ ...info, type: "avis", erreur: e instanceof Error ? e.message : "Erreur envoi" });
          }
        }
      }
    }
  }

  // Persiste l'état anti-doublon (une seule écriture, en fin de traitement).
  if (etatModifie) {
    const errEtat = await ecrireEtat(etat);
    if (errEtat) erreurs.push({ erreur: `Sauvegarde du suivi anti-doublon impossible : ${errEtat}` });
  }

  const report = {
    mode:
      mode === "simulation" ? "🧪 SIMULATION — aucun email envoyé"
      : mode === "test"     ? `✉️ TEST — tout est envoyé à ${testEmail} (aucun client contacté, rien n'est marqué comme envoyé)`
      :                       "🚀 RÉEL — emails envoyés aux clients",
    executeLe: new Date().toISOString(),
    reglages: { cadenceRelanceJours: [0, 2, 4], avisJours: AVIS_JOURS, avisAgeMax: AVIS_AGE_MAX, envoiAutoQuotidien: ENVOI_AUTO_ACTIF, note: "Les relances ne partent QUE si la séquence a été démarrée manuellement." },
    resume:
      mode === "simulation"
        ? `${aEnvoyer.length} relance(s) de suite partiraient. ${aDemarrer.length} devis en attente de démarrage manuel.`
        : `${envoyes.length} relance(s) enchaînée(s) + ${avisEnvoyes.length} avis, ${erreurs.length} erreur(s). ${aDemarrer.length} devis à démarrer manuellement.`,
    relancesEnvoyees: envoyes,
    relancesAEnvoyer: aEnvoyer,
    avisEnvoyes,
    demandeAvis,
    erreurs,
    aDemarrer,
    diagRelances,
    diagCles,
    // Carte EXACTE que renvoie /api/emails/action (source du badge « Relance x/3 »).
    niveauxBadge: Object.fromEntries(
      Object.entries(etat).filter(([, e]) => e.relance).map(([k, e]) => [k, e.relance])
    ),
    inboxImport,
  };

  console.log("[CRON emails]", mode, "|", report.resume);
  return NextResponse.json(report);
}
