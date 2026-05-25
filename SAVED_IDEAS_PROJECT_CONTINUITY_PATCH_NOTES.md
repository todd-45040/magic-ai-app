# Saved Ideas Project Continuity Patch

## Purpose

Adds a lightweight project-continuity layer to Saved Ideas so generated outputs can begin behaving like connected creative work rather than isolated saved artifacts.

## Scope

This patch intentionally avoids:

- auth changes
- billing changes
- telemetry rewrites
- quota changes
- database migrations
- Saved Ideas schema redesign
- global AI infrastructure rewrites

## What changed

### 1. Shared continuity helper

Added:

- `services/creativeProjectContinuity.ts`

This provides:

- `CreativeProjectLink`
- stable inferred project IDs
- project-title normalization
- project tags such as `project:shadow-box-appearance`
- rich-payload project embedding
- Saved Ideas project extraction helpers

### 2. Backward-compatible Saved Idea metadata

Updated:

- `types.ts`
- `services/ideasService.ts`

Saved ideas can now carry optional lightweight project metadata without requiring a database migration. For rich `maw.idea.*` payloads, project metadata is embedded inside the existing saved content JSON. For plain-text saves, continuity is preserved through project tags.

### 3. Important tools now pass continuity hints

Updated save calls for:

- Visual Brainstorm
- Illusion Blueprint
- Effect Engine

These now pass category/source/project-stage hints to Saved Ideas.

### 4. Saved Ideas UX polish

Updated:

- `components/SavedIdeas.tsx`

Saved Ideas now shows:

- project continuity badges on cards
- creative project metadata in detail view
- project-aware search matching
- a small “Creative Project Continuity” panel when multiple saved ideas share the same inferred project
- project metadata inside planner notes when promoting/adding ideas to shows

## Result

This creates the first safe layer for future grouped project views and a later full Creative Workspace without forcing a risky schema migration now.
