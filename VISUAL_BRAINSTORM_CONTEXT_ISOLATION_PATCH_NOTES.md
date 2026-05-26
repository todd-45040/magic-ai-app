# Visual Brainstorm Context Isolation Patch

## Purpose
Prevents stale visual motifs from previous Visual Brainstorm generations from leaking into new prompt-only image requests.

## Changes
- Main **Generate Image** now starts from a clean prompt-only context.
- Previous Visual Brainstorm selections, handoff seeds, pipeline session handoffs, active history selection, current generated image metadata, and variation metadata are cleared before a fresh generation.
- **Generate Variations**, **Refine**, **Edit**, and **Use in Blueprint** remain continuity-preserving workflows.
- Reset Session now clears Visual Brainstorm continuity handoff storage in both `localStorage` and `sessionStorage`.
- Prompt builder now supports `freshContext` and stale negative term reinforcement.
- Fresh generations inject explicit instructions to avoid carrying over previous objects, props, motifs, costumes, apparatus, colors, and staging.
- Added stale-artifact suppression for common leakage terms such as rope, rings, brass rings, steampunk apparatus, floating/disembodied arms, and unrelated prior-session props.

## Guardrails
This patch does not touch:
- auth
- billing
- telemetry architecture
- database schema
- AI provider infrastructure
- global state architecture
