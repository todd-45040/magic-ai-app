# Admin Email Canonical Bypass Patch

## Issue
Visual Brainstorm image generation was still returning the user-facing quota message:

> You have reached the current allowance for AI. Upgrade for more capacity or wait until your usage resets.

The previous patch only bypassed admins when `users.is_admin = true` or `users.membership = 'admin'`, and only used the configured admin email fallback when no profile row existed. If a real profile row existed but had stale entitlement fields, the canonical image-generation quota path still treated the admin as a normal quota-limited user.

## Fix
Updated canonical usage enforcement so configured admin emails are promoted to the same internal admin bypass shape even when a stale/non-admin profile row exists.

Patched:

- `server/usage.ts`
- `api/_usage.ts`

## Behavior
For a configured admin email, usage enforcement now resolves an effective profile with:

```ts
membership: 'admin'
is_admin: true
```

before daily AI, burst, daily image, and monthly image quota checks run.

Admins still log `SUCCESS_NOT_CHARGED` and receive unlimited usage response headers.

## Verification
`npm run build` passed.

Existing Vite circular/manual chunk warnings remain unchanged.
