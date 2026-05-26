# Global Admin Usage Bypass Hardening Patch

## Summary

This patch hardens admin quota bypass handling across AI usage enforcement paths.

## Changes

- Added a canonical `isAdminUsageBypass(profile)` helper in server usage enforcement.
- Added temporary `[ADMIN_BYPASS]` debug logging at quota enforcement entrypoints.
- Ensured admin users return unlimited usage responses before quota, burst, daily, monthly, or decrement logic.
- Preserved telemetry by logging admin AI use as `SUCCESS_NOT_CHARGED` with `charged_units: 0`.
- Hardened legacy `/api/_usage` path so `is_admin` users are not blocked by older generation counters.
- Hardened client-side text usage helper so admin users are not blocked by frontend allowance checks.

## Enforcement paths covered

- `getAiUsageStatus`
- `enforceAiUsage`
- `enforceLiveMinutes`
- `enforceVideoUploads`
- legacy `/api/_usage`
- client usage display/helper logic

## Intentional non-changes

- No schema changes
- No auth rewrite
- No billing rewrite
- No telemetry rewrite
- No AI infrastructure rewrite
