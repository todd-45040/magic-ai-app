# Universal Stripe Customer Extraction Fix

This patch hardens Stripe webhook completion telemetry so payment completion analytics are not dependent on only `checkout.session.completed`.

## Updated file

- `server/billing/stripeWebhook.ts`

## What changed

- Added universal customer extraction for these Stripe event types:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_succeeded`
  - `invoice_payment.paid`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Uses `event.data.object.customer` and normalizes either string or object customer values.
- Expands tracked webhook event types so invoice payment completion events are processed instead of ignored.
- Logs both analytics events for completion-type events:
  - `checkout_completed`
  - `upgrade_completed`
- Uses `public.users.stripe_customer_id` as the direct source-of-truth lookup path.
- Keeps replay/backfill support so replayed Stripe events can fill missing telemetry after deployment.

## Test after deploy

Replay a recent Stripe event such as:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice_payment.paid`

Then run:

```sql
select event_name, count(*)
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

Expected result: `checkout_completed` and `upgrade_completed` should appear.
