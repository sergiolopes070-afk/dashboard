/* eslint-disable jsx-a11y/alt-text */
// ─────────────────────────────────────────────────────────────────────────────
// Compte rendu d'intervention KinouClean — PDF des photos avant / après, par
// article, via @react-pdf/renderer (même charte que le devis : bleu #1a2942 /
// doré #c17f3e, polices standard PDF, pied SIRET / agrément SAP).
// Les photos sont fournies en Buffer (téléchargées côté serveur) : au plus
// MAX_PHOTOS et un budget d'octets total pour garder un PDF léger (< ~8 Mo).
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { PhotoIntervention } from "./constants";

const NAVY = "#1a2942";
const NAVY2 = "#16223a";
const GOLD = "#c17f3e";
const GOLD_SOFT = "#c8b48f";
const INK = "#46536b";
const MUTE = "#8b95a6";

export const MAX_PHOTOS = 12;
export const MAX_PHOTOS_BYTES = 7 * 1024 * 1024; // budget images (≈ taille du PDF)

export type PdfImage = { data: Buffer; format: "jpg" | "png" };
export type PdfArticle = { article: string; avant: PdfImage[]; apres: PdfImage[] };

export type PhotosPdfData = {
  client: string;        // « Prénom Nom »
  date: string;          // JJ/MM/AAAA
  heure: string;         // HH:MM (ou "")
  prestations: string[]; // libellés
  adresse: string;
  prestataire: string;   // prénom
  articles: PdfArticle[];
  omis: number;          // photos non incluses (limite / format / téléchargement)
};

// Format d'image d'après les octets (react-pdf ne lit que JPEG / PNG).
export function imageFormat(buf: Buffer): "jpg" | "png" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  return null;
}

// Choisit au plus `max` photos en répartissant équitablement entre articles et
// phases (1er avant, 1er après de chaque article, puis 2e tour…), ordre chrono.
export function selectPhotos(photos: PhotoIntervention[], max = MAX_PHOTOS): PhotoIntervention[] {
  const articles = Array.from(new Set(photos.map(p => p.article || "Article")));
  const files: PhotoIntervention[][] = [];
  for (const a of articles) for (const ph of ["avant", "apres"] as const) {
    files.push(photos.filter(p => (p.article || "Article") === a && p.phase === ph)
      .sort((x, y) => (x.at || "").localeCompare(y.at || "")));
  }
  const out: PhotoIntervention[] = [];
  for (let round = 0; out.length < max; round++) {
    let any = false;
    for (const f of files) {
      if (f[round]) { any = true; if (out.length < max) out.push(f[round]); }
    }
    if (!any) break;
  }
  return out;
}

// Télécharge les photos retenues (via `download`) et les regroupe par article,
// dans l'ordre d'origine. Respecte MAX_PHOTOS et le budget d'octets.
export async function buildArticles(
  photos: PhotoIntervention[],
  download: (p: PhotoIntervention) => Promise<Buffer | null>,
): Promise<{ articles: PdfArticle[]; omis: number; inclus: number }> {
  const sel = selectPhotos(photos);
  const bufs = await Promise.all(sel.map(p => download(p).catch(() => null)));
  const ok = new Map<PhotoIntervention, PdfImage>();
  let total = 0;
  sel.forEach((p, i) => {
    const b = bufs[i];
    const fmt = b ? imageFormat(b) : null;
    if (!b || !fmt) return;
    if (total + b.length > MAX_PHOTOS_BYTES) return;
    total += b.length;
    ok.set(p, { data: b, format: fmt });
  });
  const articles: PdfArticle[] = [];
  for (const a of Array.from(new Set(photos.map(p => p.article || "Article")))) {
    const of = (ph: "avant" | "apres") => photos
      .filter(p => (p.article || "Article") === a && p.phase === ph)
      .sort((x, y) => (x.at || "").localeCompare(y.at || ""))
      .map(p => ok.get(p)).filter((x): x is PdfImage => !!x);
    const avant = of("avant"), apres = of("apres");
    if (avant.length || apres.length) articles.push({ article: a, avant, apres });
  }
  return { articles, omis: photos.length - ok.size, inclus: ok.size };
}

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: NAVY, lineHeight: 1.4, paddingTop: 24, paddingBottom: 58 },

  band: { marginTop: -24, backgroundColor: NAVY, color: "#fff", paddingHorizontal: 30, paddingTop: 16, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "center" },
  badge: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.2, borderColor: GOLD, alignItems: "center", justifyContent: "center", marginRight: 11 },
  badgeTxt: { color: GOLD, fontFamily: "Times-Roman", fontSize: 14, lineHeight: 1, textAlign: "center" },
  brandName: { fontFamily: "Times-Roman", fontSize: 21, color: "#fff", lineHeight: 1 },
  brandTag: { color: GOLD_SOFT, letterSpacing: 2, fontSize: 6.5, marginTop: 4, textTransform: "uppercase" },
  docmeta: { alignItems: "flex-end" },
  kick: { color: GOLD_SOFT, letterSpacing: 2, fontSize: 6.5, textTransform: "uppercase" },
  docLabel: { fontFamily: "Times-Bold", fontSize: 19, color: GOLD, lineHeight: 1, marginTop: 4 },
  docSub: { fontFamily: "Times-Roman", fontSize: 12, color: "#d7deea", marginTop: 3 },

  tagbar: { backgroundColor: NAVY2, flexDirection: "row", paddingHorizontal: 30, paddingVertical: 6, gap: 20 },
  tagItem: { color: "#9fb0c9", fontSize: 6.5, letterSpacing: 0.5, textTransform: "uppercase" },

  content: { paddingHorizontal: 30, paddingTop: 14 },

  cardsRow: { flexDirection: "row", gap: 24, marginBottom: 12 },
  card: { flex: 1 },
  cardH: { fontSize: 7.5, letterSpacing: 1.5, color: GOLD, textTransform: "uppercase", borderBottomWidth: 1, borderBottomColor: "#e7d9c5", paddingBottom: 3, marginBottom: 5 },
  cardName: { fontFamily: "Times-Bold", fontSize: 13, marginBottom: 3 },
  cardP: { fontSize: 9, color: INK, lineHeight: 1.5 },
  label: { color: MUTE },

  intro: { fontSize: 9.5, color: INK, marginBottom: 10, lineHeight: 1.5 },

  artH: { flexDirection: "row", alignItems: "center", backgroundColor: NAVY, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5, marginTop: 6, marginBottom: 6 },
  artHTxt: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  artHKick: { color: GOLD_SOFT, fontSize: 6.5, letterSpacing: 1.5, textTransform: "uppercase", marginRight: 8 },

  cols: { flexDirection: "row", gap: 12, marginBottom: 8 },
  col: { flex: 1 },
  colH: { fontSize: 7.5, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, fontFamily: "Helvetica-Bold" },
  colAvant: { color: "#c2410c" },
  colApres: { color: "#047857" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  imgOne: { width: "100%", height: 200, objectFit: "cover", borderRadius: 4 },
  imgCell: { width: "48.5%", height: 118, objectFit: "cover", borderRadius: 4 },
  empty: { height: 60, borderWidth: 1, borderColor: "#e3e7ee", borderStyle: "dashed", borderRadius: 4, alignItems: "center", justifyContent: "center", color: MUTE, fontSize: 8 },

  more: { fontSize: 8.5, color: MUTE, marginTop: 4, fontStyle: "italic" },
  merci: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#e7d9c5", paddingTop: 10, textAlign: "center", fontFamily: "Times-Roman", fontSize: 13, color: NAVY },

  foot: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopWidth: 2, borderTopColor: GOLD, backgroundColor: NAVY, color: "#aab4c6", fontSize: 7.5, textAlign: "center", paddingHorizontal: 30, paddingVertical: 10, lineHeight: 1.5 },
  footStrong: { color: "#fff", fontFamily: "Helvetica-Bold" },
});

function Phase({ imgs, phase }: { imgs: PdfImage[]; phase: "avant" | "apres" }) {
  return (
    <View style={s.col}>
      <Text style={[s.colH, phase === "avant" ? s.colAvant : s.colApres]}>{phase === "avant" ? "Avant" : "Après"}</Text>
      {imgs.length === 0 ? (
        <View style={s.empty}><Text>Pas de photo</Text></View>
      ) : imgs.length === 1 ? (
        <Image style={s.imgOne} src={imgs[0]} />
      ) : (
        <View style={s.grid}>
          {imgs.map((im, i) => <Image key={i} style={s.imgCell} src={im} />)}
        </View>
      )}
    </View>
  );
}

function PhotosDoc({ d }: { d: PhotosPdfData }) {
  const quand = [d.date, d.heure ? `à ${d.heure.replace(":", "h")}` : ""].filter(Boolean).join(" ");
  return (
    <Document title={`Compte rendu d'intervention KinouClean — ${d.date}`} author="KinouClean SAS">
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <View style={s.brand}>
            <View style={s.badge}><Text style={s.badgeTxt}>KC</Text></View>
            <View>
              <Text style={s.brandName}>KinouClean</Text>
              <Text style={s.brandTag}>Nettoyage professionnel à domicile</Text>
            </View>
          </View>
          <View style={s.docmeta}>
            <Text style={s.kick}>Photos avant / après</Text>
            <Text style={s.docLabel}>COMPTE RENDU</Text>
            <Text style={s.docSub}>d&apos;intervention</Text>
          </View>
        </View>

        <View style={s.tagbar}>
          <Text style={s.tagItem}>Organisme agréé SAP — N° D3289580</Text>
          <Text style={s.tagItem}>Assurance RC Pro Coover x Hiscox</Text>
          <Text style={s.tagItem}>Île-de-France</Text>
        </View>

        <View style={s.content}>
          <View style={s.cardsRow}>
            <View style={s.card}>
              <Text style={s.cardH}>Client</Text>
              <Text style={s.cardName}>{d.client || "Client"}</Text>
              <Text style={s.cardP}>{d.adresse || "Adresse non renseignée"}</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardH}>Intervention</Text>
              <Text style={s.cardP}>
                <Text style={s.label}>Date : </Text>{quand || "—"}{"\n"}
                <Text style={s.label}>Prestation{d.prestations.length > 1 ? "s" : ""} : </Text>{d.prestations.join(" · ") || "—"}{"\n"}
                {d.prestataire ? <><Text style={s.label}>Réalisée par : </Text>{d.prestataire}</> : null}
              </Text>
            </View>
          </View>

          <Text style={s.intro}>Voici les photos prises par votre intervenant avant et après le nettoyage.</Text>

          {d.articles.map((a, i) => (
            // Section sécable (un article très photographié peut dépasser une page) ;
            // le bandeau « Article » ne reste jamais seul en bas de page.
            <View key={i}>
              <View style={s.artH} minPresenceAhead={160}>
                <Text style={s.artHKick}>Article</Text>
                <Text style={s.artHTxt}>{a.article}</Text>
              </View>
              <View style={s.cols}>
                <Phase imgs={a.avant} phase="avant" />
                <Phase imgs={a.apres} phase="apres" />
              </View>
            </View>
          ))}

          {d.omis > 0 ? (
            <Text style={s.more}>+{d.omis} photo{d.omis > 1 ? "s" : ""} non incluse{d.omis > 1 ? "s" : ""} dans ce document (disponible{d.omis > 1 ? "s" : ""} sur simple demande).</Text>
          ) : null}

          <Text style={s.merci} wrap={false}>Merci pour votre confiance — L&apos;équipe KinouClean</Text>
        </View>

        <View style={s.foot} fixed>
          <Text><Text style={s.footStrong}>KinouClean SAS</Text> — Île-de-France — SIRET 101 607 042 00013 — TVA FR93 101 607 042 — Organisme agréé SAP N° D3289580</Text>
          <Text>contact@kinouclean.fr · 06 20 79 97 47</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPhotosPdf(d: PhotosPdfData): Promise<Buffer> {
  return await renderToBuffer(<PhotosDoc d={d} />);
}
