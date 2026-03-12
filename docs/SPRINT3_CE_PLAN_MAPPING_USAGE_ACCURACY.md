# Sprint 3C + 3E — Plan Mapping + Usage Accuracy

This update centralizes billing-to-entitlement resolution and aligns usage displays with server-side quota truth.

## Added

- `server/billing/planMapping.ts`
  - canonical Stripe lookup/product/price -> internal plan mapping
  - centralized subscription-status behavior
  - centralized usage quota config used by server usage endpoints
  - next monthly reset calculator for quota UI

## Billing mapping behavior

- `active` -> keep requested plan entitlements active
- `trialing` -> keep requested plan entitlements active
- `past_due` -> keep access in grace state until later webhook logic changes it
- `canceled` with time left in current period -> keep access until period end
- `canceled` after period end -> fall back to free access
- `incomplete` -> do not grant paid entitlements yet
- `unpaid` / `incomplete_expired` / `paused` -> fall back to free access

## Usage accuracy changes

- server usage endpoints now read monthly heavy-tool quotas from the billing plan mapping layer
- monthly quota limits shown in the UI now match the same server config used for enforcement defaults
- usage payload now returns `quota.nextResetAt`
- Usage & Limits card now distinguishes:
  - daily AI reset window
  - monthly quota reset window

## Important note

The modern AI request flow already avoids duplicate charging by:

- checking usage before provider call
- suppressing duplicate requests
- charging usage after successful upstream completion in the hardened request path

Older legacy endpoints may still use direct usage charging and should be migrated in a later cleanup pass if you want every endpoint to follow the exact same post-success accounting model.
