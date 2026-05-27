# Illusion Blueprint Pair Generation Stability Patch

Version: 1.8.4 patch

## Goal
Keep the Illusion Blueprint page producing the two paired blueprint/concept image sets after admin quota bypass was fixed.

## Change
- Updated `components/IllusionBlueprint.tsx`.
- Changed matched image generation from strict retry/validation blocking to a single primary image generation per pair.
- Validation is now treated as a support check, not a hard blocker that can blank the gallery.
- Concept renders receive one recovery prompt only if the primary image request itself fails.

## Why
The prior strict validation/retry path could create many image requests for one Illusion Blueprint run. That increased the chance of rate-limit/provider failures and caused completed image attempts to be replaced with “rejected by validation” placeholders.

## Expected result
A normal Illusion Blueprint run should populate:
- Blueprint A
- Blueprint B
- Concept A
- Concept B

Users can still regenerate Pair A or Pair B if one result is visually weak.
