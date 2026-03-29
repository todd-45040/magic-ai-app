-- Phase 1 post-launch hardening
-- Safe to run multiple times.

-- Ensure webhook event receipt mirror exists for admin/health visibility.
create table if not exists public.maw_stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null,
  event_type text not null,
  livemode boolean not null default false,
  stripe_created_at timestamptz null,
  received_at timestamptz not null default now(),
  request_id text null,
  signature_present boolean not null default false
);

create unique index if not exists maw_stripe_webhook_events_event_id_uidx
  on public.maw_stripe_webhook_events (stripe_event_id);

create index if not exists maw_stripe_webhook_events_received_at_idx
  on public.maw_stripe_webhook_events (received_at desc);

alter table if exists public.billing_events
  add column if not exists request_id text null,
  add column if not exists delivery_attempts integer not null default 1,
  add column if not exists last_error text null,
  add column if not exists last_received_at timestamptz not null default now();

create index if not exists idx_billing_events_status_created
  on public.billing_events (event_status, created_at desc);

create index if not exists idx_billing_events_processed_at
  on public.billing_events (processed_at desc);

alter table if exists public.maw_stripe_webhook_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='maw_stripe_webhook_events'
      and policyname='service_role_all'
  ) then
    create policy service_role_all on public.maw_stripe_webhook_events
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
