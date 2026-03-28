# Magic AI Wizard — Phase 4 + Phase 5 Stripe Test Script

Use one clean test account for the full sequence. Do not skip ahead. After every action, capture all three sources of truth:

1. Stripe dashboard event result
2. Database row state
3. `/api/billing/status` JSON response

## Before you begin
- Confirm Stripe is still in **test mode**
- Use a fresh test user email
- Open:
  - the app billing page
  - Stripe dashboard → Developers → Events / Webhooks
  - Supabase table editor or SQL window
  - browser dev tools → Network tab

## Test 1 — New trial user
1. Sign up a new test user.
2. Confirm the email.
3. Log in.
4. Open the billing page.
5. In the Network tab, inspect `/api/billing/status`.

Record:
- trial entitlements visible
- billing page loads
- `/api/billing/status` contains:
  - `planKey`
  - `billingStatus`
  - `currentBillingCycle`
  - `renewalDate`
  - `billingTruth`
  - `recentBillingEvents`
  - `validationChecks`
  - `validationGuide`

## Test 2 — Upgrade to Amateur monthly
1. Click the Amateur monthly upgrade CTA.
2. Confirm checkout session is created.
3. Complete Stripe checkout.
4. Return to the app.
5. Refresh the billing page.
6. Inspect `/api/billing/status`.

Confirm in the app:
- top bar shows Amateur Member
- Amateur card shows Current Plan
- billing cycle is monthly
- billing state is `active` or `trialing`
- renewal date is present

Confirm in Stripe:
- checkout completed
- relevant webhook events are successful
- customer and subscription exist
- subscription status is active/trialing
- current period start/end are present
- latest invoice/payment state is present

Confirm in DB:
- billing_customers row linked to the test user
- subscriptions row linked to the same user
- `plan_key`, `billing_status`, `current_period_start`, `current_period_end`, `stripe_customer_id`, `stripe_subscription_id` populated

## Test 3 — Upgrade from Amateur to Professional
1. Click the Professional upgrade CTA.
2. Complete checkout or plan change flow.
3. Return to the app and refresh billing.

Confirm:
- Professional becomes Current Plan
- Amateur is no longer Current Plan
- entitlements update correctly
- renewal date remains accurate
- `/api/billing/status` reflects the new plan

## Test 4 — Portal session
1. Open the customer portal from the billing page.
2. Confirm the portal opens for the correct customer.
3. Return to the app.

Confirm:
- no auth/session regressions
- safe return URL
- billing page still loads
- `/api/billing/status.validationChecks.portalReady` is true

## Test 5 — Cancel flow
1. Cancel the subscription in the portal using **cancel at period end**.
2. Return to the app and refresh.

Confirm:
- `cancelAtPeriodEnd` is true
- current plan remains active until the end of the billing period
- renewal/cancel timing is still visible
- entitlements do not drop early

## Test 6 — Renewal / invoice behavior
1. Review `invoice.paid` event for the app-created subscription.
2. If you use Stripe CLI synthetic invoice events, verify they no longer crash the webhook.
3. Trigger or inspect `invoice.payment_failed` handling in test mode if available.

Confirm:
- invoice.paid processes normally
- payment-failed path is graceful
- any failed billing event appears in `recentBillingEvents` with `lastError`

## Quick interpretation guide
- Stripe looks right, DB looks wrong → webhook ingest / DB persistence
- DB looks right, resolved API looks wrong → `status.ts` resolution issue
- UI looks wrong, API looks right → UI rendering issue
- `validationGuide.likelyOwner` points to the first place to inspect
