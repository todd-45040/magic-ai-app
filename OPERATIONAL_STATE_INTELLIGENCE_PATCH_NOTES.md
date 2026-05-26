# Operational State Intelligence Patch

Implemented from the v168 blueprint-render recovery baseline.

## Scope

Targeted Illusion Blueprint prompt orchestration only. No auth, billing, telemetry, schema, routing, AI infrastructure, or global state refactors.

## Changes

- Added operational state metadata to matched output definitions.
- Matched Design A is explicitly assigned to empty-display mode.
- Matched Design B is explicitly assigned to production/reveal mode.
- Added operational state prompt rules for closed-ready, display-empty, production/reveal, and reset/service.
- Added anti-state-blending rules to prevent empty-display and reveal moments from appearing in the same render.
- Blueprint prompts may describe operating states, transition logic, performer/operator positions, and high-level non-exposure concealment flow.
- Concept render prompts now render one assigned operational state only.
- Recovery render prompts preserve the same single-state rule.

## Validation

`npm run build` completed successfully.
