# Illusion Blueprint Design Spec Lock Patch

This patch adds a shared internal design specification layer for the Illusion Blueprint Generator.

## Purpose

Reduce continuity drift between paired blueprint drawings and matched concept renders without adding more broad safety layers.

## What changed

- Added a deterministic `IllusionBlueprintDesignSpec` object for Matched Design A and Matched Design B.
- Both Blueprint A and Concept A now receive the same Design A spec.
- Both Blueprint B and Concept B now receive the same Design B spec.
- The design spec locks fixed visible attributes before image prompts are built:
  - apparatus family
  - silhouette
  - roof/topline
  - front opening
  - door/panel layout
  - base/platform form
  - supports and casters
  - facade trim/materials
  - visible hardware
  - proportions
  - performer blocking
  - operational state
- Render prompts receive a sanitized render-only version of the same design spec.
- Recovery render prompts also receive the same render design spec so fallback generations remain locked to the pair.

## Files changed

- `services/buildIllusionBlueprintPrompt.ts`
- `components/IllusionBlueprint.tsx`

## Validation

- `npm run build` completed successfully.

## Design intent

This is not another general safety layer. It is a pair-continuity architecture improvement so blueprint and render generations share a common source-of-truth spec before prompting.
