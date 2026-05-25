# Visual Brainstorm Real-World Guardrails Patch

## Scope
This patch applies Illusion Blueprint-style realism guardrails to the Visual Brainstorm page only.

## Files changed
- `services/buildVisualBrainstormPrompt.ts`
- `components/VisualBrainstorm.tsx`

## What changed
- Strengthened the centralized Visual Brainstorm prompt builder so all generated, edited, refined, and variation prompts are locked to realistic stage magic visuals.
- Added explicit real-world physics language: believable scale, practical materials, realistic support points, shadows, reflections, anatomy, and staging.
- Added hard anti-drift exclusions for food, furniture, appliances, unrelated commercial products, fantasy weapons, sci-fi machinery, animals, and surreal abstract art.
- Added lightweight prompt validation/reinforcement so prompts missing stage/performance/apparatus/physics context receive an extra realism lock before generation.
- Updated the visible page label to clarify that Visual Brainstorm outputs are locked to believable, buildable magic visuals that obey real-world physics.
- Cleaned up refinement/demo wording that previously invited magical glow or particles, replacing it with practical theatrical haze, grounded lighting, and realistic stage atmosphere.

## Not changed
- Billing
- Auth
- Quotas
- Telemetry schema
- Saved Ideas schema
- Global AI infrastructure
- Illusion Blueprint logic

## Build note
A full local build could not be run in this environment because `pnpm@10.0.0` could not be downloaded by Corepack. The patch is a narrow TypeScript/text change and should be verified by the normal Vercel build pipeline.
