-- Magic AI Wizard (Supabase) - bootstrap schema only
--
-- IMPORTANT:
-- This file is no longer the complete production schema for the app.
-- It remains as a minimal bootstrap reference for the earliest local/dev tables.
--
-- For the current operational schema map, see:
--   docs/SUPABASE_SCHEMA_CURRENT.md
-- and the phase/migration SQL files under:
--   /supabase
--   /supabase/migrations
--
-- Run these in the Supabase SQL editor only when you want the minimal bootstrap layer.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  membership text default 'free',
  is_admin boolean default false,
  generation_count integer default 0,
  last_reset_date timestamptz default now(),
  trial_end_date bigint null
);

-- 2) App suggestions
create table if not exists public.app_suggestions (
  id text primary key,
  type text not null,
  content text not null,
  timestamp bigint not null,
  status text default 'new',
  user_id uuid null references auth.users (id) on delete set null,
  user_email text null
);

-- OPTIONAL (recommended): enable RLS and allow basic access patterns.
-- NOTE: tighten policies before going live with paid tiers.

alter table public.users enable row level security;
alter table public.app_suggestions enable row level security;

-- Users can read/write their own profile row
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='Users can read own profile') then
    create policy "Users can read own profile" on public.users
      for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='Users can update own profile') then
    create policy "Users can update own profile" on public.users
      for update using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='Users can insert own profile') then
    create policy "Users can insert own profile" on public.users
      for insert with check (auth.uid() = id);
  end if;
end $$;

-- Anyone authenticated can insert a suggestion; admins can read all (admin handling is app-side).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_suggestions' and policyname='Users can insert suggestions') then
    create policy "Users can insert suggestions" on public.app_suggestions
      for insert with check (auth.uid() is not null);
  end if;
end $$;
