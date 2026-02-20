-- Magic AI Wizard – Phase 2B: Hardening & Observability
-- Run in Supabase SQL editor (or migrations) as a service role/admin.

-- 1) Usage event telemetry table
create table if not exists public.ai_usage_events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  request_id text not null,
  actor_type text not null check (actor_type in ('user','guest')),
  user_id uuid null,
  identity_key text not null,
  ip_hash text null,
  tool text null,
  endpoint text null,
  provider text null,
  model text null,
  outcome text not null,
  http_status int null,
  error_code text null,
  retryable boolean null,
  units int null,
  charged_units int null,
  membership text null,
  latency_ms int null,
  user_agent text null
);

create index if not exists ai_usage_events_occurred_at_idx on public.ai_usage_events (occurred_at desc);
create index if not exists ai_usage_events_user_id_idx on public.ai_usage_events (user_id);
create index if not exists ai_usage_events_identity_idx on public.ai_usage_events (identity_key);

-- 2) Anomaly flags
create table if not exists public.ai_anomaly_flags (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  request_id text null,
  user_id uuid null,
  identity_key text not null,
  ip_hash text null,
  reason text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  metadata jsonb null,
  resolved boolean not null default false,
  resolved_at timestamptz null
);

create index if not exists ai_anomaly_flags_created_at_idx on public.ai_anomaly_flags (created_at desc);
create index if not exists ai_anomaly_flags_resolved_idx on public.ai_anomaly_flags (resolved, created_at desc);

-- 3) Audit trail table
create table if not exists public.ai_audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_user_id uuid null,
  action text not null,
  target_user_id uuid null,
  metadata jsonb null,
  request_id text null
);

create index if not exists ai_audit_log_created_at_idx on public.ai_audit_log (created_at desc);

-- 4) RLS: admin-only read; service role inserts bypass RLS.
alter table public.ai_usage_events enable row level security;
alter table public.ai_anomaly_flags enable row level security;
alter table public.ai_audit_log enable row level security;

-- NOTE: requires your users table to have is_admin boolean (or equivalent).
-- Adjust the policy predicate if your admin field differs.
create policy if not exists "admin read ai_usage_events"
on public.ai_usage_events
for select
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

create policy if not exists "admin read ai_anomaly_flags"
on public.ai_anomaly_flags
for select
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

create policy if not exists "admin update ai_anomaly_flags"
on public.ai_anomaly_flags
for update
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

create policy if not exists "admin read ai_audit_log"
on public.ai_audit_log
for select
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

-- 5) Optional scheduled anomaly detector (hourly): aggregate patterns and flag.
-- You can run this via Supabase scheduled jobs or external cron.
create or replace function public.detect_ai_usage_anomalies()
returns void
language plpgsql
as $$
begin
  -- Example: flag identities with excessive rate-limit blocks in last hour
  insert into public.ai_anomaly_flags (request_id, user_id, identity_key, ip_hash, reason, severity, metadata)
  select
    null,
    null,
    e.identity_key,
    max(e.ip_hash),
    'EXCESSIVE_RATE_LIMIT_BLOCKS_1H',
    'medium',
    jsonb_build_object('blocked_429_count', count(*))
  from public.ai_usage_events e
  where e.occurred_at > now() - interval '1 hour'
    and e.http_status = 429
  group by e.identity_key
  having count(*) >= 50
  on conflict do nothing;

  -- Example: flag user IDs with unusually high charged units in last day
  insert into public.ai_anomaly_flags (request_id, user_id, identity_key, ip_hash, reason, severity, metadata)
  select
    null,
    e.user_id,
    'user:' || e.user_id::text,
    null,
    'HIGH_CHARGED_UNITS_24H',
    'high',
    jsonb_build_object('charged_units_24h', sum(coalesce(e.charged_units,0)))
  from public.ai_usage_events e
  where e.occurred_at > now() - interval '24 hours'
    and e.user_id is not null
  group by e.user_id
  having sum(coalesce(e.charged_units,0)) >= 2000
  on conflict do nothing;
end;
$$;
