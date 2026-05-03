# Effect Engine JSON Parser Hardening Patch

This patch hardens the Effect Engine structured-output path so IBM/SAM trial users do not hit the launch-blocking message: "The AI response was not valid JSON."

## Changes

- Increased Effect Engine structured output budget from 3,800 tokens to 8,192 tokens.
- Hardened `/api/ai/json` parsing to handle:
  - markdown fenced JSON
  - prose before/after JSON
  - raw newlines/tabs inside string values
  - trailing commas
  - likely truncated JSON with missing closing braces/brackets
- Increased automatic repair retry budget to 8,192 tokens.
- Added Effect Engine-specific fallback payload so malformed provider output does not crash the user flow.
- Updated bad JSON message to a clearer user-facing fallback message.

## Validation

Run locally:

```bash
npm install
npm run build
npm run dev
```

Then test Effect Engine with:

- ring box
- photo
- envelope
- ribbon

Expected result: no invalid JSON error. The app should either render normal structured cards or recovered cards instead of blocking the user.
