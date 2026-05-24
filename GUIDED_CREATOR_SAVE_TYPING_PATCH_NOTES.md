# Guided Creator Save Typing Patch

## Scope

This patch intentionally targets only:

- `services/ideasService.ts`

## Change

The legacy/object overload normalization inside `saveIdea(...)` now explicitly types the normalized `payload` as `SaveIdeaInput`.

This preserves backward-compatible calls such as:

```ts
saveIdea('text', content, title, tags)
```

while also allowing Guided Creator saves to safely include:

```ts
source
metadata
```

## Why

Phase 5 introduced Guided Creator save metadata for activation telemetry. The runtime path was valid, but TypeScript inferred the normalized legacy payload too narrowly, producing errors on:

- `payload.source`
- `payload.metadata`

This patch fixes that narrow inference without changing database behavior, telemetry behavior, billing, auth, or AI generation logic.

## Validation

- `npm run build` passed.
- Full `npx tsc --noEmit` could not be completed in this container session because the TypeScript process stalled, but the targeted `services/ideasService.ts` regression has been addressed by explicit `SaveIdeaInput` normalization.
