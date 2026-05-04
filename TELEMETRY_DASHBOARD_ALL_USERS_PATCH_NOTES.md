# Telemetry Dashboard All-Users Patch

## Goal
Make the Admin Telemetry/Funnel dashboard's **All Users** view truly product-wide instead of limiting the query to IBM + SAM partner traffic.

## Files Updated

### `api/adminIbmFunnel.ts`
- Changed `source=all` behavior so it applies **no `partner_source` filter** to `analytics_events`.
- Changed user filtering so `source=all` includes every user returned by the admin query.
- Kept `source=ibm` and `source=sam` partner-specific filtering intact.
- Updated the campaign label from `All Partners` to `All Users`.

### `components/AdminIbmDashboard.tsx`
- Updated the filter label from `All` to `All Users`.
- Updated dashboard description to clarify the dashboard compares all users, IBM, or SAM.
- Updated fallback label from `All Partners` to `All Users`.

### `services/adminIbmFunnelService.ts`
- Updated the fetch error message from partner-funnel wording to product-funnel wording.

## DB Changes
None.

## Expected Result
When the dashboard filter is set to **All Users**, activation telemetry now includes users with:
- `partner_source = ibm`
- `partner_source = sam`
- `partner_source = organic`
- `partner_source = direct`
- `partner_source = admc`
- `partner_source = null`

IBM and SAM filters still work as campaign-specific views.

## Validation Note
A local build could not be run in the patch environment because dependencies were not installed in the extracted zip (`vite: not found`). Run `npm install` or `pnpm install`, then `npm run build` locally/Vercel after applying.
