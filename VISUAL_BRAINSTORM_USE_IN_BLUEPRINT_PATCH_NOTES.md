# Visual Brainstorm → Illusion Blueprint Workflow Patch

## Goal
Add a focused workflow bridge so a Visual Brainstorm concept can be continued directly inside the Illusion Blueprint Generator.

## Changes

### Visual Brainstorm
- Added a `Use in Blueprint` action beside generated visual outputs.
- Creates a lightweight handoff payload in localStorage using `maw_illusion_blueprint_visual_handoff`.
- Preserves:
  - generated image URL
  - original visual prompt
  - concept title
  - history/session ids when available
  - creative project continuity metadata
- Navigates directly to the `illusion-blueprint` view.

### Illusion Blueprint
- Reads the Visual Brainstorm handoff on mount.
- Prefills the main illusion/effect request with the visual concept context.
- Adds the image reference and project title to Special Notes.
- Shows an “Imported from Visual Brainstorm” banner with the reference image.
- Clears the handoff after import so future visits are not accidentally prefilled.

## Guardrails
This patch intentionally avoids:
- billing changes
- auth changes
- quota changes
- telemetry rewrites
- Saved Ideas schema changes
- global AI service refactors

## Validation Notes
A full local Vite build could not be run in this environment because project dependencies/pnpm are not installed here. Static inspection confirmed the new handoff key, button handler, navigation event, and Illusion Blueprint prefill logic are present.
