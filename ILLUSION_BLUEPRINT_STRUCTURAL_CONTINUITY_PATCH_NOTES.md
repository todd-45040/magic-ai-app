# Illusion Blueprint Structural Continuity Patch

## Purpose
Strengthen professional concept development continuity from a selected Visual Brainstorm image into Illusion Blueprint builder plans, technical drawings, and matched concept renders.

## Implemented
- Added a lightweight seed identity extraction layer in `services/illusionSeedIdentity.ts`.
- Extracts source-concept metadata from the Visual Brainstorm handoff text, including:
  - primary props
  - dominant geometry
  - stage layout
  - performer position
  - apparatus form
  - material/style language
  - atmosphere
  - illusion motion
  - illusion category
- Injects the structural seed identity into:
  - builder plan prompt
  - blueprint drawing prompts
  - matched concept render prompts
- Added a continuity weighting hierarchy:
  1. seed image identity
  2. structural composition
  3. prop relationships
  4. staging geometry
  5. broad illusion category
- Added anti-generic drift rules to prevent collapse into unrelated cabinets, dollhouses, cottages, standard boxes, appearance cages, trunks, or unrelated stage props unless those forms are present in the seed.
- Updated matched A/B output directives so variation A/B preserves the source concept silhouette and prop relationships instead of forcing generic rectangular/cabinet geometry.
- Updated illusion identity derivation to recognize rope-and-ring source concepts before broad appearance/production categories.

## Intended Result
A selected Visual Brainstorm concept such as a rope-and-brass-ring Victorian stage image should remain a rope/ring-based theatrical illusion concept through the builder plan, Blueprint A/B, and Concept A/B outputs instead of becoming a generic cabinet or house-like apparatus.

## Scope Control
This patch is UI/prompt/metadata focused only. It does not change auth, billing, telemetry architecture, schema, routing architecture, global state, or AI infrastructure.
