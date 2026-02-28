-- Magic AI Wizard — Founding Circle Buckets + Atomic Limits (Step 1)
-- Date: 2026-02-27
-- Purpose:
--   Adds a strict founder allocation bucket enum and an atomic server-side claim function.
--   Enforces:
--     - ADMC allocation cap: 75
--     - Total founders cap: 100
--
-- Notes:
--   - Uses pg_advisory_xact_lock() to prevent race conditions.
--   - The claim function is intended to be called from server-side API routes only
--     (service-role Supabase client).
--   - This does NOT require RLS policies because the function executes with invoker rights;
--     call it only with service role. (Alternatively, you may mark it SECURITY DEFINER and
--     lock down EXECUTE privileges; keep it simple for now.)

-- 1) Enum type
do $$
begin
  if not exists (select 1 from pg_type where typname = 'founding_bucket_enum') then
    create type public.founding_bucket_enum as enum ('admc_2026', 'reserve_2026');
  end if;
end $$;

-- 2) Add bucket columns
alter table public.users
  add column if not exists founding_bucket public.founding_bucket_enum;

alter table public.maw_founding_circle_leads
  add column if not exists founding_bucket public.founding_bucket_enum;

create index if not exists users_founding_bucket_idx
  on public.users (founding_bucket);

create index if not exists founding_leads_bucket_idx
  on public.maw_founding_circle_leads (founding_bucket);

-- 3) Atomic claim function (prevents race conditions)
create or replace function public.maw_claim_founding_bucket(
  p_user_id uuid,
  p_bucket public.founding_bucket_enum
)
returns table(ok boolean, reason text, admc_count int, total_count int)
language plpgsql
as $$
declare
  v_total int := 0;
  v_admc int := 0;
  v_updated int := 0;
begin
  -- One lock for all founder-claim operations (transaction-scoped).
  perform pg_advisory_xact_lock(hashtext('maw_founders_claim_lock'));

  select count(*) into v_total
  from public.users
  where founding_circle_member = true;

  if v_total >= 100 then
    return query select false, 'total_limit_reached', v_admc, v_total;
    return;
  end if;

  if p_bucket = 'admc_2026' then
    select count(*) into v_admc
    from public.users
    where founding_bucket = 'admc_2026' and founding_circle_member = true;

    if v_admc >= 75 then
      return query select false, 'admc_limit_reached', v_admc, v_total;
      return;
    end if;
  end if;

  -- Assign bucket and ensure founder identity fields are set.
  update public.users
  set
    founding_bucket = p_bucket,
    founding_circle_member = true,
    founding_joined_at = coalesce(founding_joined_at, now())
  where id = p_user_id
    and (founding_bucket is null or founding_bucket = p_bucket);

  get diagnostics v_updated = row_count;

  -- Recompute counts for caller visibility.
  select count(*) into v_total
  from public.users
  where founding_circle_member = true;

  select count(*) into v_admc
  from public.users
  where founding_bucket = 'admc_2026' and founding_circle_member = true;

  if v_updated = 0 then
    return query select false, 'bucket_conflict_or_user_missing', v_admc, v_total;
    return;
  end if;

  return query select true, 'ok', v_admc, v_total;
end $$;
