# Saved Ideas Project Grouping UX Patch

This patch builds on the lightweight project continuity metadata layer and improves the Saved Ideas page presentation.

## Scope

Changed only the Saved Ideas UI layer and related local project grouping helpers.

No changes were made to:

- authentication
- billing
- quota enforcement
- telemetry schema
- database migrations
- Saved Ideas storage schema
- global AI infrastructure

## What Changed

### 1. Project Grouping View

Saved Ideas now detects project continuity metadata and groups linked items into Creative Project cards.

Grouping uses:

- `project.projectId` when present
- `project.projectTitle` as a fallback

### 2. Origin Tool Badges

Each grouped project card now shows origin tool badges such as:

- Visual Brainstorm
- Blueprint Generator
- Effect Generator
- Patter Engine

This helps users understand how a project evolved across tools.

### 3. Continue Project Button

Each grouped project card includes a `Continue Project` action.

The action:

- stages a lightweight handoff in localStorage
- filters the Saved Ideas view to the selected project
- opens the newest linked item
- preserves project context for future workflow routing

LocalStorage key added:

```txt
maw_project_continuity_handoff_v1
```

### 4. Flat View Fallback

The existing category-based Saved Ideas layout remains intact.

Users can switch between:

- Projects
- Flat

If no project metadata exists yet, the page automatically falls back to the existing flat/category experience.

## Files Changed

- `components/SavedIdeas.tsx`

## Strategic Result

Saved Ideas now feels less like a flat archive and more like the beginning of a professional creative workspace.
