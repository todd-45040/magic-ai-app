# Payment Tracking + Conversion Dashboard Patch

Implemented after the upgrade telemetry fix.

## Added

- Stripe webhook now logs `upgrade_completed` into `analytics_events` when `checkout.session.completed` is successfully processed.
- Stripe webhook also mirrors the completed checkout into `user_activity_log` as `checkout_completed` for dashboard compatibility.
- The webhook payload includes plan, billing status, Stripe event/session/subscription/customer IDs, and partner source.
- Admin partner funnel API now supports both `partner_source` and legacy `signup_source` user attribution.
- Admin partner funnel API now aggregates current conversion telemetry names:
  - `upgrade_prompt_shown`
  - `locked_feature_clicked`
  - `save_limit_hit`
  - `limit_hit_ai_generation`
  - `rehearsal_limit_hit`
  - `upgrade_intent_clicked`
  - `upgrade_checkout_started`
  - `upgrade_completed`
- Admin overview dashboard now shows the updated conversion event chain and prompt-to-click / checkout-to-paid rates.

## Verification

After completing a Stripe checkout, run:

```sql
select event_name, count(*)
from analytics_events
group by event_name
order by count desc;
```

Expected new event:

```text
upgrade_completed
```

Also verify the Admin Dashboard partner filter with All / IBM / SAM.
