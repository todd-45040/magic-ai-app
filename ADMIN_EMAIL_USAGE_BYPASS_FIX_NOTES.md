# Admin Email Usage Bypass Fix

## Problem
Visual Brainstorm could still show the AI allowance restriction for the admin account when the client UI recognized the user as Admin / Unlimited, but the server-side usage enforcement did not see a matching `users.is_admin` or `users.membership = 'admin'` profile row.

## Fix
- Added canonical server-side admin email fallback inside `server/usage.ts`.
- Mirrored the same fallback in `api/ai/_lib/usage.ts` for compatibility.
- If a signed-in user's email matches configured admin emails, usage enforcement now treats the request as admin even if the profile row is missing/stale.
- Added best-effort self-heal to upsert the admin profile as `membership: 'admin'` and `is_admin: true`.
- Admin requests still log `[ADMIN_BYPASS]` and are returned as `SUCCESS_NOT_CHARGED`.

## Files touched
- `server/usage.ts`
- `api/ai/_lib/usage.ts`

## Validation
- `npm run build` passes.
- Existing Vite chunk warnings only.
