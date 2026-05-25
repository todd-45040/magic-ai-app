# Saved Ideas Continue This Project Routing Patch

## Scope

This patch adds the next workflow bridge for the professional creative pipeline while avoiding auth, billing, telemetry rewrites, quota changes, and schema redesign.

## What Changed

### Saved Ideas project cards

The project grouping cards now route users to the most appropriate next creative tool instead of only opening the latest saved item.

Button labels now adapt to the project state:

- `Continue in Blueprint`
- `Continue in Patter`
- `Continue in Show Planner`
- `Continue in Effect`
- fallback: `Continue Project`

### Routing logic

The continuation target is inferred from the saved project's current assets:

- Visual Brainstorm/image projects route to Illusion Blueprint when no blueprint exists yet.
- Effect projects route to Patter Engine when no script/patter exists yet.
- Blueprint or script projects route to Show Planner.
- Image-only fallback can route to Effect Generator.

### Handoff metadata

The patch writes lightweight localStorage handoffs so the destination tool receives project context:

- `maw_project_continuity_handoff_v1`
- `maw_illusion_blueprint_visual_handoff`
- `maw_effect_engine_visual_handoff`
- `maw_patter_engine_prefill_v1`
- `maw_show_planner_routine_handoff_v1`

### Illusion Blueprint safety fix

Added a local Visual Brainstorm/Saved Ideas handoff parser in `IllusionBlueprint.tsx` so project-continuation handoffs can prefill the Illusion Blueprint tool cleanly.

## Files Modified

- `components/SavedIdeas.tsx`
- `components/IllusionBlueprint.tsx`

## Not Touched

- Billing
- Auth
- Quotas
- Telemetry architecture
- Saved Ideas database/schema shape
- Global AI service infrastructure
