-- ============================================================
--  KINOUCLEAN – Reset + Recréation propre
-- ============================================================

-- Supprime les tables existantes (dans le bon ordre)
DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS devis CASCADE;
DROP TABLE IF EXISTS prestations CASCADE;
DROP TABLE IF EXISTS prestataires CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS depenses CASCADE;

-- ─── 1. CLIENTS ──────────────────────────────────────────────
CREATE TABLE clients (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  prenom         TEXT NOT NULL,
  nom            TEXT NOT NULL,
  tel            TEXT,
  email          TEXT,
  adresse        TEXT,
  source         TEXT,
  statut         TEXT DEFAULT 'NOUVEAU',
  tags           TEXT[],
  notes          TEXT,
  total_ca       NUMERIC DEFAULT 0,
  nb_prestations INT DEFAULT 0
);

-- ─── 2. PRESTATAIRES ─────────────────────────────────────────
CREATE TABLE prestataires (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  nom        TEXT NOT NULL,
  email      TEXT,
  tel_wa     TEXT,
  actif      BOOLEAN DEFAULT TRUE
);

-- ─── 3. PRESTATIONS ──────────────────────────────────────────
CREATE TABLE prestations (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  client_id          UUID REFERENCES clients(id) ON DELETE SET NULL,
  prestataire_id     UUID REFERENCES prestataires(id) ON DELETE SET NULL,
  type_prestation    TEXT NOT NULL,
  quantite           INT DEFAULT 1,
  adresse            TEXT,
  date_intervention  DATE,
  heure_intervention TIME,
  prix               NUMERIC,
  message            TEXT,
  commentaire        TEXT,
  statut             TEXT DEFAULT 'NOUVEAU',
  statut_presta      TEXT DEFAULT 'EN ATTENTE',
  mail_client_envoye BOOLEAN DEFAULT FALSE,
  rappel_j1_envoye   BOOLEAN DEFAULT FALSE,
  devis_genere       BOOLEAN DEFAULT FALSE,
  devis_url          TEXT,
  lien_wa            TEXT,
  calendar_event_id  TEXT,
  commission         DECIMAL DEFAULT 0,
  commission_type    TEXT DEFAULT 'percent',
  mode_paiement      TEXT DEFAULT NULL,  -- Espèces / Lien de paiement / Virement bancaire / Chèque / Carte sur place
  archive            BOOLEAN DEFAULT FALSE
);

-- ─── 4. DEVIS ────────────────────────────────────────────────
CREATE TABLE devis (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  numero         TEXT UNIQUE NOT NULL,
  client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,
  prestation_id  UUID REFERENCES prestations(id) ON DELETE SET NULL,
  montant        NUMERIC NOT NULL,
  statut         TEXT DEFAULT 'EN ATTENTE',
  validite_jours INT DEFAULT 15,
  pdf_url        TEXT,
  notes          TEXT
);

-- ─── 5. LOGS ─────────────────────────────────────────────────
CREATE TABLE logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  type          TEXT NOT NULL,
  action        TEXT NOT NULL,
  detail        TEXT,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  prestation_id UUID REFERENCES prestations(id) ON DELETE SET NULL,
  succes        BOOLEAN DEFAULT TRUE,
  erreur        TEXT
);

-- ─── 6. DÉPENSES ─────────────────────────────────────────────
CREATE TABLE depenses (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom          TEXT NOT NULL,
  categorie    TEXT NOT NULL DEFAULT 'Autre',
  montant      NUMERIC NOT NULL DEFAULT 0,
  type         TEXT NOT NULL DEFAULT 'ponctuel' CHECK (type IN ('ponctuel', 'mensuel')),
  date         DATE NOT NULL,
  notes        TEXT,
  document_url TEXT,
  document_nom TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 7. BUCKET STORAGE ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('depenses', 'depenses', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 8. DONNÉES DE TEST ──────────────────────────────────────
INSERT INTO prestataires (nom, email, tel_wa) VALUES
('Amina K.',  'amina@kinouclean.fr',  '33600000001'),
('Carlos M.', 'carlos@kinouclean.fr', '33600000002'),
('Fatou D.',  'fatou@kinouclean.fr',  '33600000003');

INSERT INTO clients (prenom, nom, tel, email, adresse, source, statut, tags, total_ca, nb_prestations) VALUES
('Marie',       'Dubois',  '0612345678', 'marie.dubois@gmail.com',   '15 rue Lecourbe, 75015',         'Formulaire web',   'VIP',        ARRAY['Régulier','Ponctuel'], 480, 4),
('Jean-Pierre', 'Martin',  '0698765432', 'jp.martin@orange.fr',      '8 av. Émile Zola, 75015',        'Recommandation',   'NOUVEAU',    ARRAY['Après travaux'],       280, 1),
('Sophie',      'Bernard', '0711223344', 'sophie.bernard@gmail.com', '42 bd Garibaldi, 75015',         'Google',           'ACTIF',      ARRAY['Bureau','Régulier'],   285, 3),
('Isabelle',    'Moreau',  '0766554433', 'i.moreau@sfr.fr',          '27 rue de la Convention, 75015', 'Bouche à oreille', 'À RELANCER', ARRAY['Fin de bail'],         320, 1);

-- ─── 9. SÉCURITÉ RLS ─────────────────────────────────────────
ALTER TABLE clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestataires ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE devis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE depenses     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acces authentifie" ON clients      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acces authentifie" ON prestataires FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acces authentifie" ON prestations  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acces authentifie" ON devis        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acces authentifie" ON logs         FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acces authentifie" ON depenses     FOR ALL USING (auth.role() = 'authenticated');

-- ✅ TERMINÉ – tu dois voir 6 tables dans Éditeur de table

-- ─── MIGRATIONS (à exécuter si la table existe déjà) ─────────────────────────
-- Ajoute le champ mode de paiement sur une base existante :
-- ALTER TABLE prestations ADD COLUMN IF NOT EXISTS mode_paiement TEXT DEFAULT NULL;
