# Admin Usage Type Fix

Fixes the Vercel TypeScript build failure introduced by the Global Admin Usage Bypass Hardening Patch.

## Issue

Vercel reported:

```text
api/_usage.ts(176,26): error TS2322: Type '"admin"' is not assignable to type 'Membership | undefined'.
api/_usage.ts(281,26): error TS2322: Type '"admin"' is not assignable to type 'Membership | undefined'.
```

The admin bypass returns correctly used `membership: 'admin'`, but the local `Membership` union in `api/_usage.ts` did not include `admin`.

## Fix

Updated the canonical server-side `Membership` type in `api/_usage.ts` to include `admin`.

No auth, billing, telemetry, schema, or AI infrastructure changes were made.
