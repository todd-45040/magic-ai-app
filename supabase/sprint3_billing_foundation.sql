-- Sprint 3A + 3B — Billing Domain Lock + Data Model Prep
-- Safe to run multiple times.
-- Goal: define a canonical internal plan catalog and the billing tables Stripe will sync into.
-- IMPORTANT: entitlements remain the source of access truth; Stripe only updates billing state.

create extension if not exists pgcrypto;

create table if not exists public.plan_catalog (
  plan_key text primary key,
  display_name text not null,
  public_label text not null,
  monthly_price_cents integer null,
  annual_price_cents integer null,
  entitlement_tier text not null,
  stripe_lookup_key text null,
  is_public boolean not null default true,
  is_founder_plan boolean not null default false,
  monthly_limits jsonb not null default '{}'::jsonb,
  heavy_tool_limits jsonb not null default '{}'::jsonb,
  storage_limits jsonb not null default '{}'::jsonb,
  feature_access_matrix jsonb not null default '{}'::jsonb,
  upgrade_paths jsonb not null default '[]'::jsonb,
  downgrade_behavior jsonb not null default '{}'::jsonb,
  founder_override_behavior jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  stripe_customer_id text unique,
  email text null,
  billing_provider text not null default 'stripe',
  provider_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz null,
  source_updated_at timestamptz null,
  unique (user_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  billing_customer_id uuid null references public.billing_customers (id) on delete set null,
  stripe_customer_id text null,
  stripe_subscription_id text unique,
  plan_key text not null references public.plan_catalog (plan_key),
  billing_status text not null default 'pending',
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  founder_locked_price integer null,
  founder_locked_plan text null,
  checkout_session_id text null,
  price_id text null,
  source_of_truth text not null default 'application',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  source_updated_at timestamptz null,
  unique (user_id, source_of_truth)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.users (id) on delete set null,
  subscription_id uuid null references public.subscriptions (id) on delete set null,
  billing_customer_id uuid null references public.billing_customers (id) on delete set null,
  stripe_event_id text unique,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  event_type text not null,
  event_source text not null default 'stripe',
  event_status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  event_created_at timestamptz null,
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  subscription_id uuid null references public.subscriptions (id) on delete set null,
  plan_key text not null references public.plan_catalog (plan_key),
  period_start timestamptz not null,
  period_end timestamptz not null,
  counters jsonb not null default '{}'::jsonb,
  limits_snapshot jsonb not null default '{}'::jsonb,
  source_of_truth text not null default 'application',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  source_updated_at timestamptz null,
  unique (user_id, period_start, period_end)
);

create table if not exists public.founder_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  locked_plan_key text not null references public.plan_catalog (plan_key),
  locked_price_cents integer not null,
  override_active boolean not null default true,
  pricing_lock text null,
  founder_bucket text null,
  granted_by text null,
  granted_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  source_updated_at timestamptz null,
  unique (user_id)
);

create index if not exists idx_billing_customers_stripe_customer_id on public.billing_customers (stripe_customer_id);
create index if not exists idx_subscriptions_user_id on public.subscriptions (user_id);
create index if not exists idx_subscriptions_status on public.subscriptions (billing_status);
create index if not exists idx_billing_events_user_id on public.billing_events (user_id);
create index if not exists idx_billing_events_type on public.billing_events (event_type);
create index if not exists idx_usage_periods_user_period on public.usage_periods (user_id, period_start desc);
create index if not exists idx_founder_overrides_active on public.founder_overrides (override_active);

create or replace function public.maw_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists maw_plan_catalog_touch_updated_at on public.plan_catalog;
create trigger maw_plan_catalog_touch_updated_at
before update on public.plan_catalog
for each row execute function public.maw_touch_updated_at();

drop trigger if exists maw_billing_customers_touch_updated_at on public.billing_customers;
create trigger maw_billing_customers_touch_updated_at
before update on public.billing_customers
for each row execute function public.maw_touch_updated_at();

drop trigger if exists maw_subscriptions_touch_updated_at on public.subscriptions;
create trigger maw_subscriptions_touch_updated_at
before update on public.subscriptions
for each row execute function public.maw_touch_updated_at();

drop trigger if exists maw_usage_periods_touch_updated_at on public.usage_periods;
create trigger maw_usage_periods_touch_updated_at
before update on public.usage_periods
for each row execute function public.maw_touch_updated_at();

drop trigger if exists maw_founder_overrides_touch_updated_at on public.founder_overrides;
create trigger maw_founder_overrides_touch_updated_at
before update on public.founder_overrides
for each row execute function public.maw_touch_updated_at();

insert into public.plan_catalog (
  plan_key,
  display_name,
  public_label,
  monthly_price_cents,
  annual_price_cents,
  entitlement_tier,
  stripe_lookup_key,
  is_public,
  is_founder_plan,
  monthly_limits,
  heavy_tool_limits,
  storage_limits,
  feature_access_matrix,
  upgrade_paths,
  downgrade_behavior,
  founder_override_behavior
)
values
  (
    'free',
    'Free',
    'Free',
    null,
    null,
    'free',
    null,
    true,
    false,
    jsonb_build_object(
      'text_generations', 20,
      'image_generations', 5,
      'live_rehearsal_minutes', 0,
      'video_analysis_clips', 0,
      'saved_shows', 3,
      'saved_ideas', 10
    ),
    jsonb_build_object(
      'imageGenerationsMonthly', 5,
      'videoAnalysisClipsMonthly', 0,
      'liveRehearsalMinutesMonthly', 0,
      'maxConcurrentLiveSessions', 0,
      'maxReconnectAttemptsPerSession', 0,
      'maxVideoUploadMb', 0,
      'maxImageUploadMb', 10
    ),
    jsonb_build_object('savedShows', 3, 'savedIdeas', 10),
    jsonb_build_object(
      'EffectGenerator', true,
      'PatterEngine', true,
      'MagicWire', true,
      'Publications', true,
      'Community', true,
      'IdentifyTrick', true
    ),
    '[]'::jsonb,
    jsonb_build_object(
      'downgradeTo', 'free',
      'takesEffect', 'period_end',
      'preserveExistingProjects', true,
      'blockNewStorageWhenOverLimit', true
    ),
    jsonb_build_object('eligible', false)
  ),
  (
    'amateur',
    'Amateur',
    'Amateur',
    1595,
    null,
    'amateur',
    'amateur_monthly',
    true,
    false,
    jsonb_build_object(
      'text_generations', 200,
      'image_generations', 40,
      'live_rehearsal_minutes', 60,
      'video_analysis_clips', 10,
      'saved_shows', 25,
      'saved_ideas', 100
    ),
    jsonb_build_object(
      'imageGenerationsMonthly', 40,
      'videoAnalysisClipsMonthly', 10,
      'liveRehearsalMinutesMonthly', 60,
      'maxConcurrentLiveSessions', 1,
      'maxReconnectAttemptsPerSession', 2,
      'maxVideoUploadMb', 50,
      'maxImageUploadMb', 10
    ),
    jsonb_build_object('savedShows', 25, 'savedIdeas', 100),
    jsonb_build_object(
      'EffectGenerator', true,
      'PatterEngine', true,
      'ShowPlanner', true,
      'SavedIdeas', true,
      'Search', true,
      'MagicWire', true,
      'Publications', true,
      'Community', true,
      'IdentifyTrick', true
    ),
    jsonb_build_array('professional', 'founder_professional'),
    jsonb_build_object(
      'downgradeTo', 'free',
      'takesEffect', 'period_end',
      'preserveExistingProjects', true,
      'blockNewStorageWhenOverLimit', true
    ),
    jsonb_build_object('eligible', false)
  ),
  (
    'professional',
    'Professional',
    'Professional',
    2995,
    null,
    'professional',
    'professional_monthly',
    true,
    false,
    jsonb_build_object(
      'text_generations', 1000,
      'image_generations', 200,
      'live_rehearsal_minutes', 300,
      'video_analysis_clips', 50,
      'saved_shows', 2147483647,
      'saved_ideas', 2147483647
    ),
    jsonb_build_object(
      'imageGenerationsMonthly', 200,
      'videoAnalysisClipsMonthly', 50,
      'liveRehearsalMinutesMonthly', 300,
      'maxConcurrentLiveSessions', 2,
      'maxReconnectAttemptsPerSession', 5,
      'maxVideoUploadMb', 50,
      'maxImageUploadMb', 10
    ),
    jsonb_build_object('savedShows', 2147483647, 'savedIdeas', 2147483647),
    jsonb_build_object(
      'EffectGenerator', true,
      'PatterEngine', true,
      'ShowPlanner', true,
      'SavedIdeas', true,
      'Search', true,
      'LiveRehearsal', true,
      'VideoAnalysis', true,
      'PersonaSimulator', true,
      'VisualBrainstorm', true,
      'DirectorMode', true,
      'ImageGeneration', true,
      'CRM', true,
      'Contracts', true,
      'FinanceTracker', true,
      'MarketingGenerator', true,
      'MagicWire', true,
      'Publications', true,
      'Community', true,
      'IdentifyTrick', true,
      'AssistantStudio', true,
      'PropChecklists', true,
      'ShowFeedback', true,
      'GospelMagic', true,
      'MentalismAssistant', true,
      'IllusionBlueprint', true
    ),
    '[]'::jsonb,
    jsonb_build_object(
      'downgradeTo', 'amateur',
      'takesEffect', 'period_end',
      'preserveExistingProjects', true,
      'blockNewStorageWhenOverLimit', true
    ),
    jsonb_build_object('eligible', false)
  ),
  (
    'founder_professional',
    'Founder Professional',
    'Founder Professional',
    2995,
    null,
    'professional',
    'founder_professional_monthly',
    false,
    true,
    jsonb_build_object(
      'text_generations', 1000,
      'image_generations', 200,
      'live_rehearsal_minutes', 300,
      'video_analysis_clips', 50,
      'saved_shows', 2147483647,
      'saved_ideas', 2147483647
    ),
    jsonb_build_object(
      'imageGenerationsMonthly', 200,
      'videoAnalysisClipsMonthly', 50,
      'liveRehearsalMinutesMonthly', 300,
      'maxConcurrentLiveSessions', 2,
      'maxReconnectAttemptsPerSession', 5,
      'maxVideoUploadMb', 50,
      'maxImageUploadMb', 10
    ),
    jsonb_build_object('savedShows', 2147483647, 'savedIdeas', 2147483647),
    jsonb_build_object(
      'EffectGenerator', true,
      'PatterEngine', true,
      'ShowPlanner', true,
      'SavedIdeas', true,
      'Search', true,
      'LiveRehearsal', true,
      'VideoAnalysis', true,
      'PersonaSimulator', true,
      'VisualBrainstorm', true,
      'DirectorMode', true,
      'ImageGeneration', true,
      'CRM', true,
      'Contracts', true,
      'FinanceTracker', true,
      'MarketingGenerator', true,
      'MagicWire', true,
      'Publications', true,
      'Community', true,
      'IdentifyTrick', true,
      'AssistantStudio', true,
      'PropChecklists', true,
      'ShowFeedback', true,
      'GospelMagic', true,
      'MentalismAssistant', true,
      'IllusionBlueprint', true
    ),
    '[]'::jsonb,
    jsonb_build_object(
      'downgradeTo', 'free',
      'takesEffect', 'period_end',
      'preserveExistingProjects', true,
      'blockNewStorageWhenOverLimit', true
    ),
    jsonb_build_object(
      'eligible', true,
      'lockedPlan', 'founder_professional',
      'lockedPriceCents', 2995,
      'preventAutomaticDowngrade', true,
      'preservePriceOnReactivation', true
    )
  )
on conflict (plan_key)
do update set
  display_name = excluded.display_name,
  public_label = excluded.public_label,
  monthly_price_cents = excluded.monthly_price_cents,
  annual_price_cents = excluded.annual_price_cents,
  entitlement_tier = excluded.entitlement_tier,
  stripe_lookup_key = excluded.stripe_lookup_key,
  is_public = excluded.is_public,
  is_founder_plan = excluded.is_founder_plan,
  monthly_limits = excluded.monthly_limits,
  heavy_tool_limits = excluded.heavy_tool_limits,
  storage_limits = excluded.storage_limits,
  feature_access_matrix = excluded.feature_access_matrix,
  upgrade_paths = excluded.upgrade_paths,
  downgrade_behavior = excluded.downgrade_behavior,
  founder_override_behavior = excluded.founder_override_behavior,
  updated_at = now();
