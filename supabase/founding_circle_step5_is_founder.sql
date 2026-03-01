-- Founders Circle Step 5 — Canonical is_founder flag (backward compatible)
-- Adds is_founder boolean to public.users, backfills from founding_circle_member, and indexes it.

alter table public.users
add column if not exists is_founder boolean not null default false;

-- Backfill: anyone previously flagged as founding_circle_member becomes is_founder
update public.users
set is_founder = true
where coalesce(founding_circle_member, false) = true
  and coalesce(is_founder, false) = false;

create index if not exists idx_users_is_founder
on public.users (is_founder);
