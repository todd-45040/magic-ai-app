# Canonical Usage Enforcement Unification Patch

## Purpose
Fixes Visual Brainstorm admin quota failures where the UI recognized Admin / Unlimited access but the canonical backend image-generation quota path could still apply daily/monthly tool limits.

## Files touched
- `server/usage.ts` verified existing canonical admin bypass behavior for active image routes.
- `api/ai/_lib/usage.ts` aligned legacy/canonical helper behavior with the same admin bypass response pattern.

## Behavior
- Admin users identified by `users.is_admin = true` or `users.membership = 'admin'` bypass usage enforcement before daily, burst, and monthly tool quota checks.
- Admin bypass returns `allowed/ok` usage with unlimited remaining values.
- Admin image-generation calls are logged as `SUCCESS_NOT_CHARGED` with `charged_units: 0`.
- Admin users are not decremented from `generation_count` or monthly quota columns such as `quota_image_gen`.

## Validation checklist
1. Log in as an admin user.
2. Confirm the Usage UI still shows Admin / Unlimited.
3. Run Visual Brainstorm once.
4. Run Visual Brainstorm again.
5. Confirm no “current allowance for AI” message appears.
6. Confirm no quota decrement for the admin user in `users.generation_count` or `users.quota_image_gen`.
