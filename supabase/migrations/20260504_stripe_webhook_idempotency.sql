create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_customer_id text null,
  user_id uuid null references public.users(id) on delete set null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'skipped', 'failed')),
  message text null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events(status);

create index if not exists stripe_webhook_events_customer_idx
  on public.stripe_webhook_events(stripe_customer_id);

create index if not exists stripe_webhook_events_user_idx
  on public.stripe_webhook_events(user_id);

create or replace function public.set_stripe_webhook_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_stripe_webhook_events_updated_at on public.stripe_webhook_events;

create trigger set_stripe_webhook_events_updated_at
before update on public.stripe_webhook_events
for each row
execute function public.set_stripe_webhook_events_updated_at();

alter table public.stripe_webhook_events enable row level security;

-- Service-role API calls bypass RLS. No public/client policies are intentionally added.
