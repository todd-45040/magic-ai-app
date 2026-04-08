-- Phase 8 / IBM trial hardening
-- Atomic quota consumers for AI usage, live rehearsal minutes, and video uploads.
-- Run this in Supabase SQL editor before deploying the updated app files.

create or replace function public.maw_consume_ai_usage(
  p_user_id uuid,
  p_units integer,
  p_daily_limit integer,
  p_quota_column text default null
)
returns table (
  consumed boolean,
  reason text,
  generation_count integer,
  quota_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_units integer := greatest(coalesce(p_units, 0), 0);
  v_daily_limit integer := greatest(coalesce(p_daily_limit, 0), 0);
begin
  if v_units = 0 then
    return query
    select true, null::text, coalesce(u.generation_count, 0),
      case p_quota_column
        when 'quota_image_gen' then coalesce(u.quota_image_gen, 0)
        when 'quota_identify' then coalesce(u.quota_identify, 0)
        when 'quota_live_audio_minutes' then coalesce(u.quota_live_audio_minutes, 0)
        when 'quota_video_uploads' then coalesce(u.quota_video_uploads, 0)
        else null
      end
    from public.users u
    where u.id = p_user_id;
    return;
  end if;

  return query
  with updated as (
    update public.users u
    set
      last_reset_date = case
        when u.last_reset_date is null or u.last_reset_date::date <> now()::date then now()
        else u.last_reset_date
      end,
      generation_count = case
        when u.last_reset_date is null or u.last_reset_date::date <> now()::date then v_units
        else coalesce(u.generation_count, 0) + v_units
      end,
      quota_image_gen = case
        when p_quota_column = 'quota_image_gen' then coalesce(u.quota_image_gen, 0) - v_units
        else u.quota_image_gen
      end,
      quota_identify = case
        when p_quota_column = 'quota_identify' then coalesce(u.quota_identify, 0) - v_units
        else u.quota_identify
      end,
      quota_live_audio_minutes = case
        when p_quota_column = 'quota_live_audio_minutes' then coalesce(u.quota_live_audio_minutes, 0) - v_units
        else u.quota_live_audio_minutes
      end,
      quota_video_uploads = case
        when p_quota_column = 'quota_video_uploads' then coalesce(u.quota_video_uploads, 0) - v_units
        else u.quota_video_uploads
      end
    where u.id = p_user_id
      and (
        case
          when u.last_reset_date is null or u.last_reset_date::date <> now()::date then 0
          else coalesce(u.generation_count, 0)
        end
      ) + v_units <= v_daily_limit
      and (
        p_quota_column is null
        or case p_quota_column
          when 'quota_image_gen' then coalesce(u.quota_image_gen, 0)
          when 'quota_identify' then coalesce(u.quota_identify, 0)
          when 'quota_live_audio_minutes' then coalesce(u.quota_live_audio_minutes, 0)
          when 'quota_video_uploads' then coalesce(u.quota_video_uploads, 0)
          else 0
        end >= v_units
      )
    returning
      true as consumed,
      null::text as reason,
      coalesce(generation_count, 0) as generation_count,
      case p_quota_column
        when 'quota_image_gen' then coalesce(quota_image_gen, 0)
        when 'quota_identify' then coalesce(quota_identify, 0)
        when 'quota_live_audio_minutes' then coalesce(quota_live_audio_minutes, 0)
        when 'quota_video_uploads' then coalesce(quota_video_uploads, 0)
        else null
      end as quota_remaining
  ), current_row as (
    select
      false as consumed,
      case
        when (
          case
            when u.last_reset_date is null or u.last_reset_date::date <> now()::date then 0
            else coalesce(u.generation_count, 0)
          end
        ) + v_units > v_daily_limit then 'daily_limit'
        when p_quota_column is not null and (
          case p_quota_column
            when 'quota_image_gen' then coalesce(u.quota_image_gen, 0)
            when 'quota_identify' then coalesce(u.quota_identify, 0)
            when 'quota_live_audio_minutes' then coalesce(u.quota_live_audio_minutes, 0)
            when 'quota_video_uploads' then coalesce(u.quota_video_uploads, 0)
            else 0
          end
        ) < v_units then 'monthly_limit'
        else 'not_found'
      end as reason,
      coalesce(
        case
          when u.last_reset_date is null or u.last_reset_date::date <> now()::date then 0
          else u.generation_count
        end,
        0
      ) as generation_count,
      case p_quota_column
        when 'quota_image_gen' then coalesce(u.quota_image_gen, 0)
        when 'quota_identify' then coalesce(u.quota_identify, 0)
        when 'quota_live_audio_minutes' then coalesce(u.quota_live_audio_minutes, 0)
        when 'quota_video_uploads' then coalesce(u.quota_video_uploads, 0)
        else null
      end as quota_remaining
    from public.users u
    where u.id = p_user_id
  )
  select * from updated
  union all
  select * from current_row where not exists (select 1 from updated)
  limit 1;
end;
$$;

create or replace function public.maw_consume_live_minutes(
  p_user_id uuid,
  p_units integer,
  p_daily_limit integer
)
returns table (
  consumed boolean,
  reason text,
  daily_used integer,
  quota_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_units integer := greatest(coalesce(p_units, 0), 0);
  v_daily_limit integer := greatest(coalesce(p_daily_limit, 0), 0);
begin
  if v_units = 0 then
    return query
    select true, null::text, coalesce(u.daily_live_audio_minutes_used, 0), coalesce(u.quota_live_audio_minutes, 0)
    from public.users u
    where u.id = p_user_id;
    return;
  end if;

  return query
  with updated as (
    update public.users u
    set
      daily_live_audio_reset_date = case
        when u.daily_live_audio_reset_date is null or u.daily_live_audio_reset_date::date <> now()::date then now()
        else u.daily_live_audio_reset_date
      end,
      daily_live_audio_minutes_used = case
        when u.daily_live_audio_reset_date is null or u.daily_live_audio_reset_date::date <> now()::date then v_units
        else coalesce(u.daily_live_audio_minutes_used, 0) + v_units
      end,
      quota_live_audio_minutes = coalesce(u.quota_live_audio_minutes, 0) - v_units
    where u.id = p_user_id
      and (
        case
          when u.daily_live_audio_reset_date is null or u.daily_live_audio_reset_date::date <> now()::date then 0
          else coalesce(u.daily_live_audio_minutes_used, 0)
        end
      ) + v_units <= v_daily_limit
      and coalesce(u.quota_live_audio_minutes, 0) >= v_units
    returning true, null::text, coalesce(daily_live_audio_minutes_used, 0), coalesce(quota_live_audio_minutes, 0)
  ), current_row as (
    select
      false,
      case
        when (
          case
            when u.daily_live_audio_reset_date is null or u.daily_live_audio_reset_date::date <> now()::date then 0
            else coalesce(u.daily_live_audio_minutes_used, 0)
          end
        ) + v_units > v_daily_limit then 'daily_limit'
        when coalesce(u.quota_live_audio_minutes, 0) < v_units then 'monthly_limit'
        else 'not_found'
      end,
      coalesce(
        case
          when u.daily_live_audio_reset_date is null or u.daily_live_audio_reset_date::date <> now()::date then 0
          else u.daily_live_audio_minutes_used
        end,
        0
      ),
      coalesce(u.quota_live_audio_minutes, 0)
    from public.users u
    where u.id = p_user_id
  )
  select * from updated
  union all
  select * from current_row where not exists (select 1 from updated)
  limit 1;
end;
$$;

create or replace function public.maw_consume_video_uploads(
  p_user_id uuid,
  p_units integer,
  p_daily_limit integer
)
returns table (
  consumed boolean,
  reason text,
  daily_used integer,
  quota_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_units integer := greatest(coalesce(p_units, 0), 0);
  v_daily_limit integer := greatest(coalesce(p_daily_limit, 0), 0);
begin
  if v_units = 0 then
    return query
    select true, null::text, coalesce(u.daily_video_uploads_used, 0), coalesce(u.quota_video_uploads, 0)
    from public.users u
    where u.id = p_user_id;
    return;
  end if;

  return query
  with updated as (
    update public.users u
    set
      daily_video_uploads_reset_date = case
        when u.daily_video_uploads_reset_date is null or u.daily_video_uploads_reset_date::date <> now()::date then now()
        else u.daily_video_uploads_reset_date
      end,
      daily_video_uploads_used = case
        when u.daily_video_uploads_reset_date is null or u.daily_video_uploads_reset_date::date <> now()::date then v_units
        else coalesce(u.daily_video_uploads_used, 0) + v_units
      end,
      quota_video_uploads = coalesce(u.quota_video_uploads, 0) - v_units
    where u.id = p_user_id
      and (
        case
          when u.daily_video_uploads_reset_date is null or u.daily_video_uploads_reset_date::date <> now()::date then 0
          else coalesce(u.daily_video_uploads_used, 0)
        end
      ) + v_units <= v_daily_limit
      and coalesce(u.quota_video_uploads, 0) >= v_units
    returning true, null::text, coalesce(daily_video_uploads_used, 0), coalesce(quota_video_uploads, 0)
  ), current_row as (
    select
      false,
      case
        when (
          case
            when u.daily_video_uploads_reset_date is null or u.daily_video_uploads_reset_date::date <> now()::date then 0
            else coalesce(u.daily_video_uploads_used, 0)
          end
        ) + v_units > v_daily_limit then 'daily_limit'
        when coalesce(u.quota_video_uploads, 0) < v_units then 'monthly_limit'
        else 'not_found'
      end,
      coalesce(
        case
          when u.daily_video_uploads_reset_date is null or u.daily_video_uploads_reset_date::date <> now()::date then 0
          else u.daily_video_uploads_used
        end,
        0
      ),
      coalesce(u.quota_video_uploads, 0)
    from public.users u
    where u.id = p_user_id
  )
  select * from updated
  union all
  select * from current_row where not exists (select 1 from updated)
  limit 1;
end;
$$;
