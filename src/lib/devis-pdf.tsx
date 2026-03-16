import React from "react";
import {
  Document, Page, Text, View, StyleSheet,
  Svg, Circle, Line, Path, Rect, Text as SvgText,
} from "@react-pdf/renderer";

// ─── Styles ──────────────────────────────────────────────────────────────────

const BLUE   = "#1a56db";
const GRAY   = "#6b7280";
const DARK   = "#111827";
const LIGHT  = "#f9fafb";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: DARK,
    backgroundColor: "#ffffff",
    paddingTop: 48,
    paddingBottom: 60,
    paddingHorizontal: 48,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  logo: {
    width: 90,
    height: 36,
    objectFit: "contain",
  },
  headerRight: {
    alignItems: "flex-end",
  },
  devisTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    letterSpacing: 2,
  },
  devisRef: {
    fontSize: 9,
    color: GRAY,
    marginTop: 4,
  },
  devisDate: {
    fontSize: 9,
    color: GRAY,
    marginTop: 2,
  },

  // ── Divider ─────────────────────────────────────────────────────────────
  divider: {
    height: 2,
    backgroundColor: BLUE,
    marginBottom: 24,
    borderRadius: 1,
  },

  // ── Parties ─────────────────────────────────────────────────────────────
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 20,
  },
  partyBox: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 14,
    borderLeft: `3px solid ${BLUE}`,
  },
  partyLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  partyName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    marginBottom: 4,
  },
  partyLine: {
    fontSize: 9,
    color: GRAY,
    marginBottom: 2,
  },

  // ── Table ───────────────────────────────────────────────────────────────
  tableTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BLUE,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 2,
  },
  tableHeaderText: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    backgroundColor: LIGHT,
  },
  tableCell: {
    fontSize: 10,
    color: DARK,
  },
  colDesc:  { flex: 4 },
  colQty:   { flex: 1, textAlign: "center" as const },
  colPU:    { flex: 2, textAlign: "right" as const },
  colTotal: { flex: 2, textAlign: "right" as const },

  // ── Totaux ──────────────────────────────────────────────────────────────
  totauxSection: {
    alignItems: "flex-end",
    marginTop: 16,
    marginBottom: 24,
  },
  totauxBox: {
    width: 220,
  },
  totauxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  totauxLabel: {
    fontSize: 9,
    color: GRAY,
  },
  totauxValue: {
    fontSize: 9,
    color: DARK,
  },
  totalTTCRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: BLUE,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  totalTTCLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  totalTTCValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },

  // ── Notes & conditions ──────────────────────────────────────────────────
  notesBox: {
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
    borderLeft: `3px solid ${BORDER}`,
  },
  notesTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: GRAY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  notesText: {
    fontSize: 9,
    color: GRAY,
    lineHeight: 1.6,
  },

  // ── Signature ───────────────────────────────────────────────────────────
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 20,
  },
  signatureBox: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  signatureLabel: {
    fontSize: 8,
    color: GRAY,
    marginBottom: 28,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  signatureSubLabel: {
    fontSize: 8,
    color: GRAY,
    marginTop: 4,
    textAlign: "center" as const,
  },

  // ── Footer ──────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    textAlign: "center" as const,
    fontSize: 8,
    color: GRAY,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DevisData {
  refNumber  : string;
  date       : string;       // ex: "15/03/2026"
  validite   : string;       // ex: "15/04/2026"
  // Client
  clientNom    : string;
  clientPrenom : string;
  clientEmail  : string;
  clientTel    : string;
  clientAdresse: string;
  // Prestation
  typePresta : string;
  quantite   : string;
  adresse    : string;
  dateInter  : string;
  heureInter : string;
  prix       : string;
  message    : string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BRAND_BLUE = "#5B9BD5";

/** Logo h2maison en SVG inline (évite toute dépendance externe) */
function H2maisonLogo() {
  const c = BRAND_BLUE;
  const sw = 2.2; // stroke-width
  return (
    <Svg width={130} height={38} viewBox="0 0 340 80">
      {/* ── Icône artisan ── */}
      {/* Tête */}
      <Circle cx="34" cy="13" r="9" stroke={c} strokeWidth={sw} fill="none" />
      {/* Corps */}
      <Line x1="34" y1="22" x2="31" y2="46" stroke={c} strokeWidth={sw} />
      {/* Bras gauche → outil */}
      <Line x1="32" y1="33" x2="57" y2="41" stroke={c} strokeWidth={sw} />
      {/* Tournevis / visseuse */}
      <Rect x="54" y="37" width="17" height="7" rx="3.5"
        stroke={c} strokeWidth={1.8} fill="none"
        transform="rotate(-18 62.5 40.5)" />
      {/* Bras droit */}
      <Line x1="32" y1="33" x2="18" y2="42" stroke={c} strokeWidth={sw} />
      {/* Jambe droite (agenouillée) */}
      <Line x1="31" y1="46" x2="21" y2="63" stroke={c} strokeWidth={sw} />
      <Line x1="21" y1="63" x2="14" y2="70" stroke={c} strokeWidth={sw} />
      {/* Pied droit */}
      <Line x1="14" y1="70" x2="28" y2="72" stroke={c} strokeWidth={sw} />
      {/* Jambe gauche */}
      <Line x1="31" y1="46" x2="43" y2="58" stroke={c} strokeWidth={sw} />
      <Line x1="43" y1="58" x2="54" y2="56" stroke={c} strokeWidth={sw} />
      {/* Étoile 1 (haut gauche) */}
      <Path d="M10 22 L12 16 L14 22 L20 24 L14 26 L12 32 L10 26 L4 24 Z"
        fill={c} />
      {/* Étoile 2 (haut droite) */}
      <Path d="M60 16 L61.5 12 L63 16 L67 17.5 L63 19 L61.5 23 L60 19 L56 17.5 Z"
        fill={c} />
      {/* ── Texte h2maison ── */}
      <SvgText x="80" y="56"
        style={{ fontSize: 46, fontFamily: "Helvetica-Bold", fill: c } as object}>
        h2maison
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
  const tva = 0; // auto-entrepreneur
  const ttc = ht + tva;

  const descriptionLines = [
    d.typePresta,
    d.dateInter ? `Date d'intervention : ${d.dateInter}${d.heureInter ? " à " + d.heureInter : ""}` : "",
    d.adresse   ? `Adresse : ${d.adresse}` : "",
    d.message   ? `Note : ${d.message}` : "",
  ].filter(Boolean).join("\n");

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <H2maisonLogo />
          <View style={styles.headerRight}>
            <Text style={styles.devisTitle}>DEVIS</Text>
            <Text style={styles.devisRef}>N° {d.refNumber}</Text>
            <Text style={styles.devisDate}>Date : {d.date}</Text>
            <Text style={styles.devisDate}>Valable jusqu'au : {d.validite}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Parties ────────────────────────────────────────────────────── */}
        <View style={styles.parties}>
          {/* Émetteur */}
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Prestataire</Text>
            <Text style={styles.partyName}>h2maison</Text>
            <Text style={styles.partyLine}>Services à domicile professionnels</Text>
            <Text style={styles.partyLine}>contact.h2maison@gmail.com</Text>
            <Text style={styles.partyLine}>Île-de-France</Text>
          </View>
          {/* Client */}
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Client</Text>
            <Text style={styles.partyName}>{d.clientPrenom} {d.clientNom}</Text>
            {d.clientAdresse && <Text style={styles.partyLine}>{d.clientAdresse}</Text>}
            {d.clientTel     && <Text style={styles.partyLine}>{d.clientTel}</Text>}
            {d.clientEmail   && <Text style={styles.partyLine}>{d.clientEmail}</Text>}
          </View>
        </View>

        {/* ── Table prestations ──────────────────────────────────────────── */}
        <Text style={styles.tableTitle}>Détail des prestations</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.colDesc]}>Description</Text>
          <Text style={[styles.tableHeaderText, styles.colQty]}>Qté</Text>
          <Text style={[styles.tableHeaderText, styles.colPU]}>Prix unit.</Text>
          <Text style={[styles.tableHeaderText, styles.colTotal]}>Total HT</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.colDesc]}>{descriptionLines}</Text>
          <Text style={[styles.tableCell, styles.colQty]}>{d.quantite || "1"}</Text>
          <Text style={[styles.tableCell, styles.colPU]}>{fmt(ht)}</Text>
          <Text style={[styles.tableCell, styles.colTotal]}>{fmt(ht)}</Text>
        </View>

        {/* ── Totaux ─────────────────────────────────────────────────────── */}
        <View style={styles.totauxSection}>
          <View style={styles.totauxBox}>
            <View style={styles.totauxRow}>
              <Text style={styles.totauxLabel}>Sous-total HT</Text>
              <Text style={styles.totauxValue}>{fmt(ht)}</Text>
            </View>
            <View style={styles.totauxRow}>
              <Text style={styles.totauxLabel}>TVA (0% — auto-entrepreneur)</Text>
              <Text style={styles.totauxValue}>{fmt(tva)}</Text>
            </View>
            <View style={styles.totalTTCRow}>
              <Text style={styles.totalTTCLabel}>TOTAL TTC</Text>
              <Text style={styles.totalTTCValue}>{fmt(ttc)}</Text>
            </View>
          </View>
        </View>

        {/* ── Notes ──────────────────────────────────────────────────────── */}
        <View style={styles.notesBox}>
          <Text style={styles.notesTitle}>Conditions & informations</Text>
          <Text style={styles.notesText}>
            Ce devis est valable 30 jours à compter de sa date d'émission.
            {"\n"}Paiement à réception de la facture — virement bancaire ou espèces.
            {"\n"}TVA non applicable — article 293 B du CGI (auto-entrepreneur).
          </Text>
        </View>

        {/* ── Signature ──────────────────────────────────────────────────── */}
        <View style={styles.signatureRow}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Signature KinouClean</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureSubLabel}>Bon pour accord</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Signature client — {d.clientPrenom} {d.clientNom}</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureSubLabel}>Lu et approuvé</Text>
          </View>
        </View>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <Text style={styles.footer}>
          h2maison — Services à domicile professionnels — contact.h2maison@gmail.com — Île-de-France
        </Text>

      </Page>
    </Document>
  );
}
