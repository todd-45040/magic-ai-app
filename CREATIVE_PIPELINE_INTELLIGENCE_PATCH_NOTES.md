# Creative Pipeline Intelligence Patch

Version target: v1.1.6 candidate

## Scope

This patch upgrades the existing Creative Pipeline progress panel into a more project-aware workflow panel while preserving the current routing architecture and storage model.

## Updated

- `components/PipelineProgress.tsx`

## Added Behavior

- Reads current Project Workspace context from the existing localStorage handoff keys.
- Displays current project identity when a workspace project is active.
- Shows the current stage with a short stage description.
- Shows a recommended next action for the current pipeline step.
- Shows linked asset count when Project Workspace handoff metadata is available.
- Shows last activity context.
- Displays a linked seed image preview when an image handoff is available.
- Stores lightweight project memory in localStorage under `maw_creative_pipeline_project_memory_v1`.
- Listens for existing workspace and pipeline update events.

## Preserved

- Existing routing architecture.
- Existing Saved Ideas structure.
- Existing Project Workspace metadata model.
- Existing AI service flow.
- Existing auth, billing, quotas, and entitlement systems.

## Avoided

- No schema redesign.
- No telemetry rewrite.
- No auth or billing changes.
- No AI provider or prompt infrastructure rewrite.
- No global state refactor.
