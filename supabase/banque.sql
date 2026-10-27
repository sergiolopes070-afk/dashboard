-- ─────────────────────────────────────────────────────────────────────────────
-- Relevés bancaires (Qonto / Revolut) — section privée du tableau de bord.
-- À coller dans Supabase → SQL Editor → Run. Idempotent (relançable sans risque).
--
-- RLS activée SANS aucune policy : les clés anon/authenticated n'ont AUCUN accès.
-- Seul le serveur (clé service_role, qui contourne la RLS) lit/écrit ces tables.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.banque_imports (
  id           uuid primary key default gen_random_uuid(),
  compte       text,
  fichier      text,
  nb_lignes    int,
  nb_nouvelles int,
  created_at   timestamptz not null default now()
);

create table if not exists public.banque_operations (
  id           uuid primary key default gen_random_uuid(),
  compte       text not null check (compte in ('qonto', 'revolut')),
  date         date not null,
  libelle      text not null,
  contrepartie text,
  montant      numeric(12,2) not null,          -- négatif = sortie
  devise       text default 'EUR',
  categorie    text,
  interne      boolean not null default false,  -- virement entre mes comptes
  note         text,
  empreinte    text not null unique,            -- anti-doublon
  import_id    uuid references public.banque_imports(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Colonnes ajoutées (relançable : sans effet si elles existent déjà).
alter table public.banque_operations add column if not exists type_op         text;                          -- type banque (Revolut : CARD_PAYMENT, TRANSFER…)
alter table public.banque_operations add column if not exists interne_suggere boolean not null default false; -- appariement à confirmer
alter table public.banque_operations add column if not exists paire_id        uuid;                          -- même valeur sur les 2 lignes d'un virement apparié
alter table public.banque_operations add column if not exists manuel          boolean not null default false; -- modifiée à la main

create index if not exists banque_operations_paire_id_idx  on public.banque_operations (paire_id);
create index if not exists banque_operations_date_idx      on public.banque_operations (date);
create index if not exists banque_operations_compte_idx    on public.banque_operations (compte);
create index if not exists banque_operations_import_id_idx on public.banque_operations (import_id);

create table if not exists public.banque_regles (
  id         uuid primary key default gen_random_uuid(),
  motif      text not null unique,   -- mot-clé en minuscules cherché dans libellé / contrepartie
  categorie  text not null,
  interne    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.banque_imports    enable row level security;
alter table public.banque_operations enable row level security;
alter table public.banque_regles     enable row level security;

-- Ceinture + bretelles : aucun droit pour les rôles publics de l'API.
revoke all on public.banque_imports    from anon, authenticated;
revoke all on public.banque_operations from anon, authenticated;
revoke all on public.banque_regles     from anon, authenticated;
