# Fabrication Profile Lock Patch

Implemented on top of the Apparatus Component Inheritance baseline.

## Purpose
Reduce "related cousin" drift by locking the fabrication vocabulary shared across Blueprint A, Concept A, Blueprint B, and Concept B.

## Added
- Fabrication profile persistence in the Illusion Blueprint prompt builder.
- Structural style lock.
- Material language lock.
- Trim-density continuity.
- Hardware-style continuity.
- Pedestal/base engineering style continuity.
- Caster/wheel style continuity.
- Ornament-intensity normalization.
- Construction-sophistication lock.

## Design Intent
This is not another safety layer. It is a deterministic inheritance refinement:
- preserve the same shop-built construction vocabulary,
- reduce decorative redesign,
- reduce undercarriage/pedestal improvisation,
- keep the apparatus looking like the same fabricated prop family across blueprint and render outputs.

## Scope
Targeted UI/service prompt refinement only.
No auth, billing, telemetry, schema, routing, AI-provider infrastructure, or global state refactors.

## Validation
`npm run build` passed.
