# Visual Brainstorm Realism Prompt Patch

Implemented Phase 1 only:

- Added `services/buildVisualBrainstormPrompt.ts`.
- Added centralized `VisualBrainstormStyleMode` typing.
- Added default realism guidance for Visual Brainstorm image prompts.
- Added fantasy override detection via `userExplicitlyRequestedFantasy()`.
- Added negative prompt reinforcement against fantasy energy effects, impossible geometry, cartoon styling, distorted anatomy, and unrealistic physics unless explicitly requested.
- Wired Visual Brainstorm generation, retry, demo preset generation, edit, and refinement requests through the centralized prompt builder.
- Preserved the user-facing prompt separately from the provider prompt so history and Saved Ideas continue to show the magician's original concept instead of hidden prompt guidance.

No UI selector was added in this patch.
No quota, billing, saved-idea schema, trial, or database logic was changed.

Build validation:

- `npm run build` completed successfully.
- Existing Vite chunk-size/manual-chunk warnings remain unrelated to this patch.
