# Operational State Anchor Patch

Implemented a Visual Brainstorm orchestration refinement that prevents operational-state prompts from replacing the requested apparatus identity.

## Scope

- UI/service prompt refinement only.
- No auth changes.
- No billing changes.
- No telemetry rewrite.
- No schema redesign.
- No global state refactor.

## Changes

- Added apparatus identity persistence rules to Visual Brainstorm prompt construction.
- Added state inheritance hierarchy: apparatus category, silhouette, geometry, base/platform, theatrical setting, then operational state.
- Blocked generic empty-stage fallback substitutions such as levitation rigs, suspension devices, black-art platforms, abstract display rigs, hoop/ring apparatuses, rope apparatuses, and unrelated stage mechanisms.
- Clarified that operational states may alter only door/panel/lid position, empty/reveal condition, performer interaction, visibility state, and lighting emphasis.
- Added explicit family-preservation examples for dog-house production, box, cabinet, platform, and pedestal prompts.

## Expected behavior

Visual Brainstorm variants should now preserve the same apparatus family across empty-display, closed-ready, reveal, and production states instead of replacing the concept with an unrelated apparatus.
