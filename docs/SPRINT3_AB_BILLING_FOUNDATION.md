# Sprint 3A + 3B Billing Foundation

This update introduces the billing foundation for Magic AI Wizard before live Stripe wiring.

## Added

- `services/planCatalog.ts`
  - Canonical billing plan catalog for:
    - Free
    - Amateur
    - Professional
    - Founder Professional
  - Locks:
    - plan ids
    - monthly limits
    - heavy-tool limits
    - storage limits
    - feature access matrix
    - upgrade path rules
    - downgrade behavior
    - founder override behavior

- `supabase/sprint3_billing_foundation.sql`
  - Creates billing-domain tables:
    - `plan_catalog`
    - `billing_customers`
    - `subscriptions`
    - `billing_events`
    - `usage_periods`
    - `founder_overrides`
  - Includes source-of-truth sync timestamps and seed plan rows.

## Updated

- `services/entitlements.ts`
  - Now reads plan limits from the canonical billing plan catalog instead of maintaining a second hard-coded pricing matrix for billable plans.
  - Founder Professional resolves to Professional entitlements while preserving separate billing identity.

## Key rule enforced

Stripe should not decide access.

- Stripe/webhooks update subscription state.
- The entitlement layer continues to decide tool access and usage limits.
- Founder overrides remain separate from public pricing.
