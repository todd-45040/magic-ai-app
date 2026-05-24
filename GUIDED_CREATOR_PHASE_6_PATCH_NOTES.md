# Guided Creator Phase 6 Patch Notes

## Progressive reveal after save

This patch keeps the Guided Creator Session focused after the activation save.

After a user saves a generated Guided Creator result to the Creative Vault, the page now reveals only three next actions:

1. Write patter for this
2. Rehearse it
3. Add it to a show

This prevents the user from being dumped into the full tool menu and connects the saved idea into the existing creative pipeline.

## Files updated

- `components/GuidedCreatorSession.tsx`
- `components/NextStepPanel.tsx`
- `components/PipelineProgress.tsx`
- `services/pipelineSessionService.ts`
- `components/MagicianMode.tsx`

## Pipeline behavior

Saving a Guided Creator result now starts a `guided_creator` pipeline session.

The pipeline begins at the most appropriate stage:

- `new-effect` starts at `effect`
- `improve-patter` starts at `script`
- `prepare-performance` starts at `routine`

Follow-up buttons advance the pipeline toward script, rehearsal/routine, or show planning.

## Validation

- `npm run build` passed.
- Known existing Vite chunk/circular warnings remain unchanged and are non-blocking.
- `npx tsc --noEmit` was attempted but timed out in this environment before producing output.
