# Upgrade Button Telemetry Fix

This patch fixes the missing telemetry handoff between an upgrade prompt and Stripe checkout.

## What changed

- Added `logEventAsync()` to `services/analyticsService.ts` so critical telemetry can be awaited before navigation.
- Updated `App.tsx` upgrade flow to log `upgrade_intent_clicked` immediately when a user clicks an upgrade CTA.
- Updated `App.tsx` checkout handoff to log `upgrade_checkout_started` immediately before redirecting to Stripe.
- Preserved existing IBM/SAM partner funnel activity events (`upgrade_clicked` and `checkout_started`) for dashboard compatibility.

## Events to verify

After clicking an upgrade button from a conversion modal, Supabase `analytics_events` should include:

- `upgrade_intent_clicked`
- `upgrade_checkout_started`

Existing events should continue to appear:

- `upgrade_prompt_shown`
- `locked_feature_clicked`
- `upgrade_clicked` / `checkout_started` in user activity partner funnel tracking

## Test path

1. Log in as a trial user.
2. Trigger a locked feature or friction limit.
3. Confirm the upgrade modal appears.
4. Click an upgrade button.
5. Verify Stripe opens.
6. Run:

```sql
select event_name, count(*)
from analytics_events
group by event_name
order by count desc;
```

Expected new rows:

```text
upgrade_intent_clicked
upgrade_checkout_started
```
