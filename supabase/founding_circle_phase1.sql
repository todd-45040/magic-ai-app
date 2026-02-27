-- Magic AI Wizard — Founding Circle Framework (Phase 1)
-- Date: 2026-02-27
-- Run in Supabase SQL editor (or your migration system).

-- ✅ 1) Identity layer on public.users
alter table public.users
  add column if not exists founding_circle_member boolean not null default false;

alter table public.users
  add column if not exists founding_joined_at timestamptz;

alter table public.users
  add column if not exists founding_source text;

-- Optional: pricing lock string stored on the user for later Stripe reconciliation.
alter table public.users
  add column if not exists pricing_lock text;

create index if not exists users_founding_circle_member_idx
  on public.users (founding_circle_member)
  where founding_circle_member = true;


-- ✅ 2) Lead capture table (for not-signed-in joins, and reconciliation later)
create table if not exists public.maw_founding_circle_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  email text not null,
  email_lower text not null,
  source text,
  meta jsonb,
  ip_hash text,
  user_agent text,

  -- If/when this lead becomes an authenticated user
  converted_to_user boolean not null default false,
  converted_user_id uuid null references auth.users (id) on delete set null
);

create unique index if not exists maw_founding_circle_leads_email_lower_uidx
  on public.maw_founding_circle_leads (email_lower);

create index if not exists maw_founding_circle_leads_created_at_idx
  on public.maw_founding_circle_leads (created_at desc);

alter table public.maw_founding_circle_leads enable row level security;
-- No policies required because writes are performed server-side via Service Role.


-- ✅ 3) Simple email drip queue (Vercel Cron hits /api/emailDrip)
create table if not exists public.maw_email_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  send_at timestamptz not null,
  to_email text not null,
  template_key text not null,
  payload jsonb,
  status text not null default 'queued',
  sent_at timestamptz,
  last_error text
);

create index if not exists maw_email_queue_send_at_idx
  on public.maw_email_queue (send_at asc)
  where status = 'queued';

create index if not exists maw_email_queue_to_email_idx
  on public.maw_email_queue (to_email);

alter table public.maw_email_queue enable row level security;
-- No policies required because writes/reads are performed server-side via Service Role.
