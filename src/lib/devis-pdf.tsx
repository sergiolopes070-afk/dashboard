import React from "react";
import {
  Document, Page, Text, View, StyleSheet,
  Svg, Circle, Line, Path, Rect, Text as SvgText,
} from "@react-pdf/renderer";

// ─── Palette ─────────────────────────────────────────────────────────────────

const BRAND   = "#1C3557";   // bleu marine profond
const ACCENT  = "#F97316";   // orange vif (couleur KinouClean)
const GRAY1   = "#374151";   // texte principal
const GRAY2   = "#6B7280";   // texte secondaire
const GRAY3   = "#9CA3AF";   // labels discrets
const BORDER  = "#E5E7EB";
const LIGHT   = "#F8FAFC";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: GRAY1,
    backgroundColor: "#ffffff",
    paddingBottom: 60,
  },

  // ── Bandeau header ──────────────────────────────────────────────────────
  headerBand: {
    backgroundColor: BRAND,
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "column",
    gap: 6,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  devisLabel: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 4,
  },
  accentLine: {
    height: 3,
    width: 44,
    backgroundColor: ACCENT,
    borderRadius: 2,
    marginTop: 6,
    marginLeft: "auto" as const,
  },
  devisRef: {
    fontSize: 9,
    color: "rgba(255,255,255,0.6)",
    marginTop: 8,
    letterSpacing: 0.3,
  },
  devisDate: {
    fontSize: 9,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },

  // ── Corps page ──────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 44,
    paddingTop: 32,
  },

  // ── Parties (émetteur / client) ─────────────────────────────────────────
  parties: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 32,
  },
  partyBox: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 8,
    padding: 14,
    borderTopWidth: 3,
    borderTopColor: ACCENT,
  },
  partyBoxBlue: {
    borderTopColor: BRAND,
  },
  partyLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GRAY3,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  partyName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: GRAY1,
    marginBottom: 4,
  },
  partyLine: {
    fontSize: 9,
    color: GRAY2,
    marginBottom: 2,
    lineHeight: 1.5,
  },

  // ── Section titre ───────────────────────────────────────────────────────
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  sectionTitleDot: {
    width: 4,
    height: 16,
    backgroundColor: ACCENT,
    borderRadius: 2,
  },
  sectionTitleText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: BRAND,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },

  // ── Table ───────────────────────────────────────────────────────────────
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BRAND,
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 1,
  },
  tableHeaderText: {
    color: "#ffffff",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    backgroundColor: LIGHT,
  },
  tableCell: {
    fontSize: 10,
    color: GRAY1,
    lineHeight: 1.5,
  },
  colDesc:  { flex: 5 },
  colQty:   { flex: 1, textAlign: "center" as const },
  colPU:    { flex: 2, textAlign: "right" as const },
  colTotal: { flex: 2, textAlign: "right" as const },

  // ── Totaux ──────────────────────────────────────────────────────────────
  totauxSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
    marginBottom: 28,
  },
  totauxBox: {
    width: 230,
  },
  totauxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  totauxLabel: {
    fontSize: 9,
    color: GRAY2,
  },
  totauxValue: {
    fontSize: 9,
    color: GRAY1,
    fontFamily: "Helvetica-Bold",
  },
  totalTTCRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: ACCENT,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  totalTTCLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  totalTTCValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },

  // ── Conditions ──────────────────────────────────────────────────────────
  conditionsBox: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  condBlock: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 12,
  },
  condTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GRAY2,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  condText: {
    fontSize: 8.5,
    color: GRAY2,
    lineHeight: 1.6,
  },

  // ── Signatures ──────────────────────────────────────────────────────────
  signRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 32,
  },
  signBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 12,
    minHeight: 70,
  },
  signLabel: {
    fontSize: 8,
    color: GRAY3,
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  signName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: GRAY1,
    marginBottom: 20,
  },
  signLine: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: "auto" as const,
  },
  signSub: {
    fontSize: 7.5,
    color: GRAY3,
    marginTop: 4,
    textAlign: "center" as const,
  },

  // ── Footer ──────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BRAND,
    paddingVertical: 12,
    paddingHorizontal: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    color: "rgba(255,255,255,0.55)",
  },
  footerBrand: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DevisData {
  refNumber  : string;
  date       : string;
  validite   : string;
  clientNom    : string;
  clientPrenom : string;
  clientEmail  : string;
  clientTel    : string;
  clientAdresse: string;
  typePresta : string;
  quantite   : string;
  adresse    : string;
  dateInter  : string;
  heureInter : string;
  prix       : string;
  message    : string;
}

// ─── Logo SVG ─────────────────────────────────────────────────────────────────

const LOGO_COLOR = "#ffffff";

function KinoucleanLogo() {
  const c  = LOGO_COLOR;
  const sw = 2.2;
  return (
    <Svg width={160} height={38} viewBox="0 0 390 80">
      {/* Canapé */}
      <Rect x="2" y="42" width="38" height="22" rx="4" stroke={c} strokeWidth={sw} fill="none" />
      <Rect x="0" y="36" width="8" height="12" rx="3" stroke={c} strokeWidth={sw} fill="none" />
      <Rect x="32" y="36" width="8" height="12" rx="3" stroke={c} strokeWidth={sw} fill="none" />
      <Line x1="8" y1="64" x2="8" y2="70" stroke={c} strokeWidth={sw} />
      <Line x1="32" y1="64" x2="32" y2="70" stroke={c} strokeWidth={sw} />
      {/* Personnage */}
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
      {/* Étoiles */}
      <Path d="M68 10 L69.5 6 L71 10 L75 11.5 L71 13 L69.5 17 L68 13 L64 11.5 Z" fill={ACCENT} />
      <Path d="M14 28 L15.5 24 L17 28 L21 29.5 L17 31 L15.5 35 L14 31 L10 29.5 Z" fill={ACCENT} />
      {/* Nom */}
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
  const ttc = ht; // auto-entrepreneur, TVA 0%

  const descLines = [
    d.typePresta,
    d.adresse   ? `Adresse d'intervention : ${d.adresse}` : "",
    d.dateInter ? `Date : ${d.dateInter}${d.heureInter ? " à " + d.heureInter : ""}` : "",
    d.message   ? `Note : ${d.message}` : "",
  ].filter(Boolean).join("\n");

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Bandeau header ──────────────────────────────────────────────── */}
        <View style={styles.headerBand}>
          <View style={styles.headerLeft}>
            <KinoucleanLogo />
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.devisLabel}>DEVIS</Text>
            <View style={styles.accentLine} />
            <Text style={styles.devisRef}>N° {d.refNumber}</Text>
            <Text style={styles.devisDate}>Émis le {d.date}</Text>
            <Text style={styles.devisDate}>{"Valable jusqu'au "}{d.validite}</Text>
          </View>
        </View>

        <View style={styles.body}>

          {/* ── Émetteur / Client ────────────────────────────────────────── */}
          <View style={styles.parties}>
            <View style={styles.partyBox}>
              <Text style={styles.partyLabel}>Prestataire</Text>
              <Text style={styles.partyName}>KinouClean</Text>
              <Text style={styles.partyLine}>Service de nettoyage professionnel</Text>
              <Text style={styles.partyLine}>contact@kinouclean.fr</Text>
              <Text style={styles.partyLine}>Île-de-France</Text>
            </View>
            <View style={[styles.partyBox, styles.partyBoxBlue]}>
              <Text style={styles.partyLabel}>Client</Text>
              <Text style={styles.partyName}>{d.clientPrenom} {d.clientNom}</Text>
              {d.clientAdresse ? <Text style={styles.partyLine}>{d.clientAdresse}</Text> : null}
              {d.clientTel     ? <Text style={styles.partyLine}>{d.clientTel}</Text> : null}
              {d.clientEmail   ? <Text style={styles.partyLine}>{d.clientEmail}</Text> : null}
            </View>
          </View>

          {/* ── Table prestations ────────────────────────────────────────── */}
          <View style={styles.sectionTitle}>
            <View style={styles.sectionTitleDot} />
            <Text style={styles.sectionTitleText}>Détail de la prestation</Text>
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qté</Text>
            <Text style={[styles.tableHeaderText, styles.colPU]}>Prix unit.</Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.colDesc]}>{descLines}</Text>
            <Text style={[styles.tableCell, styles.colQty]}>{d.quantite || "1"}</Text>
            <Text style={[styles.tableCell, styles.colPU]}>{fmt(ht)}</Text>
            <Text style={[styles.tableCell, styles.colTotal]}>{fmt(ht)}</Text>
          </View>

          {/* ── Totaux ───────────────────────────────────────────────────── */}
          <View style={styles.totauxSection}>
            <View style={styles.totauxBox}>
              <View style={styles.totauxRow}>
                <Text style={styles.totauxLabel}>Sous-total HT</Text>
                <Text style={styles.totauxValue}>{fmt(ht)}</Text>
              </View>
              <View style={styles.totauxRow}>
                <Text style={styles.totauxLabel}>TVA (0 % — auto-entrepreneur)</Text>
                <Text style={styles.totauxValue}>0,00 €</Text>
              </View>
              <View style={styles.totalTTCRow}>
                <Text style={styles.totalTTCLabel}>TOTAL À PAYER</Text>
                <Text style={styles.totalTTCValue}>{fmt(ttc)}</Text>
              </View>
            </View>
          </View>

          {/* ── Conditions ───────────────────────────────────────────────── */}
          <View style={styles.sectionTitle}>
            <View style={styles.sectionTitleDot} />
            <Text style={styles.sectionTitleText}>Conditions & modalités</Text>
          </View>
          <View style={styles.conditionsBox}>
            <View style={styles.condBlock}>
              <Text style={styles.condTitle}>Validité</Text>
              <Text style={styles.condText}>
                {"Ce devis est valable 30 jours à compter de sa date d'émission. Passé ce délai, les tarifs pourront être révisés."}
              </Text>
            </View>
            <View style={styles.condBlock}>
              <Text style={styles.condTitle}>Paiement</Text>
              <Text style={styles.condText}>
                Paiement à réception de la facture.{"\n"}
                Modes acceptés : virement bancaire ou espèces.
              </Text>
            </View>
            <View style={styles.condBlock}>
              <Text style={styles.condTitle}>Régime fiscal</Text>
              <Text style={styles.condText}>
                TVA non applicable — article 293 B du CGI.{"\n"}
                Micro-entrepreneur.
              </Text>
            </View>
          </View>

          {/* ── Signatures ───────────────────────────────────────────────── */}
          <View style={styles.sectionTitle}>
            <View style={styles.sectionTitleDot} />
            <Text style={styles.sectionTitleText}>Bon pour accord</Text>
          </View>
          <View style={styles.signRow}>
            <View style={styles.signBox}>
              <Text style={styles.signLabel}>Prestataire</Text>
              <Text style={styles.signName}>KinouClean</Text>
              <View style={styles.signLine} />
              <Text style={styles.signSub}>Signature &amp; cachet</Text>
            </View>
            <View style={styles.signBox}>
              <Text style={styles.signLabel}>Client</Text>
              <Text style={styles.signName}>{d.clientPrenom} {d.clientNom}</Text>
              <View style={styles.signLine} />
              <Text style={styles.signSub}>Lu et approuvé — Date : ___________</Text>
            </View>
          </View>

        </View>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerBrand}>KinouClean</Text>
          <Text style={styles.footerText}>Service de nettoyage professionnel · Île-de-France</Text>
          <Text style={styles.footerText}>contact@kinouclean.fr</Text>
        </View>

      </Page>
    </Document>
  );
}
