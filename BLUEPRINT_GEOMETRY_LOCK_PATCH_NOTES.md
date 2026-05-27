# Blueprint Geometry Lock Patch

Targeted continuity refinement for Illusion Blueprint matched renders.

Touched files:
- `services/buildIllusionBlueprintPrompt.ts`
- `components/IllusionBlueprint.tsx`

Changes:
- Added a hard Blueprint Geometry Lock prompt block.
- Forced concept renders to be described as blueprint-derived photorealistic fabrication renders.
- Locked exact silhouette, footprint, roofline/topline, door placement, platform geometry, wall proportions, caster/platform structure, opening positions, and apparatus count.
- Reduced scenic creativity by forbidding embellishment, redesign, reinterpretation, upscaling, theatricalizing, beautifying, or added scenic architectural complexity beyond the paired blueprint/design spec.
- Reinforced the single-apparatus rule for Concept A/B and especially Concept B reveal-state images.
- Updated the UI continuity callout from “Pair lock” to “Geometry lock.”

Validation:
- `npm run build` completed successfully locally.
