# Illusion Blueprint Pair Image Recovery Patch

## Purpose
Prevents the Illusion Blueprint workflow from completing the builder plan while leaving the Dimensioned Blueprint Drawings or Matched Concept Renders sections empty because secondary visual validation rejected usable generated images.

## Changes
- Keeps the latest generated image as a last-resort fallback for both blueprint drawings and concept renders.
- Uses the non-rejected/safer generated image first when validation confirms apparatus, structure, stage, or subject cues.
- Converts blueprint drawing generation to `Promise.allSettled` so one failed pair does not discard the other pair.
- Updates warning copy so failed generation is treated as an incomplete pair rather than a hidden validation rejection.

## Validation
- `npm run build` completed successfully.
