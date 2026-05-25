# Illusion Blueprint Regenerate Pair A/B Patch

## Scope
Focused patch for the Illusion Blueprint page only.

## Implemented
- Added a per-pair regenerate action for matched illusion outputs.
- Added `Regenerate Pair A` and `Regenerate Pair B` controls in the Blueprint Drawings section.
- Added matching regenerate controls in the Visual Concepts section.
- Regeneration only targets the selected A/B matched pair.
- The non-selected pair is preserved.
- Existing valid images are preserved if the regenerated output fails validation.
- The regeneration path reuses the existing Illusion Identity, blueprint-to-render lock, anti-drift exclusions, and Phase 4 apparatus validation.
- Empty/rejected A/B slots now remain visible with a message instead of collapsing the pair ordering.

## Avoided
- No billing changes.
- No auth changes.
- No quota changes.
- No telemetry rewrite.
- No Saved Ideas schema rewrite.
- No global AI service refactor.
