-- PHASE 3 — Stripe Live Mode Hardening
--
-- Goals:
-- 1) Ensure Stripe linkage columns exist
-- 2) Ensure pricing_lock is immutable once set (hard lock)
-- 3) Keep founders from being accidentally downgraded by webhook sync
--
-- Safe to run multiple times.

alter table public.users
  add column if not exists stripe_customer_id text;

alter table public.users
  add column if not exists stripe_subscription_id text;

alter table public.users
  add column if not exists stripe_price_id text;

alter table public.users
  add column if not exists stripe_status text;

alter table public.users
  add column if not exists stripe_current_period_end timestamptz;

-- Enforce that pricing_lock, once set, cannot be unset.
create or replace function public.maw_enforce_pricing_lock()
returns trigger
language plpgsql
as $$
begin
  if old.pricing_lock is not null and new.pricing_lock is null then
    new.pricing_lock := old.pricing_lock;
  end if;

  -- Prevent founders from being downgraded accidentally.
  if old.founding_circle_member is true and new.founding_circle_member is not true then
    new.founding_circle_member := true;
    if new.founding_joined_at is null then
      new.founding_joined_at := old.founding_joined_at;
    end if;
    if new.founding_source is null then
      new.founding_source := old.founding_source;
    end if;
    if new.founding_bucket is null then
      new.founding_bucket := old.founding_bucket;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists maw_enforce_pricing_lock_trg on public.users;
create trigger maw_enforce_pricing_lock_trg
before update on public.users
for each row
execute function public.maw_enforce_pricing_lock();
