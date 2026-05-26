# Visual Brainstorm Stage Composition Lock Patch

## Purpose
Tightens the Visual Brainstorm realism prompt after repeated image-model failures where Halloween/haunted prop prompts created disembodied hands and partial arms at the edges of the image.

## What changed
- Replaced heavy repeated anatomical negative wording with a cleaner composition-first staging lock.
- Added strict prop-showcase detection for apparatus, production boxes, dog houses, cabinets, platforms, pedestals, stands, displays, and fog-machine concepts.
- For prop-showcase concepts, the generated prompt now requires exactly one complete magician/presenter beside the apparatus.
- Suppresses assistants, spectators, reaching audience interaction, side-of-frame people, and horror-body staging unless explicitly requested.
- Halloween/haunted/scary concepts are now directed to express mood through lighting, scenic texture, aged paint, and fog instead of surreal body-part imagery.

## Files changed
- `services/buildVisualBrainstormPrompt.ts`

## Avoided
- Auth changes
- Billing changes
- Telemetry rewrites
- Schema redesign
- AI infrastructure rewrites
- Global state refactors
