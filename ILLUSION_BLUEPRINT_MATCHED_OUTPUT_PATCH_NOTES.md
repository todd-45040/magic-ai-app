# Illusion Blueprint Matched Output Patch

This patch reconciles the Illusion Blueprint visual outputs so the page now generates two blueprint/concept pairs instead of two blueprints plus three unrelated concept images.

## Changes

- Added `ILLUSION_BLUEPRINT_MATCHED_OUTPUTS` with fixed A/B design directives.
- Updated blueprint prompts so Blueprint A and Blueprint B are generated individually as matched design directions.
- Updated concept image prompts so Concept A matches Blueprint A and Concept B matches Blueprint B.
- Changed image generation calls from one 2-count blueprint request and one 3-count concept request to paired one-image requests.
- Limited the Visual Concepts section to two generated concept images.
- Updated supporting UI copy to describe two matched blueprint/concept pairs.

## Scope

No changes were made to billing, quotas, memberships, database schema, Saved Ideas, or trial logic.

## Validation

`npm run build` completed successfully before node_modules and dist were removed from the returned ZIP.
