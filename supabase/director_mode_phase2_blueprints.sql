-- Director Mode Phase 2 — Blueprints storage
-- Creates a table to persist strict Director Mode blueprint JSON for each user.
-- Safe to run multiple times.

create table if not exists public.maw_director_blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inputs jsonb not null,
  blueprint_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists maw_director_blueprints_user_id_idx
  on public.maw_director_blueprints(user_id);

alter table public.maw_director_blueprints enable row level security;

-- RLS: users can only access their own rows
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='maw_director_blueprints'
      and policyname='maw_director_blueprints_select_own'
  ) then
    create policy maw_director_blueprints_select_own
      on public.maw_director_blueprints
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='maw_director_blueprints'
      and policyname='maw_director_blueprints_insert_own'
  ) then
    create policy maw_director_blueprints_insert_own
      on public.maw_director_blueprints
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;
