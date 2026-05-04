# Entitlement Lockdown Patch Notes

## Purpose

This patch makes the app's entitlement logic consistent across frontend, server entitlement checks, and server usage enforcement.

Canonical access rule:

```ts
Professional access is granted when:
trial_end_date > Date.now()
OR Stripe subscription status is active/trialing
OR membership is already professional/admin
```

## Files Updated

- `types.ts`
  - Added Stripe billing snapshot fields to the `User` interface.

- `services/membershipService.ts`
  - Added `hasActivePaidSubscription()`.
  - Updated `getEffectiveMembership()` so active paid Stripe users are not locked out if frontend membership state lags after checkout.

- `services/usersService.ts`
  - Hydrates Stripe fields from `public.users` into the frontend user object.
  - Reads Stripe fields when preserving an existing user row.

- `server/conversion/entitlementMiddleware.ts`
  - Updated server entitlement resolution to include active/trialing Stripe subscription fallback.
  - Expanded DB profile select to include Stripe fields.

- `api/conversion/entitlement-status.ts`
  - Returns Stripe status/debug presence fields for entitlement verification.

- `api/ai/_lib/usage.ts`
  - Added active Stripe fallback to usage entitlement resolution.
  - Expanded user selects to include Stripe fields.

- `server/usage.ts`
  - Mirrored the active Stripe fallback in the server usage copy.
  - Expanded user selects to include Stripe fields.

- `api/_usage.ts`
  - Added active Stripe fallback to the legacy usage helper.

## Validation

`npm run build` completed successfully in the patched package.

Build warnings remain pre-existing/chunk-related Vite warnings, not entitlement patch failures.

## Database

No database migration is required.

This patch uses existing columns:

- `stripe_status`
- `stripe_customer_id`
- `stripe_subscription_id`
- `stripe_price_id`
- `trial_end_date`
- `membership`
