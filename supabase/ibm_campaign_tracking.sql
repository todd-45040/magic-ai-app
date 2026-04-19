-- IBM / SAM campaign event tracking + user profile metadata hardening

create table if not exists public.maw_campaign_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event_type text not null,
  campaign text not null,
  source text not null default 'ibm',
  email text null,
  email_lower text null,
  ibm_ring text null,
  sam_assembly text null,
  page_path text null,
  ip_hash text null,
  user_agent text null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists maw_campaign_events_created_at_idx
  on public.maw_campaign_events (created_at desc);

create index if not exists maw_campaign_events_campaign_event_idx
  on public.maw_campaign_events (campaign, event_type, created_at desc);

create index if not exists maw_campaign_events_email_lower_idx
  on public.maw_campaign_events (email_lower);

alter table public.maw_campaign_events enable row level security;

-- Server uses service-role inserts only.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'maw_campaign_events'
      and policyname = 'service role can manage campaign events'
  ) then
    create policy "service role can manage campaign events"
      on public.maw_campaign_events
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end
$$;

alter table public.users
  add column if not exists signup_source text;
alter table public.users
  add column if not exists requested_trial_days integer;
alter table public.users
  add column if not exists ibm_ring text;
alter table public.users
  add column if not exists sam_assembly text;

create index if not exists users_signup_source_idx
  on public.users (signup_source);
create index if not exists users_ibm_ring_idx
  on public.users (ibm_ring);
create index if not exists users_sam_assembly_idx
  on public.users (sam_assembly);

alter table public.users
  add column if not exists partner_source text;
alter table public.users
  add column if not exists partner_campaign text;
alter table public.users
  add column if not exists partner_detail_type text;
alter table public.users
  add column if not exists partner_detail_value text;

create index if not exists users_partner_source_idx
  on public.users (partner_source);

-- Query 1: IBM landing funnel by day
-- select date_trunc('day', created_at) as day, event_type, count(*)
-- from public.maw_campaign_events
-- where campaign = 'ibm-30day'
-- group by 1,2
-- order by 1 desc, 2;

-- Query 2: IBM submit -> signup linkage by email
-- select
--   e.email_lower,
--   min(e.created_at) as first_submit_at,
--   u.created_at as user_created_at,
--   u.signup_source,
--   u.requested_trial_days,
--   u.trial_end_date,
--   u.membership,
--   u.ibm_ring
-- from public.maw_campaign_events e
-- left join public.users u on lower(u.email) = e.email_lower
-- where e.campaign = 'ibm-30day'
--   and e.event_type = 'partner_form_submit'
-- group by e.email_lower, u.created_at, u.signup_source, u.requested_trial_days, u.trial_end_date, u.membership, u.ibm_ring
-- order by first_submit_at desc;

-- Query 3: IBM current funnel snapshot
-- with ibm_users as (
--   select * from public.users where signup_source = 'ibm'
-- )
-- select
--   (select count(*) from public.maw_campaign_events where campaign = 'ibm-30day' and event_type = 'partner_form_submit') as landing_submits,
--   (select count(*) from ibm_users) as ibm_signups,
--   (select count(*) from ibm_users where membership in ('amateur','professional')) as paid_conversions,
--   (select count(*) from ibm_users where membership = 'trial' and coalesce(trial_end_date,0) > (extract(epoch from now()) * 1000)) as active_trials,
--   (select count(*) from ibm_users where membership = 'trial' and coalesce(trial_end_date,0) <= (extract(epoch from now()) * 1000)) as expired_trials;

-- Shared partner telemetry contract (accepted at API boundary)
-- event_name: partner_page_view | partner_cta_click | partner_form_submit | partner_signup_redirect
-- payload keys: partner_source, partner_campaign, partner_detail_value
-- Endpoints remain backward-compatible and still persist legacy source/campaign columns.
