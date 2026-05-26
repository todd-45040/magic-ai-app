# Blueprint Render Separation Patch

## Scope
Targeted Illusion Blueprint prompt/validation refinement only.

## Goals
- Separate blueprint intelligence from render intelligence.
- Keep blueprint-only annotations, measurements, cutaways, exploded views, and fabrication notes out of concept render prompts.
- Preserve only render-safe structure anchors for concept renders: geometry, silhouette, proportions, facade details, platform/base details, stage lighting, reveal state, and performer blocking.
- Add concept render sanitization to prevent document/blueprint artifacts from appearing inside photorealistic renders.

## Files Updated
- `services/buildIllusionBlueprintPrompt.ts`
- `services/geminiService.ts`
- `components/IllusionBlueprint.tsx`

## Validation
- `npm run build` passed.

## Avoided
- No auth changes.
- No billing changes.
- No telemetry rewrites.
- No schema redesign.
- No AI infrastructure rewrite.
- No global state refactor.
