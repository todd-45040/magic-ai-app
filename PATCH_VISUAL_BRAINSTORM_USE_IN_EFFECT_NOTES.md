# Visual Brainstorm → Use in Effect Patch

Implemented in this package:

- Adds a visible **Use in Effect** workflow button in the Visual Brainstorm "Next step" action area.
- Stores the visual handoff payload in `maw_effect_engine_visual_handoff` for Effect Engine preload.
- Starts/updates the shared pipeline session using `startPipelineSession`.
- Adds compatibility storage under `pipelineSession` for older/debug handoff checks.
- Adds the requested debug log: `console.log('IMAGE IDEA:', payload)`.
- Adds a reusable `workflowAction` slot to `SaveActionBar` so future tools can expose a next-step CTA above the save button.

Verification performed in container:

- `npx esbuild components/VisualBrainstorm.tsx --bundle` completed successfully.
- `npx esbuild components/shared/SaveActionBar.tsx --bundle` completed successfully.
- Full Vite build could not complete within the container time limit after dependency install, but transformation began without immediate syntax failure.

Recommended local verification:

```bash
npm install
npm run build
npm run dev
```

Then test Visual Brainstorm → Use in Effect → Effect Engine preload.
