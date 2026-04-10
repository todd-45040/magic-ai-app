-- IBM telemetry helper indexes and example queries

create index if not exists idx_users_signup_source on public.users(signup_source);
create index if not exists idx_users_trial_end_date on public.users(trial_end_date);
create index if not exists idx_user_activity_log_metadata_gin on public.user_activity_log using gin (metadata);

-- IBM signups / activations / paid conversions
select
  count(*) filter (where signup_source = 'ibm') as ibm_signups_total,
  count(*) filter (where signup_source = 'ibm' and membership in ('amateur','professional')) as ibm_paid_total
from public.users;

select
  event_type,
  count(*) as events
from public.user_activity_log
where coalesce(metadata->>'source','') = 'ibm'
  and created_at >= now() - interval '30 days'
group by event_type
order by events desc;

select
  tool_name,
  count(*) as uses
from public.user_activity_log
where coalesce(metadata->>'source','') = 'ibm'
  and event_type in ('tool_used','first_tool_used')
  and created_at >= now() - interval '30 days'
group by tool_name
order by uses desc;
