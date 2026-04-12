create or replace function public.consume_live_audio_minutes(
  p_user_id uuid,
  p_minutes integer
)
returns table (
  allowed boolean,
  reason text,
  remaining_daily integer,
  remaining_monthly integer,
  used_daily integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_now timestamptz := now();
  v_units integer := greatest(coalesce(p_minutes, 0), 0);
  v_effective_membership text := 'free';
  v_daily_limit integer := 0;
  v_monthly_default integer := 0;
  v_used_daily integer := 0;
  v_remaining_monthly integer := 0;
begin
  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    return query select false, 'auth_required', 0, 0, 0;
    return;
  end if;

  if coalesce(v_user.is_admin, false) then
    return query select true, null::text, 2147483647, 2147483647, 0;
    return;
  end if;

  if coalesce(v_user.membership, 'free') = 'trial' then
    if v_user.trial_end_date is not null and v_user.trial_end_date > floor(extract(epoch from v_now) * 1000) then
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

  if coalesce((v_user.daily_live_audio_reset_date at time zone 'UTC')::date, date '1900-01-01') <> (v_now at time zone 'UTC')::date then
    update public.users
    set daily_live_audio_minutes_used = 0,
        daily_live_audio_reset_date = v_now
    where id = p_user_id
    returning * into v_user;
  end if;

  v_used_daily := greatest(coalesce(v_user.daily_live_audio_minutes_used, 0), 0);
  v_remaining_monthly := greatest(coalesce(v_user.quota_live_audio_minutes, 0), 0);

  if coalesce(v_user.membership, 'free') = 'trial' and v_effective_membership = 'free' then
    return query select false, 'trial_inactive', greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
    return;
  end if;

  if v_daily_limit <= 0 then
    return query select false, 'plan_restricted', 0, v_remaining_monthly, v_used_daily;
    return;
  end if;

  if v_units = 0 then
    return query select true, null::text, greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
    return;
  end if;

  if v_used_daily + v_units > v_daily_limit then
    return query select false, 'daily_limit', greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
    return;
  end if;

  if v_remaining_monthly < v_units then
    return query select false, 'monthly_limit', greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
    return;
  end if;

  update public.users
  set daily_live_audio_minutes_used = greatest(coalesce(daily_live_audio_minutes_used, 0), 0) + v_units,
      daily_live_audio_reset_date = coalesce(daily_live_audio_reset_date, v_now),
      quota_live_audio_minutes = greatest(coalesce(quota_live_audio_minutes, 0), 0) - v_units,
      quota_reset_date = coalesce(quota_reset_date, v_now)
  where id = p_user_id
  returning * into v_user;

  v_used_daily := greatest(coalesce(v_user.daily_live_audio_minutes_used, 0), 0);
  v_remaining_monthly := greatest(coalesce(v_user.quota_live_audio_minutes, 0), 0);

  return query select true, null::text, greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
end;
$$;

create or replace function public.consume_video_upload(
  p_user_id uuid,
  p_count integer default 1
)
returns table (
  allowed boolean,
  reason text,
  remaining_daily integer,
  remaining_monthly integer,
  used_daily integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_now timestamptz := now();
  v_units integer := greatest(coalesce(p_count, 1), 0);
  v_effective_membership text := 'free';
  v_daily_limit integer := 0;
  v_monthly_default integer := 0;
  v_used_daily integer := 0;
  v_remaining_monthly integer := 0;
begin
  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    return query select false, 'auth_required', 0, 0, 0;
    return;
  end if;

  if coalesce(v_user.is_admin, false) then
    return query select true, null::text, 2147483647, 2147483647, 0;
    return;
  end if;

  if coalesce(v_user.membership, 'free') = 'trial' then
    if v_user.trial_end_date is not null and v_user.trial_end_date > floor(extract(epoch from v_now) * 1000) then
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
      v_daily_limit := 6;
      v_monthly_default := 50;
    when 'amateur' then
      v_daily_limit := 1;
      v_monthly_default := 2;
    when 'trial' then
      v_daily_limit := 1;
      v_monthly_default := 1;
    else
      v_daily_limit := 0;
      v_monthly_default := 0;
  end case;

  if date_trunc('month', coalesce(v_user.quota_reset_date, to_timestamp(0))) <> date_trunc('month', v_now) then
    update public.users
    set quota_video_uploads = v_monthly_default,
        quota_reset_date = v_now
    where id = p_user_id
    returning * into v_user;
  end if;

  if coalesce((v_user.daily_video_uploads_reset_date at time zone 'UTC')::date, date '1900-01-01') <> (v_now at time zone 'UTC')::date then
    update public.users
    set daily_video_uploads_used = 0,
        daily_video_uploads_reset_date = v_now
    where id = p_user_id
    returning * into v_user;
  end if;

  v_used_daily := greatest(coalesce(v_user.daily_video_uploads_used, 0), 0);
  v_remaining_monthly := greatest(coalesce(v_user.quota_video_uploads, 0), 0);

  if coalesce(v_user.membership, 'free') = 'trial' and v_effective_membership = 'free' then
    return query select false, 'trial_inactive', greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
    return;
  end if;

  if v_daily_limit <= 0 then
    return query select false, 'plan_restricted', 0, v_remaining_monthly, v_used_daily;
    return;
  end if;

  if v_units = 0 then
    return query select true, null::text, greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
    return;
  end if;

  if v_used_daily + v_units > v_daily_limit then
    return query select false, 'daily_limit', greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
    return;
  end if;

  if v_remaining_monthly < v_units then
    return query select false, 'monthly_limit', greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
    return;
  end if;

  update public.users
  set daily_video_uploads_used = greatest(coalesce(daily_video_uploads_used, 0), 0) + v_units,
      daily_video_uploads_reset_date = coalesce(daily_video_uploads_reset_date, v_now),
      quota_video_uploads = greatest(coalesce(quota_video_uploads, 0), 0) - v_units,
      quota_reset_date = coalesce(quota_reset_date, v_now)
  where id = p_user_id
  returning * into v_user;

  v_used_daily := greatest(coalesce(v_user.daily_video_uploads_used, 0), 0);
  v_remaining_monthly := greatest(coalesce(v_user.quota_video_uploads, 0), 0);

  return query select true, null::text, greatest(v_daily_limit - v_used_daily, 0), v_remaining_monthly, v_used_daily;
end;
$$;
