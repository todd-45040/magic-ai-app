-- Stripe Webhook Health Tracking (Phase 3.1)
-- Stores last received Stripe event (for Admin readiness/health checks)

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

-- RLS: admin/service role only (table is only written by server-side functions)
alter table public.maw_stripe_webhook_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='maw_stripe_webhook_events' and policyname='service_role_all'
  ) then
    create policy service_role_all on public.maw_stripe_webhook_events
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
