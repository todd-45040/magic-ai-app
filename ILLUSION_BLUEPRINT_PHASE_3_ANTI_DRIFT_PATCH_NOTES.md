# Illusion Blueprint Phase 3 — Hard Anti-Drift Layer

## Purpose

Adds a stricter anti-drift layer to the Illusion Blueprint image prompt pipeline to reduce unrelated visual outputs, especially food/product drift such as hamburger-style image failures.

## Files Updated

- `services/buildIllusionBlueprintPrompt.ts`
- `services/buildIllusionIdentity.ts`
- `components/IllusionBlueprint.tsx`
- `services/geminiService.ts`

## Implemented

- Added a centralized `HARD_ANTI_DRIFT_EXCLUSIONS` prompt block.
- Injected the exclusion block into blueprint drawing guidance.
- Injected the exclusion block into concept render guidance.
- Added the exclusion block to the blueprint-to-render lock.
- Added the exclusion block to plan generation prompts so the shared identity remains grounded.
- Updated the shared Illusion Identity realism constraints to include the Phase 3 exclusions.
- Updated retry prompts to reject food, furniture, appliances, unrelated products, fantasy weapons, sci-fi machinery, animals, and surreal abstract art.
- Updated visual QA validation to fail images containing those off-subject categories.

## Explicit Exclusions Added

The generator now explicitly blocks:

- food
- furniture unless part of the described illusion apparatus
- appliances
- unrelated products
- fantasy weapons
- sci-fi machinery
- animals
- surreal abstract art
- product photography
- stock-image objects
- magical energy beams
- floating non-physical fantasy scenes

## Scope

This patch is intentionally narrow and only targets the Illusion Blueprint prompt/validation pipeline. It does not touch billing, auth, quotas, telemetry, Saved Ideas, or global AI infrastructure.
