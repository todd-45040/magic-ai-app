# Illusion Identity Phase 1 Patch Notes

## Patch Name
Shared Illusion Identity Object

## Scope
This patch is intentionally narrow and only updates the Illusion Blueprint prompt pipeline.

No billing, auth, quota, telemetry schema, Saved Ideas schema, or global AI service behavior was changed.

## Files Added
- `services/buildIllusionIdentity.ts`

## Files Updated
- `services/buildIllusionBlueprintPrompt.ts`
- `components/IllusionBlueprint.tsx`

## What Changed

### 1. Added a shared identity object
A new `IllusionIdentity` interface now captures the canonical visual identity for a generated illusion:

- illusion type
- silhouette / structure
- materials
- staging
- footprint
- audience view
- mechanism style
- realism constraints

This object is built from the generated builder plan plus the user's generation context.

### 2. Added identity builder helper
`buildIllusionIdentity(...)` creates a reusable identity object after the builder plan is generated.

The identity is now the semantic anchor for both:

- technical blueprint drawings
- realistic rendered concept images

### 3. Added identity brief helper
`buildIllusionIdentityBrief(...)` converts the shared identity into prompt text that is injected into both blueprint and concept image prompts.

### 4. Wired Illusion Blueprint generation to the shared identity
The Illusion Blueprint component now creates one identity object after normalizing the builder plan, then passes that same identity into both image prompt builders.

This changes the flow from:

```txt
Prompt A -> blueprint
Prompt B -> render
```

To:

```txt
Builder Plan
    ↓
Shared Illusion Identity
    ↓
Blueprint Prompt + Concept Render Prompt
```

## Expected Benefit
Blueprint drawings and rendered images should now be better anchored to the same illusion type, silhouette, footprint, material direction, audience view, staging environment, and realism constraints.

This is Phase 1 only. It does not yet add a hard scoring system or image comparison pass.

## Build Validation
A full local build could not be completed in this environment because the package manager dependencies were not available and Corepack could not download `pnpm@10.0.0` due registry/DNS access failure.

The patch was limited to TypeScript source changes and should be validated locally with:

```bash
git status
pnpm install
pnpm build
```
