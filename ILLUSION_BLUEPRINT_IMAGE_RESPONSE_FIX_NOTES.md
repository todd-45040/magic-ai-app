# Illusion Blueprint Image Response Fix

Patch version: 1.1.2

## Problem

The Illusion Blueprint page could show empty paired Blueprint A/B and Concept A/B cards even when the image endpoint completed. The UI text made this appear as a validation rejection, but the underlying issue could also happen when the frontend image parser did not recognize the nested response shape returned by the active image provider.

## Fix

Targeted file:

- `services/geminiService.ts`

Changes:

- Added a single canonical image response extractor for generated image results.
- Supports Google-style image output:
  - `generatedImages[]`
  - `images[]`
  - `data.generatedImages[]`
  - `data.images[]`
- Supports OpenAI/Vercel proxy-style nested image output:
  - `data.data[]`
- Supports already-formed `data:image/...` URLs.
- Reused the extractor in both `generateImage()` and `generateImages()` so Visual Brainstorm and Illusion Blueprint parse generated images consistently.

## Avoided

- No auth changes.
- No billing changes.
- No quota changes.
- No prompt rewrite.
- No schema changes.
- No global AI infrastructure rewrite.

## Verification

- `npm run build` passed.
- Existing Vite warnings only: chunk size/manual chunk warnings and existing dynamic/static import notices.
