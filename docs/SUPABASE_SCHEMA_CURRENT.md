# Supabase Schema Guide (Current App Surface)

This project has outgrown the old `supabase_schema.sql` bootstrap file.

Use this guide as the operational map for the current database surface.

## How to think about schema in this repo

- `supabase_schema.sql` is now the **minimal bootstrap** for the earliest local/dev tables.
- The real application schema is layered through the SQL files in `/supabase` and `/supabase/migrations`.
- For environment recreation or audits, apply the migration files in chronological/phase order rather than trusting the bootstrap file alone.

## Core domains and source files

### User / Profile / Partner attribution
- Base profile bootstrap: `supabase_schema.sql`
- IBM/SAM partner attribution: `supabase/ibm_campaign_tracking.sql`
- signup source + trial support: `supabase/ibm_signup_source_trial.sql`
- founder flags / buckets: `supabase/founding_circle_phase1.sql`, `supabase/founding_circle_step1_buckets_limits.sql`, `supabase/founding_circle_step5_is_founder.sql`
- comp access grants: `supabase/phase7_comp_access_grants.sql`

Key user-surface fields referenced by the app include:
- `membership`
- `trial_end_date`
- `signup_source`
- `ibm_ring`
- `sam_assembly`
- `partner_source`
- `partner_campaign`
- `partner_detail_type`
- `partner_detail_value`
- founder-related fields added by Founding Circle phases

### Billing / Stripe / Entitlements
Primary source files:
- `supabase/sprint3_billing_foundation.sql`
- `supabase/sprint3_webhook_hardening.sql`
- `supabase/stripe_webhook_events.sql`
- `supabase/phase1_post_launch_hardening.sql`
- `supabase/founding_circle_phase3_stripe_live_mode.sql`
- `supabase/founding_circle_phase5_stripe_lock_scaffold.sql`

Major tables in this area:
- `plan_catalog`
- `billing_customers`
- `subscriptions`
- `billing_events`
- `usage_periods`
- `founder_overrides`
- `maw_stripe_webhook_events`

### AI observability / anomaly detection / usage telemetry
Primary source files:
- `supabase/phase2b_observability.sql`
- `supabase/migrations/20260408_phase5_observability_minimal.sql`

Major tables:
- `ai_usage_events`
- `ai_anomaly_flags`
- `ai_audit_log`
- `user_activity_log`

### Quota enforcement / atomic consumption
Primary source files:
- `supabase/phase8_ibm_trial_atomic_quota.sql`
- `supabase/migrations/20260408_phase4_atomic_quota_decrements.sql`
- `supabase/migrations/20260412_ibm_live_rehearsal_daily_limit_60.sql`

Important functions:
- `maw_consume_ai_usage(...)`
- `maw_consume_live_minutes(...)`
- `maw_consume_video_uploads(...)`
- `consume_live_audio_minutes(...)`
- `consume_video_upload(...)`

### Campaign / lead capture / email queue
Primary source files:
- `supabase/ibm_campaign_tracking.sql`
- `supabase/waitlist_signups.sql`
- `supabase/founding_circle_phase1.sql`
- `supabase/founding_circle_phase3_email_activation.sql`

Major tables:
- `maw_campaign_events`
- `maw_waitlist_signups`
- `maw_founding_circle_leads`
- `maw_email_queue`

### Director Mode / saved blueprint data
Primary source file:
- `supabase/director_mode_phase2_blueprints.sql`

Major table:
- `maw_director_blueprints`

### Founder feedback / testimonials / admin ops
Primary source files:
- `supabase/founding_circle_phase7_testimonials.sql`
- `supabase/founding_circle_phase8_feedback_inbox.sql`
- `supabase/phase6_admin_ops.sql`

Major tables:
- `maw_founder_testimonials`
- `maw_founder_feedback`
- `admin_ops_notes`

## Recommended operational workflow

When debugging, onboarding, or recreating an environment:

1. Start with `supabase_schema.sql` only as a minimal bootstrap reference.
2. Apply the feature-phase SQL files under `/supabase`.
3. Apply files under `/supabase/migrations`.
4. Validate tables/functions actually used by current API routes before assuming an environment is complete.

## Why this doc exists

This guide exists to reduce drift between:
- the old bootstrap schema file
- the real production schema
- the app/API expectations

It is intentionally documentation-first so the repo has a trustworthy map of the current database surface without pretending the old bootstrap file is the full system.
