# Blueprint Render Recovery Patch

## Purpose
Fixes a failure mode introduced by aggressive blueprint/render separation where the builder plan and dimensioned drawings complete, but matched concept renders are rejected or hidden because the render prompts or validation over-constrain the output.

## Changes
- Added a clean concept-render recovery prompt that strips all blueprint/document language.
- Reduced blueprint-oriented wording in the concept render style guide.
- Added a third recovery attempt for concept renders only.
- Preserves the last safe concept render if strict validation rejects otherwise usable staged apparatus imagery.
- Applied the same recovery path to pair regeneration.

## Guardrails preserved
- No auth changes.
- No billing changes.
- No telemetry rewrite.
- No schema redesign.
- No AI infrastructure rewrite.
- No global state refactor.
