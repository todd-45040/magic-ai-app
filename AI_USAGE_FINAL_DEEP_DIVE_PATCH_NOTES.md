# AI Usage Final Deep Dive Patch Notes

Patch focus: make image-generation usage enforcement truthful and prevent admin accounts from being blocked by side-door limiters.

## What was found

1. `/api/ai/image` had a route-level per-minute limiter that ran before canonical usage enforcement. Admin bypass existed inside `server/usage.ts`, but this preflight route limiter could still block image generation before admin status was recognized.
2. Image requests were retried client-side through `postJson`. For high-cost image calls, a provider/network failure could cause multiple full server calls for one click, which could reserve usage more than once for general users.
3. Usage was reserved before the upstream provider call, but failed provider calls did not refund the reserved usage. This made general-user limits drift downward after failed Imagen/OpenAI requests.
4. Client-side blocked/error heuristics still treated generic provider quota language as account quota language in some no-code/legacy error cases.

## Files changed

- `api/ai/image.ts`
- `api/edit-images.ts`
- `server/usage.ts`
- `services/geminiService.ts`
- `services/blockedUx.ts`

## Changes

- Added admin-aware route limiter behavior in `/api/ai/image`:
  - Reads canonical usage status first.
  - Skips the image route-level rate limiter for `membership === "admin"`.
  - Still applies route limiter to non-admin users before usage is reserved.
- Moved image prompt validation before quota reservation.
- Added `refundAiUsage()` in `server/usage.ts`:
  - Best-effort rollback of `generation_count` and monthly tool quota when the upstream provider fails after usage reservation.
  - No-ops for admin users.
  - Logs `ERROR_UPSTREAM_REFUNDED` telemetry.
- Disabled client-side retries for high-cost image generation/edit calls:
  - Prevents one click from becoming multiple charged server calls.
- Tightened `normalizeBlockedUx()`:
  - Provider quota/capacity wording now maps to temporary service unavailability, not account allowance/upgrade copy.

## Expected behavior

- Admin accounts should not be blocked by app usage quotas or the image route burst limiter.
- Admin accounts should not be charged against image quotas.
- General users should still be limited by daily/monthly/burst rules.
- Failed provider image calls should not permanently consume general-user quota.
- The “current allowance” message should only appear for true app/user quota exhaustion, not provider capacity errors.

## Build validation

`npm run build` passed with existing Vite chunk warnings only.
