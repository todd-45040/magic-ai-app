# Stripe Webhook Completion Telemetry Patch

## Purpose

This patch fixes the gap where Stripe successfully upgraded a user in `public.users`, but the analytics funnel did not record payment completion events.

## Updated

- `server/billing/stripeWebhook.ts`

## What Changed

The Stripe webhook now logs server-side analytics for these completion events:

- `checkout_completed`
- `upgrade_completed`

The webhook completion telemetry runs for:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `invoice.paid`

The lookup path uses the canonical billing identity chain:

1. metadata/client reference user id when present
2. Stripe subscription id via `subscriptions`
3. Stripe customer id via `billing_customers`
4. Stripe customer id via `public.users.stripe_customer_id`

## Important Test Note

Stripe webhook events are deduplicated through `billing_events`. If you resend an old Stripe event that was already marked `processed`, the webhook will return early as a duplicate and may not create new analytics rows. For a clean test, run a fresh test checkout or use a new Stripe event.

## Verification SQL

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

Expected after a fresh paid checkout:

```text
upgrade_intent_clicked
upgrade_checkout_started
checkout_completed
upgrade_completed
```
