# Guided Creator Session — Phase 1 Patch Notes

## Scope
Added the initial webpage-based Guided Creator Session landing component.

## New file
- `components/GuidedCreatorSession.tsx`

## Behavior
- Displays a focused landing page with the message:
  - `Welcome to Magic AI Wizard.`
  - `Let’s create something together.`
- Presents only three path cards:
  - Create a new effect
  - Improve my patter
  - Prepare a performance
- Does not expose the full dashboard, giant tool menu, or navigation tree.
- Accepts an optional `onPathSelect(path)` callback so Phase 2 can route selected paths without rewriting this component.

## Telemetry
- Logs `guided_creator_viewed` once per component mount.
- Logs `guided_creator_path_selected` when a path card is clicked.

## Notes
This is intentionally narrow and does not change auth, billing, LiveRehearsal, existing onboarding gates, or dashboard routing.
