# Visual Brainstorm Blueprint Handoff + Artifact Guardrail Patch

## Targeted fix
This patch addresses two issues reported from the Visual Brainstorm → Illusion Blueprint workflow:

1. The selected Visual Brainstorm image could fail to appear on the Illusion Blueprint page after clicking **Use V# in Blueprint**.
2. Visual Brainstorm generations could still produce anatomy artifacts such as floating arms or disconnected body parts.

## Files changed

- `components/VisualBrainstorm.tsx`
- `components/IllusionBlueprint.tsx`
- `services/buildVisualBrainstormPrompt.ts`
- `api/_lib/imagePromptPolicy.ts`

## What changed

### 1. More reliable Visual Brainstorm → Blueprint handoff

The handoff now uses a layered recovery strategy:

- in-memory `window.__mawIllusionBlueprintVisualHandoff`
- `sessionStorage`
- `localStorage`
- existing custom handoff event

This prevents the selected image/prompt from being lost when localStorage is already close to quota because Visual Brainstorm history contains generated images.

### 2. Blueprint page now recovers selected image context more defensively

The Illusion Blueprint page now checks all handoff channels when it mounts and normalizes the selected image URL before rendering the imported Visual Brainstorm panel.

### 3. Stronger artifact suppression for Visual Brainstorm

The image prompt policy now explicitly discourages:

- disembodied limbs
- floating arms
- extra hands
- malformed hands
- duplicated body parts
- partial people entering from nowhere
- unsupported ropes/rings/props

It also requires every visible body part to belong to a complete, visible performer, assistant, or audience member.

## Build validation

`npm run build` completed successfully.

Only existing Vite chunk-size/circular-chunk warnings appeared.

## Avoided

- No auth changes
- No billing changes
- No telemetry rewrites
- No schema redesign
- No AI infrastructure rewrite
- No global state refactor
