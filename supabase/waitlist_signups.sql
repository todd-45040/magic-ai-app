-- Magic AI Wizard — Waitlist / Pre-launch Email Capture
-- Run this in Supabase SQL editor (or via migration) before enabling the Day-7 Email Capture UI.

create table if not exists public.maw_waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  email text not null,
  email_lower text not null,
  source text,
  meta jsonb,
  ip_hash text,
  user_agent text
);

create unique index if not exists maw_waitlist_signups_email_lower_uidx
  on public.maw_waitlist_signups (email_lower);

-- Optional: small performance index for admin review screens later
create index if not exists maw_waitlist_signups_created_at_idx
  on public.maw_waitlist_signups (created_at desc);

alter table public.maw_waitlist_signups enable row level security;

-- No policies required because inserts are performed via Service Role (server-side API).
-- If you later want to allow anon inserts directly (not recommended), add an INSERT policy.
