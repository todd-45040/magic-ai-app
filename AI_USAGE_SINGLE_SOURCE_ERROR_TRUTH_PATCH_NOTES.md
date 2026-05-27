# AI Usage Single Source + Error Truth Patch

## Purpose
This patch consolidates AI usage enforcement so image and structured AI routes no longer drift into separate quota paths.

## Changes
- `api/ai/_lib/usageGuard.ts`
  - Replaced the old status-then-increment flow with a single call to canonical `server/usage.ts::enforceAiUsage()`.
  - Converted the old post-success increment function into a no-op to prevent double charging and second-pass quota failures.
  - Preserves standard hardened error codes.

- `api/ai/image.ts`
  - Keeps image generation on canonical usage enforcement.
  - Fixes error-code truth: quota UI is now returned only for true usage/quota errors.
  - Provider/server failures now surface as service/rate/auth errors instead of being collapsed into quota messaging.

- `api/edit-images.ts`
  - Aligns legacy image-edit errors with the same `{ ok, error_code, message, retryable }` contract.

- `server/usage.ts`
  - Adds `[AI_USAGE_DENIED]` logging with route, tool, userId, membership, status, reason, remaining, and limit for quota/rate/tier blocks.
  - Keeps `[ADMIN_BYPASS]` logging for admin/unlimited access.

- `services/geminiService.ts`
  - Preserves `status`, `error_code`, `retryable`, and details when normalizing image errors so frontend UI does not infer quota from generic failure text.

## Verification
- `npm run build` completed successfully.
- Existing Vite chunk warnings remain unchanged.

## Expected behavior
- Admin users bypass AI usage checks consistently.
- Admin image requests are not charged.
- Visual Brainstorm and Illusion Blueprint image generation use the same canonical enforcement path.
- The upgrade/allowance message appears only for real quota failures.
- Backend logs identify the exact denied route/tool/membership if a block occurs.
