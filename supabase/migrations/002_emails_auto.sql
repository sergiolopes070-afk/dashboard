-- ─────────────────────────────────────────────────────────────────────────────
-- EMAILS AUTOMATIQUES — colonnes de suivi (anti-doublon).
--
-- Sans ces colonnes, impossible de savoir ce qui a déjà été envoyé → risque
-- d'envoyer plusieurs fois le même email au même client. Elles sont la garantie
-- anti-spam du système.
--
-- ⚠️ À EXÉCUTER dans Supabase : SQL Editor → New query → coller CE CONTENU → Run.
--    (Coller le texte ci-dessous, pas le chemin du fichier.)
-- ─────────────────────────────────────────────────────────────────────────────

-- Niveau de relance devis déjà envoyé : 0 = aucune, 1 = J+3, 2 = J+5, 3 = J+7.
ALTER TABLE public.prestations
  ADD COLUMN IF NOT EXISTS relance_devis_niveau INT DEFAULT 0;

-- Demande d'avis déjà envoyée (48h après la prestation) → une seule fois.
ALTER TABLE public.prestations
  ADD COLUMN IF NOT EXISTS avis_demande_envoyee BOOLEAN DEFAULT false;

-- Permet de désactiver manuellement l'envoi auto de la demande d'avis
-- pour un client précis (ex. client mécontent).
ALTER TABLE public.prestations
  ADD COLUMN IF NOT EXISTS avis_auto_annule BOOLEAN DEFAULT false;

-- Vérification (optionnel) — doit renvoyer les 3 colonnes :
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'prestations'
--   AND column_name IN ('relance_devis_niveau','avis_demande_envoyee','avis_auto_annule');
