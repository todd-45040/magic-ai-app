# Trial Quota Display + Enforcement Follow-up Fix

This patch corrects the follow-up issue where a newly created trial user still saw old trial tool limits in the Usage & Limits card.

## Root cause

The previous quota patch updated the server quota catalog, but parts of the client-side usage presentation still had older fallback values:

- Trial Image Generation fallback: `2/day`
- Trial Identify a Trick fallback: `10/day`
- Trial Live Rehearsal fallback: `10-20 minutes/day` in some UI paths
- Trial Video Upload fallback: `1/day`

The Usage & Limits card also still forced an active trial into the `professional` display bucket in one UI resolver, so the badge could show `Professional` even while the server was returning trial-safe daily AI limits.

## Changes made

### Server usage status

Files:

- `server/usage.ts`
- `api/ai/_lib/usage.ts`

Added daily quota status for:

- Image Generation / Visual Brainstorm
- Identify a Trick

The usage status response now includes daily usage objects for image and identify quotas, matching the already-existing live rehearsal and video upload daily objects.

Image daily usage includes both server tool names:

- `image_generation`
- `visual_brainstorm`

### Client usage presentation

Files:

- `components/MagicianMode.tsx`
- `components/UsageLimitsCard.tsx`
- `services/usagePresentation.ts`
- `services/usageStatusService.ts`
- `services/usageTracker.ts`

Updated trial UI fallback limits to:

- Daily AI generations: `50/day`
- Live Rehearsal: `60 min/day`, `300/month`
- Image Generation: `3/day`, `30/month`
- Identify a Trick: `6/day`, `40/month`
- Video Rehearsal Uploads: `2/day`, `20/month`

Active trial users now display as `trial` in the Usage & Limits panel, not `professional`, while existing entitlement access behavior remains unchanged.

## Expected verification

For a new active trial user, the Usage & Limits card should show:

- Badge: `14-Day Trial`
- Daily AI usage: `0 used • 50 remaining`
- Live Rehearsal: `Daily: 0 / 60 min`
- Image Generation: `Daily: 0 / 3`, monthly/trial remaining `30 / 30`
- Identify a Trick: `Daily: 0 / 6`, monthly/trial remaining `40 / 40`
- Video Rehearsal Uploads: `Daily: 0 / 2`

