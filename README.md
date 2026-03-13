# KinouClean Dashboard

Dashboard de gestion indépendant pour KinouClean — connecté à Google Sheets.

## Fonctionnalités

- **Tableau de bord** : stats CA, clients, prestations, alertes urgentes, graphiques CA mensuel
- **Prestations** : liste complète avec filtres par statut et recherche
- **Prestataires** : annuaire de l'équipe avec liens WhatsApp et email
- **Clients** : fiche client avec historique et CA total
- **Devis** : liste des devis PDF générés avec accès direct
- **Historique** : prestations archivées
- **Configuration** : guide pas-à-pas pour connecter Google Sheets

## Démarrage rapide

```bash
cp .env.local.example .env.local
# Remplir les variables dans .env.local (voir page /configuration)
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

## Variables d'environnement requises

```env
GOOGLE_SPREADSHEET_ID=1AbCdEfGhIjK...
GOOGLE_SERVICE_ACCOUNT_KEY=eyJhbGci...   # JSON encodé en base64
```

Voir le guide complet sur la page `/configuration` du dashboard.

## Déploiement Vercel (recommandé)

1. Push ce repo sur GitHub
2. Importer sur [vercel.com](https://vercel.com)
3. Ajouter `GOOGLE_SPREADSHEET_ID` et `GOOGLE_SERVICE_ACCOUNT_KEY` dans les Settings
4. Deploy — URL publique générée automatiquement

## Structure Google Sheets attendue

| Feuille | Usage |
|---------|-------|
| `Clients – Prestationss` | Feuille principale des prestations |
| `Prestataires` | Liste des prestataires (Nom, Email, Tél) |
| `Historique Prestations` | Prestations archivées |

---

**KinouClean** · Gomes Lopes Sergio · kinouclean@gmail.com · 06 16 04 62 19
