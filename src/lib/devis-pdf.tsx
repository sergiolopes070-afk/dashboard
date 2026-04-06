import React from "react";
import {
  Document, Page, Text, View, StyleSheet,
  Svg, Circle, Line, Path, Rect, Text as SvgText,
} from "@react-pdf/renderer";

// ─── Palette ─────────────────────────────────────────────────────────────────
const BRAND  = "#1C3557";
const ACCENT = "#F97316";
const GRAY1  = "#1F2937";
const GRAY2  = "#6B7280";
const GRAY3  = "#9CA3AF";
const BORDER = "#E5E7EB";
const LIGHT  = "#F9FAFB";
const WHITE  = "#FFFFFF";

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: GRAY1,
    backgroundColor: WHITE,
    paddingBottom: 48,
  },

  // Header
  header: {
    backgroundColor: BRAND,
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  devisTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    letterSpacing: 5,
  },
  accentBar: {
    width: 36,
    height: 3,
    backgroundColor: ACCENT,
    borderRadius: 2,
    marginTop: 5,
    marginLeft: "auto" as const,
  },
  devisMeta: { fontSize: 8, color: "rgba(255,255,255,0.55)", marginTop: 3 },

  // Accent strip
  strip: {
    backgroundColor: ACCENT,
    height: 4,
  },

  // Body
  body: { paddingHorizontal: 40, paddingTop: 22 },

  // Parties
  parties: { flexDirection: "row", gap: 14, marginBottom: 20 },
  partyBox: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
  },
  partyBoxRight: { borderLeftColor: BRAND },
  partyLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: GRAY3,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  partyName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: GRAY1, marginBottom: 3 },
  partyLine: { fontSize: 8.5, color: GRAY2, marginBottom: 1.5, lineHeight: 1.4 },

  // Intervention info box
  infoBox: {
    backgroundColor: BRAND,
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
    flexDirection: "row",
    gap: 0,
  },
  infoItem: { flex: 1, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.15)" },
  infoItemLast: { flex: 1, paddingHorizontal: 10 },
  infoKey: { fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 3 },
  infoVal: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: WHITE },

  // Section title
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  sectionDot: { width: 3, height: 14, backgroundColor: ACCENT, borderRadius: 2 },
  sectionText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: BRAND,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },

  // Table
  tableHead: {
    flexDirection: "row",
    backgroundColor: BRAND,
    borderRadius: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 1,
  },
  thText: { color: WHITE, fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: { backgroundColor: LIGHT },
  tdText: { fontSize: 9, color: GRAY1, lineHeight: 1.5 },
  tdSub: { fontSize: 7.5, color: GRAY2, marginTop: 2, lineHeight: 1.4 },
  cDesc:  { flex: 5 },
  cQty:   { flex: 1, textAlign: "center" as const },
  cPU:    { flex: 2, textAlign: "right" as const },
  cTotal: { flex: 2, textAlign: "right" as const },

  // Totaux
  totauxWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14, marginBottom: 20 },
  totauxBox: { width: 210 },
  totRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  totLabel: { fontSize: 8, color: GRAY2 },
  totVal:   { fontSize: 8, color: GRAY1, fontFamily: "Helvetica-Bold" },
  totTTCRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: ACCENT,
    borderRadius: 5,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginTop: 5,
  },
  totTTCLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: WHITE },
  totTTCVal:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: WHITE },

  // Bottom row: conditions + signatures côte à côte
  bottomRow: { flexDirection: "row", gap: 14, marginBottom: 0 },

  // Conditions
  condWrap: { flex: 1 },
  condBox: {
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
  },
  condTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: GRAY2,
    textTransform: "uppercase" as const,
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  condText: { fontSize: 7.5, color: GRAY2, lineHeight: 1.5 },

  // Signatures
  signWrap: { flex: 1 },
  signBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 10,
    minHeight: 80,
    marginBottom: 6,
  },
  signLabel: { fontSize: 7, color: GRAY3, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 3 },
  signName:  { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: GRAY1, marginBottom: 14 },
  signLine:  { borderTopWidth: 1, borderTopColor: BORDER, marginTop: "auto" as const },
  signSub:   { fontSize: 7, color: GRAY3, marginTop: 3, textAlign: "center" as const },

  // Note client
  noteBox: {
    backgroundColor: "#FFF7ED",
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  noteTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: ACCENT, textTransform: "uppercase" as const, letterSpacing: 0.7, marginBottom: 3 },
  noteText:  { fontSize: 8.5, color: GRAY1, lineHeight: 1.5 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: BRAND,
    paddingVertical: 10,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerBrand: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: WHITE },
  footerText:  { fontSize: 7.5, color: "rgba(255,255,255,0.5)" },
});

// ─── Types ────────────────────────────────────────────────────────────────────
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
  dateInter    : string;
  heureInter   : string;
  prix         : string;
  message      : string;
}

// ─── Logo SVG ─────────────────────────────────────────────────────────────────
function KinoucleanLogo() {
  const c = "#ffffff";
  const sw = 2.2;
  return (
    <Svg width={150} height={34} viewBox="0 0 390 80">
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
        Kinouclean
      </SvgText>
    </Svg>
  );
}

function fmt(n: string | number) {
  const v = parseFloat(String(n));
  return isNaN(v) ? "—" : v.toFixed(2).replace(".", ",") + " €";
}

// ─── Document ────────────────────────────────────────────────────────────────
export function DevisPDF({ d }: { d: DevisData }) {
  const ht  = parseFloat(d.prix) || 0;
  const qty = parseInt(d.quantite) || 1;
  const pu  = qty > 1 ? ht / qty : ht;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <KinoucleanLogo />
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.devisTitle}>DEVIS</Text>
            <View style={s.accentBar} />
            <Text style={s.devisMeta}>N° {d.refNumber}</Text>
            <Text style={s.devisMeta}>Émis le {d.date} · Valable jusqu&apos;au {d.validite}</Text>
          </View>
        </View>
        <View style={s.strip} />

        <View style={s.body}>

          {/* ── Émetteur / Client ───────────────────────────────────────── */}
          <View style={s.parties}>
            <View style={s.partyBox}>
              <Text style={s.partyLabel}>Prestataire</Text>
              <Text style={s.partyName}>KinouClean</Text>
              <Text style={s.partyLine}>Service de nettoyage professionnel</Text>
              <Text style={s.partyLine}>contact@kinouclean.fr</Text>
              <Text style={s.partyLine}>Île-de-France</Text>
            </View>
            <View style={[s.partyBox, s.partyBoxRight]}>
              <Text style={s.partyLabel}>Client</Text>
              <Text style={s.partyName}>{d.clientPrenom} {d.clientNom}</Text>
              {d.clientAdresse ? <Text style={s.partyLine}>{d.clientAdresse}</Text> : null}
              {d.clientTel     ? <Text style={s.partyLine}>{d.clientTel}</Text> : null}
              {d.clientEmail   ? <Text style={s.partyLine}>{d.clientEmail}</Text> : null}
            </View>
          </View>

          {/* ── Infos intervention ─────────────────────────────────────── */}
          {(d.dateInter || d.heureInter || d.adresse) && (
            <View style={s.infoBox}>
              <View style={s.infoItem}>
                <Text style={s.infoKey}>Type de prestation</Text>
                <Text style={s.infoVal}>{d.typePresta}</Text>
              </View>
              {d.dateInter ? (
                <View style={s.infoItem}>
                  <Text style={s.infoKey}>Date d&apos;intervention</Text>
                  <Text style={s.infoVal}>{d.dateInter}{d.heureInter ? ` à ${d.heureInter}` : ""}</Text>
                </View>
              ) : null}
              {d.adresse ? (
                <View style={s.infoItemLast}>
                  <Text style={s.infoKey}>Adresse</Text>
                  <Text style={s.infoVal}>{d.adresse}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* ── Note client ─────────────────────────────────────────────── */}
          {d.message ? (
            <View style={s.noteBox}>
              <Text style={s.noteTitle}>Note / Demande spécifique</Text>
              <Text style={s.noteText}>{d.message}</Text>
            </View>
          ) : null}

          {/* ── Détail prestation ───────────────────────────────────────── */}
          <View style={s.sectionHead}>
            <View style={s.sectionDot} />
            <Text style={s.sectionText}>Détail de la prestation</Text>
          </View>

          <View style={s.tableHead}>
            <Text style={[s.thText, s.cDesc]}>Description</Text>
            <Text style={[s.thText, s.cQty]}>Qté</Text>
            <Text style={[s.thText, s.cPU]}>Prix unit.</Text>
            <Text style={[s.thText, s.cTotal]}>Total</Text>
          </View>

          <View style={s.tableRow}>
            <View style={s.cDesc}>
              <Text style={s.tdText}>{d.typePresta}</Text>
              {d.adresse && <Text style={s.tdSub}>Adresse : {d.adresse}</Text>}
              {d.dateInter && (
                <Text style={s.tdSub}>
                  Intervention : {d.dateInter}{d.heureInter ? ` à ${d.heureInter}` : ""}
                </Text>
              )}
            </View>
            <Text style={[s.tdText, s.cQty]}>{qty}</Text>
            <Text style={[s.tdText, s.cPU]}>{fmt(pu)}</Text>
            <Text style={[s.tdText, s.cTotal]}>{fmt(ht)}</Text>
          </View>

          {/* ── Totaux ──────────────────────────────────────────────────── */}
          <View style={s.totauxWrap}>
            <View style={s.totauxBox}>
              <View style={s.totRow}>
                <Text style={s.totLabel}>Sous-total HT</Text>
                <Text style={s.totVal}>{fmt(ht)}</Text>
              </View>
              <View style={s.totRow}>
                <Text style={s.totLabel}>TVA (0 % — auto-entrepreneur)</Text>
                <Text style={s.totVal}>0,00 €</Text>
              </View>
              <View style={s.totTTCRow}>
                <Text style={s.totTTCLabel}>TOTAL À PAYER</Text>
                <Text style={s.totTTCVal}>{fmt(ht)}</Text>
              </View>
            </View>
          </View>

          {/* ── Conditions + Signatures côte à côte ─────────────────────── */}
          <View style={s.bottomRow}>

            {/* Conditions */}
            <View style={s.condWrap}>
              <View style={s.sectionHead}>
                <View style={s.sectionDot} />
                <Text style={s.sectionText}>Conditions</Text>
              </View>
              <View style={s.condBox}>
                <Text style={s.condTitle}>Validité</Text>
                <Text style={s.condText}>
                  {"Devis valable 30 jours à compter du "}{d.date}{"."}
                </Text>
              </View>
              <View style={s.condBox}>
                <Text style={s.condTitle}>Paiement</Text>
                <Text style={s.condText}>
                  À réception de la facture.{"\n"}Virement bancaire ou espèces acceptés.
                </Text>
              </View>
              <View style={s.condBox}>
                <Text style={s.condTitle}>Régime fiscal</Text>
                <Text style={s.condText}>
                  TVA non applicable — art. 293 B du CGI.{"\n"}Micro-entrepreneur.
                </Text>
              </View>
            </View>

            {/* Signatures */}
            <View style={s.signWrap}>
              <View style={s.sectionHead}>
                <View style={s.sectionDot} />
                <Text style={s.sectionText}>Bon pour accord</Text>
              </View>
              <View style={s.signBox}>
                <Text style={s.signLabel}>Prestataire</Text>
                <Text style={s.signName}>KinouClean</Text>
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
        </View>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerBrand}>KinouClean</Text>
          <Text style={s.footerText}>Service de nettoyage professionnel · Île-de-France</Text>
          <Text style={s.footerText}>contact@kinouclean.fr</Text>
        </View>

      </Page>
    </Document>
  );
}
