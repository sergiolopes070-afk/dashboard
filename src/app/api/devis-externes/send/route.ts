import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { supabase } from "@/lib/supabase";
import { sendDevisExterneEmail } from "@/lib/mailer";
import { updateClientNotes } from "@/lib/sheets";
import { BUCKET, FOLDER, listDevis, saveDevis, parseKind, validId, type DevisKind, type DevisExterne } from "../_store";
import { isoParis } from "@/lib/dateParis";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // téléchargement de la pièce jointe + SMTP

// Envoi PAR EMAIL d'un devis externe (pièce jointe incluse) depuis la fiche.
//   GET  ?cible=client|prospect&id=<id>                 → { email } (destinataire affiché avant envoi)
//   POST { cible, id, devisId, message? }               → { devis, list, email, journal, dateRelance? }
// Après envoi : envoyeLe / envoyeA / envoisCount + date d'envoi = aujourd'hui (le
// bandeau « dernier email envoyé » de la fiche prospect lit `date`), ligne 📧 au
// journal (notes client / commentaires prospect). Prospect : relance → demain,
// NOUVEAU → CONTACTÉ (comme l'action « devis_envoye » du devis standard).

type Destinataire = { email: string; prenom: string; nom: string; genre: string };

async function destinataire(kind: DevisKind, id: string): Promise<Destinataire | null> {
  if (!supabase) return null;
  // clients : select * (la colonne genre n'existe pas forcément côté clients)
  const { data } = kind === "client"
    ? await supabase.from("clients").select("*").eq("id", id).limit(1)
    : await supabase.from("prospects").select("email, prenom, nom, genre").eq("id", id).limit(1);
  const r = data?.[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return { email: s(r.email), prenom: s(r.prenom), nom: s(r.nom), genre: s(r.genre) };
}

function lireCible(v: unknown, alt: unknown): DevisKind | null {
  return parseKind(v) ?? parseKind(alt);
}

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  const kind = lireCible(sp.get("cible"), sp.get("kind"));
  const id = sp.get("id");
  if (!kind || !validId(id)) return NextResponse.json({ error: "cible / id invalides" }, { status: 400 });
  const dest = await destinataire(kind, id);
  if (!dest) return NextResponse.json({ error: kind === "client" ? "Client introuvable" : "Prospect introuvable" }, { status: 404 });
  return NextResponse.json({ email: dest.email });
}

export async function POST(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  if (!supabase) return NextResponse.json({ error: "Supabase non configuré" }, { status: 503 });

  const body = await req.json().catch(() => ({})) as { cible?: string; kind?: string; id?: string; devisId?: string; message?: string };
  const kind = lireCible(body.cible, body.kind);
  const id = body.id;
  if (!kind || !validId(id) || !body.devisId) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 3000) : "";

  // 1. Le devis
  const list = await listDevis(kind, id);
  const cur = list.find(d => d.id === body.devisId);
  if (!cur) return NextResponse.json({ error: "Devis introuvable" }, { status: 404 });

  // 2. Le destinataire
  const dest = await destinataire(kind, id);
  if (!dest) return NextResponse.json({ error: kind === "client" ? "Client introuvable" : "Prospect introuvable" }, { status: 404 });
  if (!dest.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest.email)) {
    return NextResponse.json({ error: `Pas d'adresse email valide sur la fiche ${kind === "client" ? "client" : "prospect"} — ajoute-la avant d'envoyer le devis.` }, { status: 400 });
  }

  // 3. La pièce jointe (téléchargée côté serveur depuis le bucket)
  let attachment: { filename: string; content: Buffer; contentType: string } | undefined;
  if (cur.fichier) {
    if (!cur.fichier.path.startsWith(`${FOLDER}/`)) return NextResponse.json({ error: "Pièce jointe invalide" }, { status: 400 });
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(cur.fichier.path);
    if (error || !blob) return NextResponse.json({ error: `Pièce jointe introuvable dans le stockage : ${error?.message || "fichier absent"}` }, { status: 502 });
    const ext = (cur.fichier.path.split(".").pop() || "pdf").toLowerCase();
    const base = (cur.fichier.nom || "").replace(/[\\/:*?"<>|]+/g, "-").trim();
    attachment = {
      filename   : base && /\.[a-z0-9]{2,5}$/i.test(base) ? base : `Devis-KinouClean.${ext}`,
      content    : Buffer.from(await blob.arrayBuffer()),
      contentType: cur.fichier.type || blob.type || (ext === "pdf" ? "application/pdf" : "application/octet-stream"),
    };
  }

  // 4. Envoi
  try {
    await sendDevisExterneEmail(dest.email, {
      genre: dest.genre, prenom: dest.prenom, nom: dest.nom,
      intitule: cur.intitule, montantTTC: cur.montant, message, attachment,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[devis-externes/send] échec :", msg);
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Gmail non connecté") ? 503 : 502 });
  }

  // 5. Marquage du devis (date d'envoi = aujourd'hui, heure de Paris)
  const now = new Date().toISOString();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const updated: DevisExterne = {
    ...cur,
    date       : today,
    statut     : cur.statut || "envoye",
    envoyeLe   : now,
    envoyeA    : dest.email,
    envoisCount: (cur.envoisCount || 0) + 1,
  };
  // Relecture fraîche pour ne rien écraser pendant l'envoi SMTP.
  const fresh = await listDevis(kind, id);
  const next = (fresh.some(d => d.id === cur.id) ? fresh : list).map(d => (d.id === cur.id ? updated : d));
  const errSave = await saveDevis(kind, id, next);
  if (errSave) return NextResponse.json({ error: `Email envoyé à ${dest.email}, mais devis non mis à jour : ${errSave}` }, { status: 500 });

  // 6. Journal (best effort) — même stockage que les ajouts : notes client / commentaires prospect.
  const montant = cur.montant ? ` · ${cur.montant} € TTC` : "";
  const texte = `📧 Devis externe envoyé : ${cur.intitule || cur.fichier?.nom || "devis"}${montant} (à ${dest.email})`;
  const journal = { id: crypto.randomUUID(), date: now, texte, ...(kind === "client" ? { type: "📧" } : {}) };
  let journalOk = true;
  let dateRelance: string | undefined;
  try {
    if (kind === "client") {
      const { data } = await supabase.from("clients").select("notes").eq("id", id).limit(1);
      const notes = Array.isArray(data?.[0]?.notes) ? data![0].notes : [];
      await updateClientNotes(id, [journal, ...notes]); // notes client : plus récente en tête
    } else {
      const { data } = await supabase.from("prospects").select("commentaires").eq("id", id).limit(1);
      const com = Array.isArray(data?.[0]?.commentaires) ? data![0].commentaires : [];
      const { error } = await supabase.from("prospects").update({ commentaires: [...com, journal] }).eq("id", id);
      if (error) throw new Error(error.message);
    }
  } catch (e) { journalOk = false; console.error("[devis-externes/send] journal KO :", e); }

  // 7. Prospect : comme le devis standard → relance demain + sortie de « Nouveau ».
  if (kind === "prospect") {
    dateRelance = isoParis(1);
    await supabase.from("prospects").update({ date_relance: dateRelance, updated_at: now }).eq("id", id);
    await supabase.from("prospects").update({ statut: "CONTACTÉ", updated_at: now }).eq("id", id).eq("statut", "NOUVEAU");
  }

  return NextResponse.json({ devis: updated, list: next, email: dest.email, journal: journalOk ? journal : null, ...(dateRelance ? { dateRelance } : {}) });
}
