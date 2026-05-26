# Workspace Assistant Suggestions Patch

## Scope

Targeted UI and metadata-only enhancement to the Project Workspace intelligence layer.

## Files Changed

- `components/ProjectWorkspace.tsx`

## Implemented

- Added metadata-driven Workspace Assistant suggestion cards inside Project Workspace.
- Suggestions are project-aware and infer next steps from linked assets, asset categories, source tools, images, scripts, blueprints, rehearsal notes, and show-planning signals.
- Added practical next-step recommendations such as:
  - Generate a realistic blueprint pair
  - Write the performance script
  - Rehearse the script next
  - Add this routine to Show Planner
  - Review the full project workspace
- Added confidence labels and workflow-oriented suggestion categories.
- Suggestion buttons reuse existing `continueProject` handoff logic so project context, linked asset IDs, image anchors, and continuity metadata are preserved.
- Added lightweight localStorage memory at `maw_workspace_assistant_suggestions_v1` for the current suggestion state and accepted suggestion target.

## Avoided

- No auth changes
- No billing changes
- No telemetry rewrites
- No schema redesign
- No AI infrastructure rewrites
- No global state refactors
- No routing architecture rewrite

## Validation

- `npm run build` completed successfully.
- Existing Vite warnings remain pre-existing chunk/manual chunk warnings and environment variable notices.
