/* eslint-disable jsx-a11y/alt-text */
// ─────────────────────────────────────────────────────────────────────────────
// Devis KinouClean — VRAI PDF natif via @react-pdf/renderer (100 % JS, aucun
// binaire, fiable en serverless). Reproduit le modèle premium A4 (bleu outremer
// #1a2942 / doré #c17f3e). Polices standard PDF (Helvetica / Times) pour éviter
// toute dépendance réseau. Partage le catalogue et les calculs avec devisKinou.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { DevisData, mapLigne, formatEuro, cassepropre } from "./devisKinou";

const NAVY = "#1a2942";
const NAVY2 = "#16223a";
const GOLD = "#c17f3e";
const GOLD_SOFT = "#c8b48f";
const INK = "#46536b";
const MUTE = "#8b95a6";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: NAVY, lineHeight: 1.5, paddingBottom: 24 },

  // Bandeau d'en-tête
  band: { backgroundColor: NAVY, color: "#fff", paddingHorizontal: 32, paddingTop: 24, paddingBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "flex-start" },
  badge: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.2, borderColor: GOLD, color: GOLD, alignItems: "center", justifyContent: "center", marginRight: 12, fontFamily: "Times-Roman", fontSize: 16 },
  brandName: { fontFamily: "Times-Roman", fontSize: 24, color: "#fff" },
  brandTag: { color: GOLD_SOFT, letterSpacing: 2, fontSize: 7, marginTop: 4, textTransform: "uppercase" },
  docmeta: { alignItems: "flex-end" },
  kick: { color: GOLD_SOFT, letterSpacing: 2, fontSize: 7, textTransform: "uppercase" },
  docLabel: { fontFamily: "Times-Bold", fontSize: 30, color: GOLD, marginTop: 2 },
  docNum: { fontSize: 9.5, color: "#d7deea", marginTop: 6 },
  docDate: { fontSize: 8.5, color: "#aab4c6", marginTop: 1 },

  // Barre d'arguments
  tagbar: { backgroundColor: NAVY2, flexDirection: "row", paddingHorizontal: 32, paddingVertical: 7, gap: 20 },
  tagItem: { color: "#9fb0c9", fontSize: 7, letterSpacing: 0.5, textTransform: "uppercase" },

  content: { paddingHorizontal: 32, paddingTop: 22 },

  cardsRow: { flexDirection: "row", gap: 24, marginBottom: 20 },
  card: { flex: 1 },
  cardH: { fontSize: 8, letterSpacing: 1.5, color: GOLD, textTransform: "uppercase", borderBottomWidth: 1, borderBottomColor: "#e7d9c5", paddingBottom: 4, marginBottom: 6 },
  cardName: { fontFamily: "Times-Bold", fontSize: 14, marginBottom: 4 },
  cardP: { fontSize: 9.5, color: INK, lineHeight: 1.6 },
  muted: { color: MUTE },

  // Table
  thead: { flexDirection: "row", backgroundColor: NAVY, color: "#fff" },
  th: { paddingVertical: 8, paddingHorizontal: 10, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase" },
  trow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eef1f5" },
  td: { paddingVertical: 9, paddingHorizontal: 10, fontSize: 10, color: NAVY },
  colDesc: { flex: 1 },
  colQte: { width: 44, textAlign: "right" },
  colPu: { width: 80, textAlign: "right" },
  colHt: { width: 80, textAlign: "right" },
  pname: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  chip: { color: GOLD, fontSize: 7.5, textTransform: "uppercase", marginTop: 2 },
  desc: { color: MUTE, fontSize: 8.5, marginTop: 3, lineHeight: 1.45 },

  // Totaux
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: "58%" },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, paddingHorizontal: 10, fontSize: 10 },
  totSub: { borderTopWidth: 1, borderTopColor: "#eef1f5" },
  totTtc: { backgroundColor: NAVY, borderRadius: 5, marginTop: 4, paddingVertical: 8 },
  totTtcTxt: { color: "#fff", fontFamily: "Times-Bold", fontSize: 13 },

  // Dispositif (avance / crédit)
  aici: { marginHorizontal: 32, marginTop: 18, backgroundColor: "#eef3fb", borderWidth: 1, borderColor: "#c5d5ee", borderRadius: 7, paddingHorizontal: 16, paddingVertical: 13 },
  aiciH: { fontSize: 8, letterSpacing: 1.5, color: "#2f6bbf", textTransform: "uppercase", marginBottom: 8 },
  aiciRac: { fontFamily: "Times-Bold", fontSize: 18, color: NAVY },
  aiciRacSmall: { fontFamily: "Helvetica", fontSize: 10, color: "#5a6373" },
  aiciP: { fontSize: 9, color: INK, marginTop: 7, lineHeight: 1.6 },

  // Mentions légales
  legal: { marginHorizontal: 32, marginTop: 16, backgroundColor: "#f7f8fa", borderRadius: 7, paddingHorizontal: 16, paddingVertical: 12 },
  legalH: { fontSize: 8, letterSpacing: 1.2, color: NAVY, textTransform: "uppercase", marginBottom: 8 },
  legalList: { flexDirection: "row", flexWrap: "wrap" },
  legalLi: { width: "50%", fontSize: 8.4, color: "#5a6373", paddingVertical: 2, paddingRight: 10, flexDirection: "row" },
  legalDot: { color: GOLD, marginRight: 5 },

  // Signatures
  signRow: { flexDirection: "row", gap: 24, marginHorizontal: 32, marginTop: 16 },
  signBox: { flex: 1, borderWidth: 1, borderColor: "#c7cdd8", borderStyle: "dashed", borderRadius: 7, paddingHorizontal: 14, paddingVertical: 11, minHeight: 64 },
  signT: { fontSize: 8, letterSpacing: 0.5, color: MUTE, textTransform: "uppercase" },
  signGood: { fontSize: 9, color: MUTE, marginTop: 4 },

  // Pied
  foot: { marginTop: 18, borderTopWidth: 2, borderTopColor: GOLD, backgroundColor: NAVY, color: "#aab4c6", fontSize: 8, textAlign: "center", paddingHorizontal: 32, paddingVertical: 12, lineHeight: 1.6 },
  footStrong: { color: "#fff", fontFamily: "Helvetica-Bold" },
});

function DevisDoc({ data }: { data: DevisData }) {
  const dispositif = data.dispositif || "avance";
  const lignes = data.lignes.filter(l => l.prixTTC > 0);

  let totalHT = 0, totalTTC = 0;
  const rows = lignes.map(l => {
    const qte = l.qte && l.qte > 0 ? l.qte : 1;
    const ttc = l.prixTTC;
    const ht = ttc / 1.1;
    totalHT += ht; totalTTC += ttc;
    const puHT = ht / qte;
    const { libelle, chip, description } = mapLigne(l.typePresta, l.detail || "");
    return { libelle, chip, description, qte, puHT, ht };
  });
  const tva = totalTTC - totalHT;
  const rac = totalTTC * 0.5;

  const clientNom = data.client.nom ? cassepropre(data.client.nom) : "Client";
  const clientAdresse = data.client.adresse || "Adresse : à confirmer";
  const clientTel = data.client.tel || "Téléphone : à confirmer";

  const legalItems = [
    "Organisme agréé SAP N° D3289580 (habilitation 02/03/2026)",
    "Crédit d'impôt 50 % — Art. 199 sexdecies du CGI",
    "Avance Immédiate éligible — Art. L.7231-1 du Code du travail",
    "Attestation fiscale CERFA délivrée annuellement",
    "Assurance RC Pro Coover x Hiscox",
    "Paiement à l'issue de la prestation, jamais en avance",
  ];

  return (
    <Document title={`Devis KinouClean ${data.num}`} author="KinouClean SAS">
      <Page size="A4" style={s.page}>
        {/* En-tête */}
        <View style={s.band}>
          <View style={s.brand}>
            <Text style={s.badge}>KC</Text>
            <View>
              <Text style={s.brandName}>KinouClean</Text>
              <Text style={s.brandTag}>Nettoyage professionnel à domicile</Text>
            </View>
          </View>
          <View style={s.docmeta}>
            <Text style={s.kick}>Document commercial</Text>
            <Text style={s.docLabel}>DEVIS</Text>
            <Text style={s.docNum}>N° {data.num}</Text>
            <Text style={s.docDate}>Émis le {data.dateEmission}</Text>
            <Text style={s.docDate}>Valable jusqu'au {data.dateValidite}</Text>
          </View>
        </View>

        {/* Arguments */}
        <View style={s.tagbar}>
          <Text style={s.tagItem}>Organisme agréé SAP — N° D3289580</Text>
          <Text style={s.tagItem}>Crédit d'impôt 50 %</Text>
          <Text style={s.tagItem}>Avance Immédiate URSSAF</Text>
        </View>

        <View style={s.content}>
          {/* Prestataire / Client */}
          <View style={s.cardsRow}>
            <View style={s.card}>
              <Text style={s.cardH}>Prestataire</Text>
              <Text style={s.cardName}>KinouClean SAS</Text>
              <Text style={s.cardP}>
                Nettoyage professionnel à domicile{"\n"}
                Île-de-France{"\n"}
                SIRET 101 607 042 00013 · TVA FR93 101 607 042{"\n"}
                N° agrément SAP D3289580{"\n"}
                <Text style={s.muted}>contact@kinouclean.fr · 06 20 79 97 47</Text>
              </Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardH}>Client</Text>
              <Text style={s.cardName}>{clientNom}</Text>
              <Text style={s.cardP}>
                {clientAdresse}{"\n"}
                {clientTel}
                {data.client.email ? <Text style={s.muted}>{"\n"}{data.client.email}</Text> : null}
                {data.client.creneau ? <Text style={s.muted}>{"\n"}{data.client.creneau}</Text> : null}
              </Text>
            </View>
          </View>

          {/* Table des prestations */}
          <View style={s.thead}>
            <Text style={[s.th, s.colDesc]}>Description</Text>
            <Text style={[s.th, s.colQte]}>Qté</Text>
            <Text style={[s.th, s.colPu]}>Prix unit. HT</Text>
            <Text style={[s.th, s.colHt]}>Total HT</Text>
          </View>
          {rows.map((r, i) => (
            <View style={s.trow} key={i} wrap={false}>
              <View style={[s.td, s.colDesc]}>
                <Text style={s.pname}>{r.libelle}</Text>
                {r.chip ? <Text style={s.chip}>{r.chip}</Text> : null}
                <Text style={s.desc}>{r.description}</Text>
              </View>
              <Text style={[s.td, s.colQte]}>{r.qte}</Text>
              <Text style={[s.td, s.colPu]}>{formatEuro(r.puHT)}</Text>
              <Text style={[s.td, s.colHt]}>{formatEuro(r.ht)}</Text>
            </View>
          ))}

          {/* Totaux */}
          <View style={s.totalsWrap}>
            <View style={s.totals}>
              <View style={[s.totRow, s.totSub]}>
                <Text>Total HT</Text><Text>{formatEuro(totalHT)}</Text>
              </View>
              <View style={s.totRow}>
                <Text>TVA 10 %</Text><Text>{formatEuro(tva)}</Text>
              </View>
              <View style={[s.totRow, s.totTtc]}>
                <Text style={s.totTtcTxt}>Total TTC</Text><Text style={s.totTtcTxt}>{formatEuro(totalTTC)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Dispositif fiscal */}
        <View style={s.aici}>
          {dispositif === "credit" ? (
            <>
              <Text style={s.aiciH}>Crédit d'impôt Services à la Personne</Text>
              <Text style={s.aiciRac}>Coût réel après crédit d'impôt : {formatEuro(rac)}</Text>
              <Text style={s.aiciP}>
                Cette prestation ouvre droit au crédit d'impôt de 50 % (Art. 199 sexdecies du CGI). Vous réglez {formatEuro(totalTTC)} puis récupérez {formatEuro(rac)} lors de votre déclaration de revenus de l'année suivante, grâce à l'attestation fiscale que nous vous délivrons. Le paiement s'effectue uniquement à l'issue de la prestation.
              </Text>
            </>
          ) : (
            <>
              <Text style={s.aiciH}>Avance Immédiate — dispositif URSSAF</Text>
              <Text style={s.aiciRac}>Votre reste à charge : {formatEuro(rac)} <Text style={s.aiciRacSmall}>(soit 50 % du total)</Text></Text>
              <Text style={s.aiciP}>
                Grâce à l'Avance Immédiate URSSAF, vous ne réglez que 50 % du montant TTC, soit {formatEuro(rac)}. Le reste correspond au crédit d'impôt Services à la Personne et est versé directement par l'État à KinouClean : vous n'avancez rien et n'attendez aucun remboursement. Un lien d'inscription à l'Avance Immédiate vous sera envoyé ; la démarche prend moins de 5 minutes. Le paiement s'effectue uniquement à l'issue de la prestation.
              </Text>
            </>
          )}
        </View>

        {/* Mentions légales */}
        <View style={s.legal}>
          <Text style={s.legalH}>Mentions légales — Services à la Personne</Text>
          <View style={s.legalList}>
            {legalItems.map((t, i) => (
              <View style={s.legalLi} key={i}>
                <Text style={s.legalDot}>•</Text><Text>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Signatures */}
        <View style={s.signRow}>
          <View style={s.signBox}>
            <Text style={s.signT}>Bon pour accord — le client</Text>
            <Text style={s.signGood}>Date et signature précédées de la mention « Bon pour accord »</Text>
          </View>
          <View style={s.signBox}>
            <Text style={s.signT}>Pour KinouClean SAS</Text>
            <Text style={s.signGood}>L'équipe KinouClean</Text>
          </View>
        </View>

        {/* Pied */}
        <View style={s.foot}>
          <Text><Text style={s.footStrong}>KinouClean SAS</Text> — Île-de-France — SIRET 101 607 042 00013 — TVA FR93 101 607 042 — Organisme agréé SAP N° D3289580</Text>
          <Text>Devis N° {data.num} — établi en euros, sans engagement — valable 30 jours.</Text>
        </View>
      </Page>
    </Document>
  );
}

// Rend le devis en vrai PDF (Buffer). 100 % JS, fiable en serverless.
export async function renderDevisPdf(data: DevisData): Promise<Buffer> {
  return await renderToBuffer(<DevisDoc data={data} />);
}
