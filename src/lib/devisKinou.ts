// ─────────────────────────────────────────────────────────────────────────────
// Générateur de devis KinouClean (modèle premium A4, conforme SAP).
// Produit un HTML autonome prêt à imprimer en PDF. Calculs TVA 10% à partir du
// TTC, reste à charge (avance immédiate) = TTC × 50%. Voir le cahier des charges
// fourni par l'utilisateur (règles §2 à §10).
// ─────────────────────────────────────────────────────────────────────────────

export interface DevisLigne { typePresta: string; detail?: string; prixTTC: number; qte?: number }
export interface DevisClient { nom?: string; adresse?: string; tel?: string; email?: string; creneau?: string }
export interface DevisData {
  num: string;
  dateEmission: string;   // JJ/MM/AAAA
  dateValidite: string;   // JJ/MM/AAAA (+30j)
  client: DevisClient;
  lignes: DevisLigne[];
  dispositif?: "avance" | "credit"; // défaut: avance
}

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";
const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Numéro de devis KC-AAAAMMJJ-NNN
export function numeroDevis(compteur: number, d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `KC-${y}${m}${j}-${String(compteur).padStart(3, "0")}`;
}

export function dateFr(d = new Date()): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
export function dateFrPlus(days: number, d = new Date()): string {
  const x = new Date(d); x.setDate(x.getDate() + days); return dateFr(x);
}

// Casse propre : "laura molano" → "Laura Molano" (garde les civilités).
export function cassepropre(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\b([a-zà-ÿ])/g, c => c.toUpperCase());
}

const DESC_STD = "Nettoyage en profondeur à domicile : aspiration, injection-extraction à l'eau chaude (HWE) avec extraction de l'humidité et détachage ciblé. Le textile reste légèrement humide et sèche à l'air libre en quelques heures.";

// Montant en euros français SANS symbole : 90 → "90,00" (pour composer un texte).
export const eurNombre = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Montant en euros français AVEC symbole : 90 → "90,00 €".
export const formatEuro = (n: number) => eur(n);

// Catalogue : libellé + chip + description selon le type + détail saisi.
export function mapLigne(typePresta: string, detail: string): { libelle: string; chip: string; description: string } {
  const t = (typePresta || "").toLowerCase();
  const d = (detail || "").trim();
  const dl = d.toLowerCase();
  const places = (dl.match(/(\d+)\s*places?/) || [])[1];
  const soin = "Soin Complet";

  if (t.includes("canap")) {
    let suffix = "";
    if (dl.includes("angle")) suffix = " d'angle";
    else if (dl.includes("convertible")) suffix = " convertible";
    else if (places) suffix = ` — ${places} places`;
    return { libelle: `Nettoyage canapé${suffix}`, chip: soin, description: DESC_STD };
  }
  if (t.includes("matelas") || t.includes("literie")) {
    const taille = (d.match(/\d+\s*[x×]\s*\d+/) || [])[0];
    return { libelle: `Nettoyage matelas${taille ? ` — ${taille}` : ""}`, chip: soin, description: DESC_STD };
  }
  if (t.includes("fauteuil")) return { libelle: "Nettoyage fauteuil", chip: soin, description: DESC_STD };
  if (t.includes("chaise")) return { libelle: "Nettoyage chaise (à l'unité)", chip: "", description: DESC_STD };
  if (t.includes("pouf")) return { libelle: "Nettoyage pouf", chip: "", description: DESC_STD };
  if (t.includes("tapis") || t.includes("moquette")) {
    const surf = (d.match(/[\d.,]+\s*m²?/) || [])[0];
    return { libelle: `Nettoyage tapis${surf ? ` — ${surf}` : ""}`, chip: soin, description: DESC_STD };
  }
  if (t.includes("si") && (t.includes("auto") || t.includes("véhic") || t.includes("vehic") || t.includes("voiture"))) {
    return { libelle: "Nettoyage sièges auto", chip: soin, description: DESC_STD };
  }
  if (t.includes("vitre")) {
    const nb = (d.match(/\d+/) || [])[0];
    return { libelle: `Nettoyage de vitres à domicile${nb ? ` — ${nb} vitres` : ""}`, chip: "", description: "Nettoyage des vitres à domicile : intérieur et extérieur accessibles, encadrements essuyés." };
  }
  // Par défaut : on garde le type tel quel.
  return { libelle: typePresta || "Prestation", chip: soin, description: DESC_STD };
}

// Phrase courte de la prestation pour un email : « canapé d'angle », « matelas — 140×190 ».
// Dérivée du libellé catalogue, sans le préfixe « Nettoyage ».
export function prestationPhrase(typePresta: string, detail = ""): string {
  const { libelle } = mapLigne(typePresta, detail);
  return libelle.replace(/^Nettoyage\s+(de\s+|d')?/i, "").trim().toLowerCase() || "prestation";
}

export function buildDevisHtml(data: DevisData): string {
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
    return `<tr>
      <td><span class="pname">${esc(libelle)}</span>${chip ? `<span class="chip">${esc(chip)}</span>` : ""}
        <div class="desc">${esc(description)}</div></td>
      <td class="r">${qte}</td><td class="r">${eur(puHT)}</td><td class="r">${eur(ht)}</td>
    </tr>`;
  }).join("\n");

  const tva = totalTTC - totalHT;
  const rac = totalTTC * 0.5;
  const moitie = totalTTC * 0.5;

  const clientNom = data.client.nom ? cassepropre(data.client.nom) : "Client";
  const clientAdresse = data.client.adresse ? esc(data.client.adresse) : "Adresse : à confirmer";
  const clientTel = data.client.tel ? esc(data.client.tel) : "Téléphone : à confirmer";
  const clientEmail = esc(data.client.email || "");
  const clientCreneau = esc(data.client.creneau || "");

  const aici = dispositif === "credit"
    ? `<div class="aici">
        <h4>Crédit d'impôt Services à la Personne</h4>
        <div class="rac">Coût réel après crédit d'impôt : ${eur(moitie)}</div>
        <p>Cette prestation ouvre droit au <strong>crédit d'impôt de 50&nbsp;%</strong> (Art. 199 sexdecies du CGI). Vous réglez ${eur(totalTTC)} puis récupérez ${eur(moitie)} lors de votre déclaration de revenus de l'année suivante, grâce à l'attestation fiscale que nous vous délivrons. Le paiement s'effectue uniquement à l'issue de la prestation.</p>
      </div>`
    : `<div class="aici">
        <h4>Avance Immédiate — dispositif URSSAF</h4>
        <div class="rac">Votre reste à charge : ${eur(rac)} <small>(soit 50&nbsp;% du total)</small></div>
        <p>Grâce à l'<strong>Avance Immédiate URSSAF</strong>, vous ne réglez que 50&nbsp;% du montant TTC, soit <strong>${eur(rac)}</strong>. Le reste correspond au crédit d'impôt Services à la Personne et est versé directement par l'État à KinouClean : vous n'avancez rien et n'attendez aucun remboursement. Un lien d'inscription à l'Avance Immédiate vous sera envoyé ; la démarche prend moins de 5 minutes. Le paiement s'effectue uniquement à l'issue de la prestation.</p>
      </div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Devis KinouClean - ${esc(data.num)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Jost:wght@300;400;500;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 0; }
  html, body { font-family: 'Jost', Arial, sans-serif; color: #1a2942; font-size: 12px; line-height: 1.5; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; position: relative; padding-bottom: 8mm; }
  .band { background: #1a2942; color: #fff; padding: 26px 32px 22px; display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { display: flex; gap: 14px; align-items: flex-start; }
  .badge { width: 46px; height: 46px; border-radius: 50%; border: 1.5px solid #c17f3e; display: flex; align-items: center; justify-content: center; color: #c17f3e; font-family: 'Playfair Display', serif; font-size: 20px; flex-shrink: 0; }
  .brand h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 600; letter-spacing: .3px; }
  .brand .tag { color: #c8b48f; font-weight: 400; letter-spacing: 2.5px; text-transform: uppercase; font-size: 8.5px; margin-top: 5px; }
  .docmeta { text-align: right; }
  .docmeta .kick { color: #c8b48f; letter-spacing: 2.5px; text-transform: uppercase; font-size: 8px; }
  .docmeta .label { font-family: 'Playfair Display', Georgia, serif; font-size: 34px; font-weight: 600; color: #c17f3e; line-height: 1; margin-top: 4px; }
  .docmeta .num { font-size: 11px; color: #d7deea; margin-top: 8px; }
  .docmeta .date { font-size: 10.5px; color: #aab4c6; margin-top: 2px; }
  .tagbar { background: #16223a; color: #9fb0c9; display: flex; padding: 9px 32px; gap: 26px; font-size: 8.2px; letter-spacing: 1px; text-transform: uppercase; }
  .tagbar span { color: #c17f3e; }
  .content { padding: 26px 32px 0; }
  .row { display: flex; gap: 24px; margin-bottom: 22px; }
  .card { flex: 1; }
  .card h3 { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #c17f3e; margin-bottom: 8px; border-bottom: 1px solid #e7d9c5; padding-bottom: 5px; }
  .card .nm { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 600; margin-bottom: 5px; }
  .card p { font-size: 11px; line-height: 1.65; color: #46536b; }
  .muted { color: #8b95a6; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items thead th { background: #1a2942; color: #fff; text-align: left; padding: 10px 12px; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; font-weight: 500; }
  table.items thead th.r, table.items tbody td.r { text-align: right; }
  table.items tbody td { padding: 11px 12px; border-bottom: 1px solid #eef1f5; font-size: 11.5px; vertical-align: top; }
  table.items .pname { font-weight: 500; }
  table.items .chip { display: inline-block; font-size: 8px; letter-spacing: .5px; text-transform: uppercase; color: #c17f3e; border: 1px solid #e3cfb2; border-radius: 10px; padding: 1px 7px; margin-left: 6px; vertical-align: middle; }
  table.items .desc { color: #8b95a6; font-size: 10px; margin-top: 3px; line-height: 1.5; }
  .totals { display: flex; justify-content: flex-end; margin-top: 16px; }
  .totals table { width: 60%; }
  .totals td { padding: 6px 12px; font-size: 11.5px; }
  .totals td.r { text-align: right; }
  .totals tr.sub td { border-top: 1px solid #eef1f5; }
  .totals tr.ttc td { background: #1a2942; color: #fff; font-weight: 600; font-size: 15px; font-family: 'Playfair Display', serif; }
  .totals tr.ttc td:first-child { border-radius: 6px 0 0 6px; }
  .totals tr.ttc td:last-child { border-radius: 0 6px 6px 0; }
  .aici { margin: 20px 32px 0; background: #eef3fb; border: 1px solid #c5d5ee; border-radius: 8px; padding: 15px 18px; }
  .aici h4 { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #2f6bbf; margin-bottom: 10px; }
  .aici .rac { font-family: 'Playfair Display', serif; font-size: 22px; color: #1a2942; }
  .aici .rac small { font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 500; color: #5a6373; }
  .aici p { font-size: 10.5px; color: #46536b; margin-top: 8px; line-height: 1.65; }
  .legal { margin: 18px 32px 0; padding: 14px 16px; background: #f7f8fa; border-radius: 8px; }
  .legal h4 { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #1a2942; margin-bottom: 9px; }
  .legal ul { list-style: none; columns: 2; column-gap: 26px; }
  .legal li { font-size: 9.6px; color: #5a6373; padding: 2px 0 2px 14px; position: relative; break-inside: avoid; }
  .legal li::before { content: ''; position: absolute; left: 0; top: 6px; width: 5px; height: 5px; background: #c17f3e; border-radius: 50%; }
  .sign { display: flex; gap: 24px; margin: 18px 32px 0; }
  .sign .box { flex: 1; border: 1px dashed #c7cdd8; border-radius: 8px; padding: 12px 16px; min-height: 70px; }
  .sign .box .t { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #8b95a6; }
  .sign .box .good { font-size: 10px; color: #8b95a6; margin-top: 4px; }
  .foot { margin-top: 20px; padding: 13px 32px; border-top: 2px solid #c17f3e; background: #1a2942; color: #aab4c6; font-size: 9px; text-align: center; line-height: 1.7; }
  .foot strong { color: #fff; }
</style>
</head>
<body>
<div class="page">
  <div class="band">
    <div class="brand">
      <div class="badge">KC</div>
      <div>
        <h1>KinouClean</h1>
        <div class="tag">Nettoyage professionnel à domicile</div>
      </div>
    </div>
    <div class="docmeta">
      <div class="kick">Document commercial</div>
      <div class="label">DEVIS</div>
      <div class="num">N° ${esc(data.num)}</div>
      <div class="date">Émis le ${esc(data.dateEmission)}</div>
      <div class="date">Valable jusqu'au ${esc(data.dateValidite)}</div>
    </div>
  </div>

  <div class="tagbar">
    <div><span>&#10003;</span> Organisme agréé SAP — N° D3289580</div>
    <div><span>&#10003;</span> Crédit d'impôt 50 % — Art. 199 sexdecies CGI</div>
    <div><span>&#10003;</span> Avance Immédiate — Art. L.7231-1 C. travail</div>
  </div>

  <div class="content">
    <div class="row">
      <div class="card">
        <h3>Prestataire</h3>
        <div class="nm">KinouClean SAS</div>
        <p>Nettoyage professionnel à domicile<br>
        Île-de-France<br>
        SIRET 101 607 042 00013 · TVA FR93 101 607 042<br>
        N° agrément SAP D3289580<br>
        <span class="muted">contact@kinouclean.fr · 06 20 79 97 47</span></p>
      </div>
      <div class="card">
        <h3>Client</h3>
        <div class="nm">${esc(clientNom)}</div>
        <p>${clientAdresse}<br>
        ${clientTel}<br>
        <span class="muted">${clientEmail}</span>${clientCreneau ? `<br><span class="muted">${clientCreneau}</span>` : ""}</p>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Description</th>
          <th class="r">Qté</th>
          <th class="r">Prix unit. HT</th>
          <th class="r">Total HT</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr class="sub"><td>Total HT</td><td class="r">${eur(totalHT)}</td></tr>
        <tr><td>TVA 10 %</td><td class="r">${eur(tva)}</td></tr>
        <tr class="ttc"><td>Total TTC</td><td class="r">${eur(totalTTC)}</td></tr>
      </table>
    </div>
  </div>

  ${aici}

  <div class="legal">
    <h4>Mentions légales — Services à la Personne</h4>
    <ul>
      <li>Organisme agréé SAP N° D3289580 (habilitation 02/03/2026)</li>
      <li>Crédit d'impôt 50 % — Art. 199 sexdecies du CGI</li>
      <li>Avance Immédiate éligible — Art. L.7231-1 du Code du travail</li>
      <li>Attestation fiscale CERFA délivrée annuellement</li>
      <li>Assurance RC Pro Coover x Hiscox</li>
      <li>Paiement à l'issue de la prestation, jamais en avance</li>
    </ul>
  </div>

  <div class="sign">
    <div class="box">
      <div class="t">Bon pour accord — le client</div>
      <div class="good">Date et signature précédées de la mention « Bon pour accord »</div>
    </div>
    <div class="box">
      <div class="t">Pour KinouClean SAS</div>
      <div class="good">L'équipe KinouClean</div>
    </div>
  </div>

  <div class="foot">
    <strong>KinouClean SAS</strong> — Île-de-France — SIRET 101 607 042 00013 — TVA FR93 101 607 042 — Organisme agréé SAP N° D3289580<br>
    Devis N° ${esc(data.num)} — établi en euros, sans engagement — valable 30 jours.
  </div>
</div>
</body>
</html>`;
}
