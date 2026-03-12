# Sprint 3D + 3H — Webhook Architecture + Environment Hygiene

This phase locks Stripe into the correct role:

- **Entitlements are the product truth**
- **Stripe is the payment truth**
- **Webhooks synchronize them**

## Added in this phase

### Webhook processing
- `api/stripeWebhook.ts` now uses a centralized server-side webhook processor.
- Raw-body signature verification remains required.
- Verification supports both:
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_WEBHOOK_SECRET_NEXT`

This allows secret rotation without downtime.

### Centralized Stripe billing helpers
- `server/billing/stripeConfig.ts`
  - environment/hygiene checks
  - server-only secret sanity rules
  - secret-rotation support
  - log sanitization helpers
- `server/billing/stripeWebhook.ts`
  - signature verification
  - event logging before mutation
  - duplicate-event handling
  - subscription/customer sync
  - founder override sync
  - safe retry behavior

## Supported webhook events
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## Safety behavior

### Idempotency
The webhook writes to `billing_events` first using `stripe_event_id` as the dedupe anchor.
Already-processed events return success without mutating subscription state again.

### Event logging before mutation
Each supported event is written to `billing_events` in `received` state before any subscription/customer updates happen.

### Safe retries
If processing fails after receipt logging, the event is marked `failed` and the endpoint returns `500` so Stripe can retry safely.

### Signature verification
Unsigned or invalid-signature events are rejected.
No client success signal is trusted for access changes.

### No direct UI assumptions
The webhook updates billing records only.
UI must read synchronized server state instead of assuming checkout success equals paid access.

## Environment hygiene added
- Admin Stripe readiness output now includes:
  - Stripe key mode (`test` / `live` / `unknown`)
  - webhook secret rotation status
  - client-exposed secret-like env warnings
  - production/test mismatch warnings
- Production env template now includes `STRIPE_WEBHOOK_SECRET_NEXT`

## Recommended follow-up
Next move is Sprint 3F + 3G:
- upgrade UX standardization
- founder pricing / reactivation safety verification
