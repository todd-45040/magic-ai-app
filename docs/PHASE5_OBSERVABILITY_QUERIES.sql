-- Phase 5 — simple product truth queries

-- 1) Signups by source and day
select date_trunc('day', created_at)::date as day, coalesce(metadata->>'source','unknown') as source, count(*)
from public.user_activity_log
where event_type = 'signup'
group by 1,2
order by 1 desc, 2;

-- 2) Trial starts by source
select coalesce(metadata->>'source','unknown') as source, count(*)
from public.user_activity_log
where event_type = 'trial_started'
group by 1
order by 2 desc;

-- 3) First tool used for IBM trial users
select coalesce(tool_name,'system') as tool_name, count(*)
from public.user_activity_log
where event_type = 'first_tool_used'
  and coalesce(metadata->>'source','') = 'ibm'
group by 1
order by 2 desc;

-- 4) Most-used tools in the last 30 days
select tool_name, count(*)
from public.user_activity_log
where event_type = 'tool_used'
  and created_at >= now() - interval '30 days'
group by 1
order by 2 desc;

-- 5) Pricing views -> upgrade clicks -> checkout starts -> checkout completions
select event_type, count(*)
from public.user_activity_log
where event_type in ('pricing_viewed','upgrade_clicked','checkout_started','checkout_completed')
group by 1
order by 1;

-- 6) IBM funnel only
select event_type, count(*)
from public.user_activity_log
where coalesce(metadata->>'source','') = 'ibm'
  and event_type in ('signup','trial_started','first_tool_used','pricing_viewed','upgrade_clicked','checkout_started','checkout_completed','trial_expired')
group by 1
order by 1;

-- 7) Quota-hit pressure by tool
select tool_name, coalesce(metadata->>'reason','unknown') as reason, count(*)
from public.user_activity_log
where event_type = 'quota_hit'
group by 1,2
order by 3 desc;

-- 8) Error mix
select coalesce(metadata->>'error_kind','unknown') as error_kind, count(*)
from public.user_activity_log
where event_type = 'error'
group by 1
order by 2 desc;

-- 9) Day-1 return users
with signups as (
  select user_id, min(created_at) as signup_at
  from public.user_activity_log
  where event_type = 'signup'
  group by 1
), returns as (
  select distinct s.user_id
  from signups s
  join public.user_activity_log l on l.user_id = s.user_id
  where l.event_type in ('login','tool_used','idea_saved','pricing_viewed')
    and l.created_at >= s.signup_at + interval '1 day'
    and l.created_at < s.signup_at + interval '2 day'
)
select count(*) as returned_day_1 from returns;

-- 10) Trial expirations vs completed checkouts
select event_type, count(*)
from public.user_activity_log
where event_type in ('trial_expired','checkout_completed')
group by 1
order by 1;
