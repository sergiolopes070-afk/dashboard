-- ─────────────────────────────────────────────────────────────────────────────
-- SÉCURITÉ — Étape 3 : activer Row Level Security (RLS) sur toutes les tables.
--
-- CONTEXTE (audit) : l'application accède à Supabase UNIQUEMENT côté serveur,
-- via la clé service_role (voir src/lib/supabase.ts). La clé service_role
-- OUTREPASSE la RLS par design → l'application continue de fonctionner
-- normalement après activation. La RLS bloque uniquement la clé anon/publique
-- (non utilisée par l'app) : en cas de fuite de l'URL ou de la clé publique,
-- plus aucune lecture/écriture n'est possible sans policy explicite.
--
-- On active donc la RLS SANS créer de policy pour anon → verrouillage complet
-- de l'accès public, sans impact sur l'app.
--
-- ⚠️ À EXÉCUTER MANUELLEMENT dans Supabase :
--    Dashboard Supabase → SQL Editor → New query → coller ce fichier → Run.
-- Réversible : voir le bloc "ROLLBACK" en bas.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestataires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depenses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings     ENABLE ROW LEVEL SECURITY;

-- Aucune policy créée volontairement :
--   → rôle anon / public : AUCUN accès (lecture ni écriture).
--   → rôle service_role (utilisé par l'app) : accès complet (outrepasse la RLS).

-- Vérification (optionnelle) — doit renvoyer rowsecurity = true pour les 6 tables :
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('clients','prospects','prestations','prestataires','depenses','settings');

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (si besoin de revenir en arrière) :
-- ALTER TABLE public.clients      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.prospects    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.prestations  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.prestataires DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.depenses     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.settings     DISABLE ROW LEVEL SECURITY;
-- ─────────────────────────────────────────────────────────────────────────────
