# Illusion Blueprint Phase 4 — Apparatus Validation Patch

## Scope

This patch applies only to the Illusion Blueprint image generation/validation path.

It does not modify billing, auth, quotas, telemetry, Saved Ideas schema, or global AI infrastructure.

## Implemented

- Added explicit Phase 4 apparatus requirements to the concept render prompt:
  - stage environment
  - illusion apparatus
  - illusion structure
  - theatrical context
  - magician staging language / magician-performance staging cues
- Strengthened the visual QA validator schema in `services/geminiService.ts` with dedicated boolean checks for the Phase 4 requirements.
- Updated the matched image acceptance gate in `components/IllusionBlueprint.tsx` so concept renders are accepted only when they include:
  - apparatus
  - stage environment
  - illusion structure
  - theatrical context
  - magician staging cues
  - expected subject match
  - no unrelated stock/product/food drift
- Added retry guidance that explicitly tells the regeneration pass what Phase 4 cues were missing.
- Preserved the existing two-attempt fail-closed behavior: unrelated/off-subject images are hidden instead of displayed.

## Files Changed

- `components/IllusionBlueprint.tsx`
- `services/geminiService.ts`
- `services/buildIllusionBlueprintPrompt.ts`

## Recommended Test Prompts

- motorcycle appearance illusion
- shadow box appearance
- metamorphosis trunk
- levitation platform
- futuristic teleportation illusion

Verify that accepted concept renders clearly show a stage/performance context and a central illusion apparatus, not food, furniture, products, animals, or abstract imagery.
