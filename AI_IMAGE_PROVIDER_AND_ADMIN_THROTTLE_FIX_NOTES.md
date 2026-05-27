# AI Image Provider + Admin Throttle Fix Notes

Patch version: v188

## Problem addressed

After the quota-message fixes, Visual Brainstorm could still show a generic "AI temporarily unavailable" state.

The deep dive found two remaining application-layer issues:

1. `/api/ai/image` still ran a local route-level rate limiter before/around image generation. Admins bypassed quota enforcement, but they could still be throttled by this route limiter during repeated testing.
2. Image generation used the global AI provider setting. If the global provider was set to Anthropic, or if the selected image provider key was missing, image tools could fail even though quota/admin logic was correct.

## Files changed

- `api/ai/image.ts`
- `api/edit-images.ts`
- `api/ai/_lib/imageProvider.ts` (new)

## Key behavior changes

- Admin usage bypass now skips the image endpoint route throttle as well as quota enforcement.
- Image tools now resolve an image-capable provider separately from the global text/json provider.
- If the global provider is Anthropic, image generation falls back to Gemini or OpenAI when a valid image-capable key exists.
- If OpenAI is selected but `OPENAI_API_KEY` is missing, image generation falls back to Gemini when `GOOGLE_AI_API_KEY` is available.
- Image endpoints now return provider diagnostic headers:
  - `X-AI-Provider-Used`
  - `X-AI-Provider-Requested`
  - `X-AI-Provider-Warning` when a safe fallback was used

## Testing performed

- `npm run build`
- Build passed with existing Vite chunk warnings only.
