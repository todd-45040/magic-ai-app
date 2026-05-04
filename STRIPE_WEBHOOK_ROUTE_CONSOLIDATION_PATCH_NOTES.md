# Stripe Webhook Route Consolidation Patch

## Purpose

Consolidates the live Stripe webhook route so `/api/stripe/webhook` uses the centralized production billing processor in `server/billing/stripeWebhook.ts`.

## Updated File

- `api/stripe/webhook.ts`

## What Changed

The route now delegates to:

- `processStripeWebhook(...)`
- `readRawBody(...)`
- `getStripeEnvironmentReport(...)`

This aligns the live nested Stripe endpoint with the centralized processor already used by `api/stripeWebhook.ts`.

## Why This Matters

Before this patch, the app had two webhook implementations:

- `api/stripe/webhook.ts` contained a separate inline processor.
- `api/stripeWebhook.ts` used the centralized billing processor.

If Stripe was configured to call `/api/stripe/webhook`, it could bypass the newer centralized billing logic.

## Expected Result

Stripe events sent to `/api/stripe/webhook` now use the same centralized logic for:

- signature verification
- webhook environment checks
- idempotent billing event receipt handling
- subscription/user membership sync
- checkout and upgrade telemetry
- duplicate replay handling
- Stripe webhook health mirroring

## Post-Deploy Test

After deployment:

1. In Stripe, confirm the webhook endpoint is pointed to:
   - `https://www.magicaiwizard.com/api/stripe/webhook`
2. Send or replay a test event such as:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.updated`
3. Confirm database updates:
   - `billing_events` receives/updates the Stripe event
   - `users.stripe_customer_id` remains mapped
   - `users.membership` and `users.stripe_status` update correctly
   - `analytics_events` logs `checkout_completed` / `upgrade_completed` where appropriate
