# Stripe Webhook Completion Direct Fix

This patch strengthens Stripe completion telemetry so `checkout_completed` and `upgrade_completed` are logged even when a Stripe event is replayed or the original `billing_events` row already exists.

## What changed

- Added direct completion telemetry logging for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `invoice.paid`
- Uses `public.users.stripe_customer_id = Stripe customer id` as the primary fallback lookup.
- Handles Stripe `customer` values whether Stripe sends a string id or expanded customer object.
- Backfills completion telemetry on duplicate/replayed Stripe events instead of returning early.
- Logs both:
  - `checkout_completed` for checkout session completion
  - `upgrade_completed` for checkout/session/subscription/invoice completion signals

## Why this matters

The upgrade flow was correctly sending users to Stripe and updating `public.users.membership`, but analytics was not showing `checkout_completed` or `upgrade_completed`. This patch closes that measurement gap so the dashboard can report the full funnel:

activation → saved idea → locked feature → checkout started → checkout completed → upgrade completed

## Test query

```sql
select
  event_name,
  count(*) as count
from analytics_events
where event_name in (
  'upgrade_intent_clicked',
  'upgrade_checkout_started',
  'checkout_completed',
  'upgrade_completed'
)
group by event_name
order by count desc;
```

If you have already completed a Stripe checkout, use Stripe Dashboard → Developers → Events and replay the latest `checkout.session.completed` event to your production webhook endpoint after deploying this patch.
