# Phase 2 — Blueprint-to-Render Locking Patch

This patch applies the Phase 2 continuity update for the Illusion Blueprint tool.

## Targeted file

- `services/buildIllusionBlueprintPrompt.ts`

## What changed

Added a dedicated `buildBlueprintToRenderLock(...)` prompt block for rendered concept images.

The concept image prompt now explicitly tells Imagen/Gemini to render the same apparatus represented by the matching blueprint letter:

- `Render THIS EXACT illusion apparatus shown in Blueprint A/B`
- maintain identical silhouette
- maintain same staging footprint
- maintain same mechanism placement
- maintain same materials and finish direction
- maintain same audience orientation
- maintain same proportions
- maintain same theatrical context
- do not reinterpret the apparatus
- do not redesign the illusion
- do not substitute unrelated props, food, products, animals, landscapes, or generic stock objects

## Scope control

No changes were made to:

- billing
- auth
- quotas
- telemetry
- Saved Ideas schema
- global AI services
- database migrations

## Validation note

This is a narrow prompt-layer patch built on top of the Phase 1 shared Illusion Identity object. It is intended to reduce blueprint/render drift without changing app behavior outside the Illusion Blueprint image prompt pipeline.
