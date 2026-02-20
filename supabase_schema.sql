-- Magic AI Wizard (Supabase) - minimal schema
-- Run these in the Supabase SQL editor.

-- 1) Users profile table
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  membership text default 'trial',
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

-- 3) Phase 2A: user activity telemetry (sessions + tools used)
create table if not exists public.user_activity (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_start_at timestamptz not null default now(),
  tool_used text null
);

create index if not exists idx_user_activity_user_time on public.user_activity (user_id, session_start_at desc);
create index if not exists idx_user_activity_user_tool_time on public.user_activity (user_id, tool_used, session_start_at desc);

-- OPTIONAL (recommended): enable RLS and allow basic access patterns.
-- NOTE: tighten policies before going live with paid tiers.

alter table public.users enable row level security;
alter table public.app_suggestions enable row level security;
alter table public.user_activity enable row level security;

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

-- Users can read their own activity rows (optional; server uses service role)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_activity' and policyname='Users can read own activity') then
    create policy "Users can read own activity" on public.user_activity
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Anyone authenticated can insert a suggestion; admins can read all (admin handling is app-side).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_suggestions' and policyname='Users can insert suggestions') then
    create policy "Users can insert suggestions" on public.app_suggestions
      for insert with check (auth.uid() is not null);
  end if;
end $$;
