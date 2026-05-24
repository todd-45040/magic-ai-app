# Trial Quota Safety Patch

## Purpose

Active normal, IBM, and SAM trial users should keep trial access to evaluation features, but server-side usage enforcement should no longer resolve active trials as `professional` for quotas.

## Implemented Changes

### 1. Dedicated active-trial usage bucket

Updated server-side usage enforcement so:

```ts
effectiveMembership = 'trial'
```

while `membership === 'trial'` and `trial_end_date` is still active.

This change was applied in both usage enforcement copies:

- `server/usage.ts`
- `api/ai/_lib/usage.ts`

The conversion entitlement middleware was intentionally left unchanged so active trial users can still reach Pro-level evaluation features where existing feature policy allows it.

### 2. Updated canonical trial quotas

Updated `server/billing/planMapping.ts` trial quota config:

| Feature | Daily | Monthly |
|---|---:|---:|
| General AI generations | 50 | N/A |
| Live Rehearsal | 60 minutes | 300 minutes |
| Image Generation / Visual Brainstorm | 3 requests/day | 30 image units/month |
| Identify Trick | 6 images/day | 40 images/month |
| Video Uploads | 2 uploads/day | 20 uploads/month |

Note: Image Generation daily enforcement is request-based because the tool currently returns 2 images per request. Monthly Image Generation remains unit/image-based against `quota_image_gen`.

### 3. Daily Image / Identify enforcement

Added daily metered-tool checks for:

- `image_generation`
- `visual_brainstorm`
- `identify_trick`

These checks use `ai_usage_events` to count successful usage since UTC day start before allowing another request.

### 4. Existing active trial quota correction

If an active trial user still has older Professional-sized monthly quota balances, the monthly quota initializer now lowers those active-trial balances back to the new trial caps.

## Files Changed

- `server/billing/planMapping.ts`
- `server/usage.ts`
- `api/ai/_lib/usage.ts`
- `TRIAL_QUOTA_SAFETY_PATCH_NOTES.md`

## Validation Note

Build validation could not be run in this extracted package because dependencies are not installed in the workspace (`vite: not found`). Run the normal project build after installing/restoring dependencies.
