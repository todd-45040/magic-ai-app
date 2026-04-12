-- Reduce professional/trial effective daily Live Rehearsal cap to 60 minutes.
-- Monthly live rehearsal quota remains unchanged.

create or replace function public.consume_live_audio_minutes(
  p_user_id uuid,
  p_minutes integer
)
returns table (
  allowed boolean,
  reason text,
  used_daily integer,
  remaining_daily integer,
  remaining_monthly integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_user public.users%rowtype;
  v_units integer := greatest(coalesce(p_minutes, 0), 0);
  v_effective_membership text;
  v_daily_limit integer := 0;
  v_monthly_default integer := 0;
  v_used_daily integer := 0;
  v_remaining_daily integer := 0;
  v_remaining_monthly integer := 0;
begin
  if v_units <= 0 then
    return query select false, 'invalid_request'::text, 0, 0, 0;
    return;
  end if;

  select *
  into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    return query select false, 'user_not_found'::text, 0, 0, 0;
    return;
  end if;

  if coalesce(v_user.is_admin, false) = true then
    return query select true, null::text, 0, 2147483647, 2147483647;
    return;
  end if;

  if coalesce(v_user.membership, 'free') = 'trial' then
    if coalesce(v_user.trial_end_date, 0) > (extract(epoch from v_now) * 1000) then
      v_effective_membership := 'professional';
    else
      v_effective_membership := 'free';
    end if;
  elsif coalesce(v_user.membership, 'free') in ('performer', 'semi-pro') then
    v_effective_membership := 'amateur';
  elsif coalesce(v_user.membership, 'free') in ('professional', 'amateur', 'expired', 'free') then
    v_effective_membership := coalesce(v_user.membership, 'free');
  else
    v_effective_membership := 'free';
  end if;

  case v_effective_membership
    when 'professional' then
      v_daily_limit := 60;
      v_monthly_default := 300;
    when 'amateur' then
      v_daily_limit := 45;
      v_monthly_default := 0;
    when 'trial' then
      v_daily_limit := 20;
      v_monthly_default := 20;
    else
      v_daily_limit := 0;
      v_monthly_default := 0;
  end case;

  if date_trunc('month', coalesce(v_user.quota_reset_date, to_timestamp(0))) <> date_trunc('month', v_now) then
    update public.users
    set quota_live_audio_minutes = v_monthly_default,
        quota_reset_date = v_now
    where id = p_user_id
    returning * into v_user;
  end if;

  if date_trunc('day', coalesce(v_user.daily_live_audio_reset_date, to_timestamp(0))) <> date_trunc('day', v_now) then
    update public.users
    set daily_live_audio_minutes_used = 0,
        daily_live_audio_reset_date = v_now
    where id = p_user_id
    returning * into v_user;
  end if;

  v_used_daily := greatest(coalesce(v_user.daily_live_audio_minutes_used, 0), 0);
  v_remaining_daily := greatest(v_daily_limit - v_used_daily, 0);
  v_remaining_monthly := greatest(coalesce(v_user.quota_live_audio_minutes, 0), 0);

  if v_daily_limit <= 0 then
    return query select false, 'plan_restricted'::text, v_used_daily, v_remaining_daily, v_remaining_monthly;
    return;
  end if;

  if v_units > v_remaining_daily then
    return query select false, 'daily_limit'::text, v_used_daily, v_remaining_daily, v_remaining_monthly;
    return;
  end if;

  if v_units > v_remaining_monthly then
    return query select false, 'monthly_limit'::text, v_used_daily, v_remaining_daily, v_remaining_monthly;
    return;
  end if;

  update public.users
  set daily_live_audio_minutes_used = greatest(coalesce(daily_live_audio_minutes_used, 0), 0) + v_units,
      daily_live_audio_reset_date = coalesce(daily_live_audio_reset_date, v_now),
      quota_live_audio_minutes = greatest(coalesce(quota_live_audio_minutes, 0), 0) - v_units
  where id = p_user_id
  returning * into v_user;

  v_used_daily := greatest(coalesce(v_user.daily_live_audio_minutes_used, 0), 0);
  v_remaining_daily := greatest(v_daily_limit - v_used_daily, 0);
  v_remaining_monthly := greatest(coalesce(v_user.quota_live_audio_minutes, 0), 0);

  return query select true, null::text, v_used_daily, v_remaining_daily, v_remaining_monthly;
end;
$$;
