-- Phase 5 — Minimal observability foundation

create table if not exists public.user_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  email text null,
  tool_name text not null,
  event_type text not null,
  success boolean not null default true,
  duration_ms integer null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_activity_log_user_id on public.user_activity_log(user_id);
create index if not exists idx_user_activity_log_event_type on public.user_activity_log(event_type);
create index if not exists idx_user_activity_log_tool_name on public.user_activity_log(tool_name);
create index if not exists idx_user_activity_log_created_at on public.user_activity_log(created_at desc);
create index if not exists idx_user_activity_log_user_event_created on public.user_activity_log(user_id, event_type, created_at desc);

alter table public.user_activity_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_activity_log'
      and policyname = 'user_activity_log_select_own'
  ) then
    create policy user_activity_log_select_own
      on public.user_activity_log
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace view public.admin_user_activity_daily_rollup as
select
  date_trunc('day', created_at)::date as day,
  coalesce(nullif(lower(trim(metadata->>'source')), ''), 'unknown') as source,
  event_type,
  coalesce(nullif(lower(trim(tool_name)), ''), 'system') as tool_name,
  count(*)::bigint as events,
  count(*) filter (where success = true)::bigint as success_events,
  count(*) filter (where success = false)::bigint as failed_events
from public.user_activity_log
group by 1,2,3,4;
