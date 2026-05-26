# Visual Brainstorm Seed Selection Patch

## Purpose

Fixes the workflow where Visual Brainstorm routed to Illusion Blueprint without clearly carrying a selected image into the blueprint page.

## Changes

- Moved the Illusion Blueprint action into each generated variation card.
- Added explicit per-image buttons: `Use V1 in Blueprint`, `Use V2 in Blueprint`, etc.
- Disabled the global `Use in Blueprint` action when multiple variations exist and changed its label to `Choose Image Above`.
- Transfers selected image metadata into `maw_illusion_blueprint_visual_handoff`, including:
  - selected image URL
  - source prompt
  - concept title
  - selected variation index
  - history/session IDs
  - project continuity metadata
- Dispatches a `maw:illusion-blueprint-handoff` event for robust in-app routing.
- Illusion Blueprint now reads the selected seed image and displays it as an imported Visual Brainstorm reference.
- Illusion Blueprint preloads the selected prompt/image context into the builder request.

## Scope Guardrails

This patch intentionally avoids:

- auth changes
- billing changes
- telemetry rewrites
- global routing rewrites
- database/schema redesign
