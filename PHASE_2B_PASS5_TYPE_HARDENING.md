# Phase 2B Pass 5 — Type hardening

This pass adds shared TypeScript billing unions and contracts, then applies them to the active billing layer.

## Shared billing types

Defined in `services/billingTypes.ts`:

- `MembershipTier`
- `CheckoutLookupKey`
- `SubscriptionStatus`
- `BillingAccessState`
- `BillingStatusContract`
- `CheckoutSessionContract`
- `PortalSessionContract`

## Applied updates

- `services/billingClient.ts` now reuses the shared billing contracts instead of repeating loose inline shapes
- `server/billing/status.ts` now returns the shared `BillingStatusContract`
- `server/billing/planMapping.ts` now uses shared `SubscriptionStatus` and `BillingAccessState`
- `server/billing/billingConfig.ts` now reuses the shared `CheckoutLookupKey` union
- `server/billing/stripeWebhook.ts` now narrows webhook-derived billing status values to `SubscriptionStatus`
- `api/billing/create-checkout-session.ts` now narrows request lookup keys to `CheckoutLookupKey`
- `components/BillingSettings.tsx` now types status badge styling against `SubscriptionStatus`

## Outcome

This reduces future Stripe mismatch risk by tightening:

- checkout lookup keys
- subscription status values
- billing status payload contracts
- UI handling of billing lifecycle states

The current runtime field names were preserved to avoid unnecessary behavioral risk during the hardening sprint.
