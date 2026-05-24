# Trial Quota Monthly Used Wording Patch

## Purpose
Polishes the Usage & Limits panel wording for trial users so monthly image and Identify Trick quotas display as usage consumed rather than remaining quota.

## Updated behavior
- Image Generation now displays: `Monthly used: 0 / 30` for a fresh trial user.
- Identify a Trick now displays: `Monthly used: 0 / 40` for a fresh trial user.

## File changed
- `components/UsageLimitsCard.tsx`

## Notes
- This is a presentation-only polish.
- It does not alter server-side quota enforcement.
- It removes the confusing `Trial remaining` wording from the visible usage card path.
