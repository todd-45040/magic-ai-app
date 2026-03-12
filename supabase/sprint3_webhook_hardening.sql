-- Sprint 3D + 3H — Stripe webhook hardening support
-- Safe to run multiple times.

alter table if exists public.billing_events
  add column if not exists request_id text null,
  add column if not exists delivery_attempts integer not null default 1,
  add column if not exists last_error text null,
  add column if not exists last_received_at timestamptz not null default now();

create index if not exists idx_billing_events_stripe_event_id on public.billing_events (stripe_event_id);
create index if not exists idx_billing_events_subscription_id on public.billing_events (stripe_subscription_id);
create index if not exists idx_billing_events_customer_id on public.billing_events (stripe_customer_id);
