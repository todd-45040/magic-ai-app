# Illusion Blueprint Concept Render Fallback Patch

## Goal
Prevent the Illusion Blueprint matched concept render gallery from going blank when the builder plan and blueprint drawings succeed but the secondary visual QA check is stricter than the guarded image prompt.

## Changes
- Keeps rejecting obvious unrelated product/food/document artifacts.
- Allows a plausible generated concept render to display when it passes the hard rejection checks, even if secondary QA misses one staging cue.
- Changes matched concept generation from `Promise.all` to `Promise.allSettled` so one failed render does not discard the other matched concept.

## Scope Guard
No auth, billing, telemetry, schema, or AI infrastructure rewrites.
