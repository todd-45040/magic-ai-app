# Illusion Blueprint Matched Pair UX Polish

Implemented a focused UI polish pass for the Illusion Blueprint page after the blueprint/render continuity updates.

## Scope

Only updated `components/IllusionBlueprint.tsx`.

Did not touch:

- billing
- auth
- quotas
- telemetry schema
- Saved Ideas schema
- global AI service architecture
- unrelated lint cleanup

## Changes

### 1. Preserve A/B matched output slots

Previously, failed image validation results were filtered out. That could cause a successful Blueprint B or Concept B to shift into the A position in the UI.

This patch keeps the two matched slots intact:

- Blueprint A remains Blueprint A
- Blueprint B remains Blueprint B
- Concept A remains paired to Blueprint A
- Concept B remains paired to Blueprint B

Rejected or unavailable images now remain represented in their original slot.

### 2. Added matched-pair labels

The UI now communicates:

- Blueprint A → Concept A
- Blueprint B → Concept B

This makes it clearer that the concept render is intended to match the corresponding blueprint.

### 3. Added validation/rejection badges

Added small status badges:

- Pair A · Validated
- Pair B · Validated
- Pair A · Rejected
- Pair B · Rejected

### 4. Improved rejected-output messaging

If an image fails the apparatus/continuity validation, the page explains that the rejected slot was hidden because it did not match the illusion apparatus or stage context.

### 5. Export/save text preserves matched relationship

The copied/saved builder plan text now includes a matched-pair summary showing whether each Blueprint/Concept pair was fully validated, partially available, or rejected.

## Build Note

A full local production build could not be run in this environment because pnpm dependencies are not available locally and the environment cannot download pnpm from the npm registry. The patch was kept intentionally narrow and syntax was checked with the available TypeScript compiler as far as possible without installed React/project dependencies.
