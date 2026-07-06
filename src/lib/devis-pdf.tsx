import React from "react";
import {
  Document, Page, Text, View, StyleSheet,
  Svg, Circle, Line, Path, Rect, Text as SvgText,
} from "@react-pdf/renderer";

// ─── Palette ──────────────────────────────────────────────────────────────────
const BRAND      = "#1C3557";
const ACCENT     = "#F97316";
const GRAY1      = "#1F2937";
const GRAY2      = "#6B7280";
const GRAY3      = "#9CA3AF";
const BORDER     = "#E5E7EB";
const LIGHT      = "#F9FAFB";
const WHITE      = "#FFFFFF";
const BLUE_LIGHT = "#EFF6FF";
const BLUE_DARK  = "#1E40AF";
const ORANGE_LIGHT = "#FFF7ED";

// ─── Infos société ────────────────────────────────────────────────────────────
const SIRET   = "101 607 042 00013";
const SAP_NUM = "D3289580";
const EMAIL   = "texticar@gmail.com";
const REGION  = "Île-de-France";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LigneSupp {
  label:    string;
  quantite: number;
  prixHT:   number;
}

export interface DevisData {
  refNumber    : string;
  date         : string;
  validite     : string;
  clientNom    : string;
  clientPrenom : string;
  clientEmail  : string;
  clientTel    : string;
  clientAdresse: string;
  typePresta   : string;
  quantite     : string;
  adresse      : string;
  etat?        : string;
  dateInter    : string;
  heureInter   : string;
  prix         : string;   // prix HT total de la prestation principale
  message      : string;
  avanceImmediate?: boolean;
  creditImpot?    : boolean;
  lignesSupp?     : LigneSupp[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toFixed(2).replace(".", ",") + " €";
}

function computeTotaux(d: DevisData) {
  const qty    = parseInt(d.quantite) || 1;
  const mainHT = parseFloat(d.prix) || 0;
  const mainPU = qty > 1 ? mainHT / qty : mainHT;
  const suppHT = (d.lignesSupp ?? []).reduce((s, l) => s + l.prixHT * l.quantite, 0);
  const htTotal  = mainHT + suppHT;
  const tva      = htTotal * 0.2;
  const ttcTotal = htTotal + tva;
  return { qty, mainHT, mainPU, suppHT, htTotal, tva, ttcTotal };
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: GRAY1, backgroundColor: WHITE, paddingBottom: 52 },

  // Header
  header: { backgroundColor: BRAND, paddingHorizontal: 40, paddingTop: 22, paddingBottom: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  devisTitle: { fontSize: 32, fontFamily: "Helvetica-Bold", color: WHITE, letterSpacing: 6 },
  devisMeta:  { fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 2 },
  devisNum:   { fontSize: 9, color: ACCENT, fontFamily: "Helvetica-Bold", marginTop: 4 },
  accentBar:  { width: 40, height: 3, backgroundColor: ACCENT, borderRadius: 2, marginTop: 6, marginLeft: "auto" as const },

  // Orange banner
  banner:     { backgroundColor: ACCENT, flexDirection: "row", paddingHorizontal: 40, paddingVertical: 9 },
  bannerItem: { flex: 1, paddingHorizontal: 0 },
  bannerItemMid: { flex: 1, paddingHorizontal: 16, borderLeftWidth: 1, borderRightWidth: 1, borderLeftColor: "rgba(255,255,255,0.3)", borderRightColor: "rgba(255,255,255,0.3)", marginHorizontal: 0 },
  bannerText: { fontSize: 6.5, color: WHITE, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },

  // Body
  body: { paddingHorizontal: 40, paddingTop: 20 },

  // Parties
  parties:    { flexDirection: "row", marginBottom: 22 },
  partyLeft:  { flex: 1, paddingRight: 20, borderRightWidth: 1, borderRightColor: BORDER },
  partyRight: { flex: 1, paddingLeft: 20 },
  partyLabel: { fontSize: 7, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 5 },
  partyName:  { fontSize: 12, fontFamily: "Helvetica-Bold", color: GRAY1, marginBottom: 4 },
  partyLine:  { fontSize: 8.5, color: GRAY2, lineHeight: 1.5 },

  // Info box (4 cols)
  infoBox:      { backgroundColor: BRAND, borderRadius: 6, flexDirection: "row", marginBottom: 20 },
  infoItem:     { flex: 1, paddingVertical: 11, paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.12)" },
  infoItemLast: { flex: 1, paddingVertical: 11, paddingHorizontal: 12 },
  infoKey:      { fontSize: 6.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" as const, letterSpacing: 0.6, marginBottom: 3 },
  infoVal:      { fontSize: 9, fontFamily: "Helvetica-Bold", color: WHITE },
  infoValGreen: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#86EFAC" },

  // Section title
  sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionBar:  { width: 3, height: 14, backgroundColor: ACCENT, borderRadius: 2, marginRight: 7 },
  sectionText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BRAND, textTransform: "uppercase" as const, letterSpacing: 0.8, flex: 1 },
  sectionLine: { flex: 1, height: 1, backgroundColor: BORDER, marginLeft: 10, marginTop: 1 },

  // Table
  tableHead: { flexDirection: "row", backgroundColor: BRAND, borderRadius: 5, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 1 },
  thText:    { color: WHITE, fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  tableRow:  { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRowAlt: { backgroundColor: LIGHT },
  cDesc:  { flex: 5 },
  cQty:   { flex: 1, textAlign: "center" as const },
  cPU:    { flex: 2, textAlign: "right" as const },
  cTotal: { flex: 2, textAlign: "right" as const },
  tdMain: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRAY1 },
  tdSub:  { fontSize: 8, color: GRAY2, lineHeight: 1.4 },
  tdNum:  { fontSize: 9, color: GRAY1, lineHeight: 1.5 },

  // État tag
  etatTag: { backgroundColor: ORANGE_LIGHT, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1.5, marginLeft: 6 },
  etatText: { fontSize: 6.5, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase" as const, letterSpacing: 0.5 },

  // Totaux
  totauxWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12, marginBottom: 16 },
  totauxBox:  { width: 220 },
  totRow:  { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  totLabel: { fontSize: 8, color: GRAY2 },
  totVal:   { fontSize: 8, color: GRAY1, fontFamily: "Helvetica-Bold" },
  totTTCRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: BRAND, borderRadius: 5, paddingVertical: 10, paddingHorizontal: 10, marginTop: 5 },
  totTTCLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: WHITE },
  totTTCVal:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: WHITE },

  // Avance intro box
  avanceIntroBox:  { backgroundColor: BLUE_LIGHT, borderRadius: 6, padding: 12, borderLeftWidth: 3, borderLeftColor: "#3B82F6", marginTop: 4 },
  avanceIntroTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: BLUE_DARK, textTransform: "uppercase" as const, letterSpacing: 0.7, marginBottom: 4 },
  avanceIntroText:  { fontSize: 8, color: BLUE_DARK, lineHeight: 1.5 },

  // Page 2 — Avance Immédiate full
  p2Box:      { backgroundColor: BLUE_LIGHT, borderRadius: 6, padding: 14, marginBottom: 12 },
  p2Title:    { fontSize: 8, fontFamily: "Helvetica-Bold", color: BLUE_DARK, marginBottom: 6 },
  p2Text:     { fontSize: 8, color: GRAY2, lineHeight: 1.5, marginBottom: 3 },
  p2Subtitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: GRAY1, marginBottom: 2, marginTop: 5 },
  p2AmountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: BLUE_DARK, borderRadius: 5, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8 },
  p2AmountLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: WHITE },
  p2AmountVal:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: WHITE },
  p2AmtLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  p2AmtKey:  { fontSize: 8, color: GRAY2 },
  p2AmtVal:  { fontSize: 8, fontFamily: "Helvetica-Bold", color: GRAY1 },

  // Page 2 — Crédit d'impôt
  creditBox:    { borderWidth: 1, borderColor: ACCENT, borderRadius: 6, padding: 14, marginBottom: 12 },
  creditTitle:  { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: ACCENT, textTransform: "uppercase" as const, letterSpacing: 0.7, marginBottom: 10 },
  creditGrid:   { flexDirection: "row", gap: 20 },
  creditCol:    { flex: 1 },
  creditLabel:  { fontSize: 8, fontFamily: "Helvetica-Bold", color: GRAY1, marginBottom: 2 },
  creditText:   { fontSize: 7.5, color: GRAY2, lineHeight: 1.5, marginBottom: 6 },
  creditAmtRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: ACCENT, borderRadius: 5, paddingVertical: 7, paddingHorizontal: 10, marginTop: 6 },
  creditAmtLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: WHITE },
  creditAmtVal:   { fontSize: 10, fontFamily: "Helvetica-Bold", color: WHITE },

  // Conditions 3 cols
  condGrid: { flexDirection: "row", gap: 12, marginBottom: 14 },
  condCol:  { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: 10 },
  condTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: BRAND, textTransform: "uppercase" as const, letterSpacing: 0.7, marginBottom: 7, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: BORDER },
  condKey:   { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: GRAY1, marginBottom: 1.5, marginTop: 4 },
  condVal:   { fontSize: 7.5, color: GRAY2, lineHeight: 1.4 },

  // Signature
  signRow: { flexDirection: "row", gap: 14, marginBottom: 0 },
  signBox: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 12, minHeight: 80 },
  signLabel: { fontSize: 7, color: GRAY3, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 3 },
  signName:  { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRAY1, marginBottom: 16 },
  signLine:  { borderTopWidth: 1, borderTopColor: BORDER },
  signSub:   { fontSize: 7, color: GRAY3, marginTop: 4, textAlign: "center" as const },

  // Footer
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: BRAND, paddingVertical: 9, paddingHorizontal: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerLeft:  { fontSize: 7.5, color: "rgba(255,255,255,0.6)" },
  footerBrand: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: WHITE },
  footerRight: { fontSize: 7.5, color: "rgba(255,255,255,0.6)" },
});

// ─── Logo SVG ─────────────────────────────────────────────────────────────────
function KinoucleanLogo() {
  const c = "#ffffff";
  const sw = 2.2;
  return (
    <View>
      <Svg width={130} height={30} viewBox="0 0 390 80">
        <Rect x="2" y="42" width="38" height="22" rx="4" stroke={c} strokeWidth={sw} fill="none" />
        <Rect x="0" y="36" width="8" height="12" rx="3" stroke={c} strokeWidth={sw} fill="none" />
        <Rect x="32" y="36" width="8" height="12" rx="3" stroke={c} strokeWidth={sw} fill="none" />
        <Line x1="8" y1="64" x2="8" y2="70" stroke={c} strokeWidth={sw} />
        <Line x1="32" y1="64" x2="32" y2="70" stroke={c} strokeWidth={sw} />
        <Circle cx="52" cy="14" r="9" stroke={c} strokeWidth={sw} fill="none" />
        <Line x1="52" y1="23" x2="49" y2="46" stroke={c} strokeWidth={sw} />
        <Line x1="50" y1="33" x2="30" y2="42" stroke={c} strokeWidth={sw} />
        <Rect x="20" y="39" width="14" height="7" rx="3" stroke={c} strokeWidth={1.8} fill="none" transform="rotate(15 27 42)" />
        <Line x1="50" y1="33" x2="64" y2="40" stroke={c} strokeWidth={sw} />
        <Line x1="49" y1="46" x2="40" y2="60" stroke={c} strokeWidth={sw} />
        <Line x1="40" y1="60" x2="33" y2="66" stroke={c} strokeWidth={sw} />
        <Line x1="33" y1="66" x2="46" y2="68" stroke={c} strokeWidth={sw} />
        <Line x1="49" y1="46" x2="58" y2="58" stroke={c} strokeWidth={sw} />
        <Line x1="58" y1="58" x2="66" y2="56" stroke={c} strokeWidth={sw} />
        <Path d="M68 10 L69.5 6 L71 10 L75 11.5 L71 13 L69.5 17 L68 13 L64 11.5 Z" fill={ACCENT} />
        <Path d="M14 28 L15.5 24 L17 28 L21 29.5 L17 31 L15.5 35 L14 31 L10 29.5 Z" fill={ACCENT} />
        <SvgText x="85" y="56" style={{ fontSize: 46, fontFamily: "Helvetica-Bold", fill: c } as object}>
          KinouClean
        </SvgText>
      </Svg>
      <Text style={{ fontSize: 7, color: "rgba(255,255,255,0.55)", letterSpacing: 2.5, marginTop: 2 }}>
        NETTOYAGE PROFESSIONNEL À DOMICILE
      </Text>
    </View>
  );
}

// ─── Footer fixe ──────────────────────────────────────────────────────────────
function Footer({ refNumber }: { refNumber: string }) {
  return (
    <View style={s.footer} fixed>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <Text style={s.footerBrand}>KinouClean SAS</Text>
        <Text style={s.footerLeft}>· {EMAIL} · SAP N° {SAP_NUM}</Text>
      </View>
      <Text style={s.footerLeft}>N° {refNumber}</Text>
      <Text style={s.footerRight}>SIRET {SIRET}</Text>
    </View>
  );
}

// ─── Document principal ───────────────────────────────────────────────────────
export function DevisPDF({ d }: { d: DevisData }) {
  const { qty, mainHT, mainPU, htTotal, tva, ttcTotal } = computeTotaux(d);
  const hasPage2 = d.avanceImmediate || d.creditImpot;

  return (
    <Document>
      {/* ══════════════════════════════════════════════════════════ PAGE 1 */}
      <Page size="A4" style={s.page}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={s.header}>
          <KinoucleanLogo />
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.devisTitle}>DEVIS</Text>
            <View style={s.accentBar} />
            <Text style={s.devisNum}>N° {d.refNumber}</Text>
            <Text style={s.devisMeta}>Émis le {d.date}  ·  Valable jusqu&apos;au {d.validite}</Text>
          </View>
        </View>

        {/* ── Bandeau orange mentions ───────────────────────────────────── */}
        <View style={s.banner}>
          <View style={s.bannerItem}>
            <Text style={s.bannerText}>✓ ORGANISME AGRÉÉ SAP — N° {SAP_NUM}</Text>
          </View>
          <View style={s.bannerItemMid}>
            <Text style={s.bannerText}>CRÉDIT D&apos;IMPÔT 50% — ART. 199 SEXDECIES CGI</Text>
          </View>
          <View style={[s.bannerItem, { paddingLeft: 16 }]}>
            <Text style={s.bannerText}>AVANCE IMMÉDIATE ÉLIGIBLE — ART. L. 7231-1 C. TRAVAIL</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* ── Prestataire / Client ──────────────────────────────────── */}
          <View style={s.parties}>
            <View style={s.partyLeft}>
              <Text style={s.partyLabel}>Prestataire</Text>
              <Text style={s.partyName}>KinouClean SAS</Text>
              <Text style={s.partyLine}>Nettoyage professionnel à domicile</Text>
              <Text style={s.partyLine}>{EMAIL}</Text>
              <Text style={s.partyLine}>{REGION}</Text>
              <Text style={s.partyLine}>SIRET : {SIRET}</Text>
              <Text style={s.partyLine}>N° SAP : {SAP_NUM}</Text>
            </View>
            <View style={s.partyRight}>
              <Text style={s.partyLabel}>Client</Text>
              <Text style={s.partyName}>{d.clientPrenom} {d.clientNom}</Text>
              {d.clientTel     ? <Text style={s.partyLine}>{d.clientTel}</Text>     : null}
              {d.clientEmail   ? <Text style={s.partyLine}>{d.clientEmail}</Text>   : null}
              {d.clientAdresse ? <Text style={s.partyLine}>{d.clientAdresse}</Text> : <Text style={s.partyLine}>Adresse à compléter</Text>}
            </View>
          </View>

          {/* ── Info box 4 colonnes ───────────────────────────────────── */}
          <View style={s.infoBox}>
            <View style={s.infoItem}>
              <Text style={s.infoKey}>Prestation</Text>
              <Text style={s.infoVal}>{d.typePresta}</Text>
            </View>
            <View style={s.infoItem}>
              <Text style={s.infoKey}>Adresse</Text>
              <Text style={s.infoVal}>{d.adresse || "À compléter"}</Text>
            </View>
            <View style={s.infoItem}>
              <Text style={s.infoKey}>État</Text>
              <Text style={s.infoVal}>{d.etat || "—"}</Text>
            </View>
            <View style={s.infoItemLast}>
              <Text style={s.infoKey}>Avance Immédiate</Text>
              <Text style={d.avanceImmediate ? s.infoValGreen : s.infoVal}>
                {d.avanceImmediate ? "✓ Éligible" : "Non demandée"}
              </Text>
            </View>
          </View>

          {/* ── Note client ──────────────────────────────────────────── */}
          {d.message ? (
            <View style={{ backgroundColor: ORANGE_LIGHT, borderLeftWidth: 3, borderLeftColor: ACCENT, borderRadius: 4, padding: 10, marginBottom: 14 }}>
              <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: ACCENT, textTransform: "uppercase" as const, letterSpacing: 0.7, marginBottom: 3 }}>Note / Demande spécifique</Text>
              <Text style={{ fontSize: 8.5, color: GRAY1, lineHeight: 1.5 }}>{d.message}</Text>
            </View>
          ) : null}

          {/* ── Tableau de la prestation ─────────────────────────────── */}
          <View style={s.sectionHead}>
            <View style={s.sectionBar} />
            <Text style={s.sectionText}>Détail de la prestation</Text>
            <View style={s.sectionLine} />
          </View>

          {/* En-tête tableau */}
          <View style={s.tableHead}>
            <Text style={[s.thText, s.cDesc]}>Description</Text>
            <Text style={[s.thText, s.cQty]}>Qté</Text>
            <Text style={[s.thText, s.cPU]}>Prix unit. HT</Text>
            <Text style={[s.thText, s.cTotal]}>Total HT</Text>
          </View>

          {/* Ligne prestation principale */}
          <View style={s.tableRow}>
            <View style={s.cDesc}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={s.tdMain}>{d.typePresta}</Text>
                {d.etat ? (
                  <View style={s.etatTag}>
                    <Text style={s.etatText}>{d.etat}</Text>
                  </View>
                ) : null}
              </View>
              {d.dateInter ? (
                <Text style={[s.tdSub, { marginTop: 2 }]}>
                  Intervention : {d.dateInter}{d.heureInter ? ` à ${d.heureInter}` : ""}
                </Text>
              ) : null}
            </View>
            <Text style={[s.tdNum, s.cQty]}>{qty}</Text>
            <Text style={[s.tdNum, s.cPU]}>{fmt(mainPU)}</Text>
            <Text style={[s.tdNum, s.cTotal]}>{fmt(mainHT)}</Text>
          </View>

          {/* Lignes supplémentaires */}
          {(d.lignesSupp ?? []).map((l, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 0 ? s.tableRowAlt : {}]}>
              <View style={s.cDesc}>
                <Text style={s.tdMain}>{l.label}</Text>
              </View>
              <Text style={[s.tdNum, s.cQty]}>{l.quantite}</Text>
              <Text style={[s.tdNum, s.cPU]}>{fmt(l.prixHT)}</Text>
              <Text style={[s.tdNum, s.cTotal]}>{fmt(l.prixHT * l.quantite)}</Text>
            </View>
          ))}

          {/* ── Totaux ─────────────────────────────────────────────────── */}
          <View style={s.totauxWrap}>
            <View style={s.totauxBox}>
              <View style={s.totRow}>
                <Text style={s.totLabel}>Sous-total HT</Text>
                <Text style={s.totVal}>{fmt(htTotal)}</Text>
              </View>
              <View style={s.totRow}>
                <Text style={s.totLabel}>TVA (20%)</Text>
                <Text style={s.totVal}>{fmt(tva)}</Text>
              </View>
              <View style={s.totTTCRow}>
                <Text style={s.totTTCLabel}>TOTAL TTC À PAYER</Text>
                <Text style={s.totTTCVal}>{fmt(ttcTotal)}</Text>
              </View>
            </View>
          </View>

          {/* ── Avance Immédiate intro (si sélectionné) ──────────────── */}
          {d.avanceImmediate && (
            <View style={s.avanceIntroBox}>
              <Text style={s.avanceIntroTitle}>Avance Immédiate — Dispositif URSSAF</Text>
              <Text style={s.avanceIntroText}>
                Dispositif officiel permettant de déduire directement le crédit d&apos;impôt SAP au moment du paiement — sans attendre la déclaration de revenus annuelle (art. L.7233-1 du Code du travail).
              </Text>
              <Text style={[s.avanceIntroText, { marginTop: 4, fontFamily: "Helvetica-Bold" }]}>
                Vous ne payez que {fmt(ttcTotal * 0.5)} — suite et calcul détaillé page 2.
              </Text>
            </View>
          )}

        </View>

        <Footer refNumber={d.refNumber} />
      </Page>

      {/* ══════════════════════════════════════════════════════════ PAGE 2 */}
      <Page size="A4" style={s.page}>
        <View style={s.body}>

          {/* ── Avance Immédiate détail ───────────────────────────────── */}
          {d.avanceImmediate && (
            <View style={s.p2Box}>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: BLUE_DARK, textTransform: "uppercase" as const, letterSpacing: 0.7, marginBottom: 10 }}>
                Avance Immédiate — Dispositif URSSAF
              </Text>
              <View style={{ flexDirection: "row", gap: 20 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.p2Subtitle}>Qu&apos;est-ce que l&apos;Avance Immédiate ?</Text>
                  <Text style={s.p2Text}>
                    Dispositif officiel permettant de déduire directement le crédit d&apos;impôt SAP au moment du paiement — sans attendre la déclaration de revenus annuelle (art. L.7233-1 du Code du travail).
                  </Text>
                  <Text style={s.p2Subtitle}>Comment ça fonctionne ?</Text>
                  <Text style={s.p2Text}>
                    Vous ne payez que 50% du montant TTC. L&apos;État verse directement la différence à KinouClean. Zéro avance de trésorerie.
                  </Text>
                  <Text style={s.p2Subtitle}>Activation</Text>
                  <Text style={s.p2Text}>
                    Un lien d&apos;activation vous sera envoyé pour connecter nos services à l&apos;Urssaf. Cette démarche ne vous engage en aucun cas.
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.p2AmtLine}>
                    <Text style={s.p2AmtKey}>Montant total TTC</Text>
                    <Text style={s.p2AmtVal}>{fmt(ttcTotal)}</Text>
                  </View>
                  <View style={s.p2AmtLine}>
                    <Text style={s.p2AmtKey}>Prise en charge État (50%)</Text>
                    <Text style={s.p2AmtVal}>{fmt(ttcTotal * 0.5)}</Text>
                  </View>
                  <View style={s.p2AmountRow}>
                    <Text style={s.p2AmountLabel}>Vous ne payez que</Text>
                    <Text style={s.p2AmountVal}>{fmt(ttcTotal * 0.5)}</Text>
                  </View>
                  <Text style={{ fontSize: 7, color: GRAY3, marginTop: 5, lineHeight: 1.4 }}>
                    * Plafond 12 000 €/an (majoré selon situation familiale). Résidence principale ou secondaire.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Crédit d'impôt ───────────────────────────────────────── */}
          {d.creditImpot && (
            <View style={s.creditBox}>
              <Text style={s.creditTitle}>Crédit d&apos;impôt SAP — Mentions légales</Text>
              <View style={s.creditGrid}>
                <View style={s.creditCol}>
                  <Text style={s.creditLabel}>Organisme habilité SAP</Text>
                  <Text style={s.creditText}>
                    KinouClean — N° {SAP_NUM} (effectif 02/03/2026) — art. L. 7231-1 du Code du travail.
                  </Text>
                  <Text style={s.creditLabel}>Base légale</Text>
                  <Text style={s.creditText}>
                    Art. 199 sexdecies du CGI — crédit d&apos;impôt 50% des dépenses SAP à domicile. Remboursable si supérieur à l&apos;impôt dû.
                  </Text>
                  <Text style={s.creditLabel}>Attestation fiscale</Text>
                  <Text style={s.creditText}>
                    Attestation CERFA annuelle délivrée pour votre déclaration de revenus.
                  </Text>
                </View>
                <View style={s.creditCol}>
                  <View style={{ marginBottom: 6 }}>
                    <Text style={s.p2AmtKey}>Montant TTC</Text>
                    <Text style={[s.p2AmtVal, { fontSize: 9 }]}>{fmt(ttcTotal)}</Text>
                  </View>
                  <View style={{ marginBottom: 6 }}>
                    <Text style={s.p2AmtKey}>Crédit d&apos;impôt estimé (50%)</Text>
                    <Text style={[s.p2AmtVal, { fontSize: 9 }]}>{fmt(ttcTotal * 0.5)}</Text>
                  </View>
                  <View style={s.creditAmtRow}>
                    <Text style={s.creditAmtLabel}>Coût réel après avantage fiscal</Text>
                    <Text style={s.creditAmtVal}>{fmt(ttcTotal * 0.5)}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ── Conditions / Protocole / Agréments ───────────────────── */}
          <View style={s.sectionHead}>
            <View style={s.sectionBar} />
            <Text style={s.sectionText}>Informations pratiques</Text>
            <View style={s.sectionLine} />
          </View>

          <View style={s.condGrid}>
            <View style={s.condCol}>
              <Text style={s.condTitle}>Conditions</Text>
              <Text style={s.condKey}>Validité</Text>
              <Text style={s.condVal}>30 jours à compter du {d.date}</Text>
              <Text style={s.condKey}>Paiement</Text>
              <Text style={s.condVal}>À réception — Virement, espèces ou CB</Text>
              <Text style={s.condKey}>Régime fiscal</Text>
              <Text style={s.condVal}>TVA 20% — SIRET {SIRET}</Text>
            </View>
            <View style={s.condCol}>
              <Text style={s.condTitle}>Protocole</Text>
              <Text style={s.condKey}>Préparation</Text>
              <Text style={s.condVal}>Libérer l&apos;accès à la zone d&apos;intervention</Text>
              <Text style={s.condKey}>Durée estimée</Text>
              <Text style={s.condVal}>Variable selon la prestation</Text>
              <Text style={s.condKey}>Séchage</Text>
              <Text style={s.condVal}>2 à 3h selon la prestation — ventilation conseillée</Text>
            </View>
            <View style={s.condCol}>
              <Text style={s.condTitle}>Agréments</Text>
              <Text style={s.condKey}>SAP</Text>
              <Text style={s.condVal}>N° {SAP_NUM} — 02/03/2026</Text>
              <Text style={s.condKey}>Avance Immédiate</Text>
              <Text style={s.condVal}>Via app.avance-immediate.fr</Text>
              <Text style={s.condKey}>RC Pro</Text>
              <Text style={s.condVal}>Coover x Hiscox</Text>
            </View>
          </View>

          {/* ── Bon pour accord ───────────────────────────────────────── */}
          <View style={s.sectionHead}>
            <View style={s.sectionBar} />
            <Text style={s.sectionText}>Bon pour accord</Text>
            <View style={s.sectionLine} />
          </View>

          <View style={s.signRow}>
            <View style={s.signBox}>
              <Text style={s.signLabel}>Prestataire</Text>
              <Text style={s.signName}>KinouClean SAS</Text>
              <View style={s.signLine} />
              <Text style={s.signSub}>Signature &amp; cachet</Text>
            </View>
            <View style={s.signBox}>
              <Text style={s.signLabel}>Client</Text>
              <Text style={s.signName}>{d.clientPrenom} {d.clientNom}</Text>
              <View style={s.signLine} />
              <Text style={s.signSub}>Lu et approuvé — Date : ___________</Text>
            </View>
          </View>

        </View>

        <Footer refNumber={d.refNumber} />
      </Page>
    </Document>
  );
}
