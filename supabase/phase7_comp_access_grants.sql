-- Phase 7 — Complimentary access grants
-- Safe to run multiple times.
-- Purpose: allow manual, time-limited admin grants that override billing entitlements
-- without creating synthetic Stripe subscriptions.

create extension if not exists pgcrypto;

create table if not exists public.comp_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.users (id) on delete cascade,
  email text null,
  plan_key text not null references public.plan_catalog (plan_key),
  status text not null default 'active',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text null,
  granted_by text null,
  grant_reason text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  source_updated_at timestamptz null,
  constraint comp_access_grants_has_target check (user_id is not null or email is not null),
  constraint comp_access_grants_window check (ends_at > starts_at),
  constraint comp_access_grants_status check (status in ('active', 'expired', 'revoked', 'scheduled'))
);

create index if not exists idx_comp_access_grants_user_id on public.comp_access_grants (user_id);
create index if not exists idx_comp_access_grants_email on public.comp_access_grants (lower(email));
create index if not exists idx_comp_access_grants_status on public.comp_access_grants (status);
create index if not exists idx_comp_access_grants_window on public.comp_access_grants (starts_at, ends_at);

create or replace function public.maw_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists maw_comp_access_grants_touch_updated_at on public.comp_access_grants;
create trigger maw_comp_access_grants_touch_updated_at
before update on public.comp_access_grants
for each row execute function public.maw_touch_updated_at();

alter table public.comp_access_grants disable row level security;

comment on table public.comp_access_grants is 'Manual complimentary access grants that temporarily override paid billing entitlements.';
comment on column public.comp_access_grants.plan_key is 'Grant plan to apply while the record is active, typically professional for raffle prizes or influencer access.';
comment on column public.comp_access_grants.status is 'Use active for live grants; revoked to terminate early; expired for historical bookkeeping.';
