# Guided Creator Session Phase 5 — Save-to-Vault Activation Moment

## Summary

Phase 5 strengthens the Guided Creator Session activation moment by making save-to-vault the primary accomplishment after generation.

## Updated Files

- `components/GuidedCreatorSession.tsx`
- `components/shared/SaveActionBar.tsx`
- `components/SavedIdeas.tsx`
- `services/ideasService.ts`

## Key Changes

- Replaced the generic result save button with a strong `SaveActionBar` CTA: **Save this to your Creative Vault**.
- Guided Creator saves now use structured `maw.idea.guided_creator.v1` payloads.
- Guided Creator ideas are tagged with:
  - `guided-creator`
  - `creative-vault`
  - the selected guided path
- Saved Ideas now recognizes Guided Creator ideas as Creative Vault assets.
- Saved Ideas now shows a Creative Vault confirmation banner when a Guided Creator idea exists.
- Saved Ideas cards now display a Creative Vault badge for Guided Creator assets.

## Telemetry Added

- `guided_creator_save_prompt_seen`
- `guided_creator_first_idea_saved`
- `time_to_first_save`

## Validation

- `npm run build` passes.
- Existing known chunk/circular warnings remain unchanged and are not blockers.
