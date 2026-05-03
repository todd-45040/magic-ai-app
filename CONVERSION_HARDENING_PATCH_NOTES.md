# Conversion Hardening Patch

Date: 2026-05-03
Scope: IBM/SAM trial-to-paid funnel hardening, ownership conversion moment, and server-side entitlement scaffolding.

## Added

### 1. Trial countdown pressure UI
New file: `components/TrialCountdownCard.tsx`

- Shows partner trial badge for IBM/SAM users.
- Displays days remaining and trial end date.
- Adds visible progress bar across the trial window.
- Logs `upgrade_prompt_viewed` and `upgrade_clicked` activity.
- Pushes users toward keeping full access before trial expiration.

Integrated in: `components/MagicianMode.tsx`

### 2. First saved idea ownership modal
New file: `components/FirstIdeaConversionModal.tsx`

- Appears the first time a user saves an idea.
- Reframes the saved idea as the beginning of the user's working magic system.
- Offers three actions: continue, view saved ideas, or keep full access.
- Logs `first_idea_saved` and upgrade intent for partner trial users.

Integrated in: `components/MagicianMode.tsx`

### 3. Server-side entitlement middleware scaffold
New file: `server/conversion/entitlementMiddleware.ts`

- Loads the authenticated Supabase user.
- Reads the canonical user profile from the `users` table.
- Resolves effective server-side tier.
- Treats active trials as Professional access.
- Blocks protected tools with a `402 PLAN_UPGRADE_REQUIRED` response.

### 4. Entitlement status API route
New file: `api/conversion/entitlement-status.ts`

- Returns the authenticated user's current entitlement tier.
- Includes trial active state, trial end date, days remaining, partner source, and requested trial days.

### 5. Protected API route template
New file: `api/conversion/protected-ai-template.ts`

- Demonstrates how every future protected AI route should perform entitlement checks before calling Gemini, Stripe, or privileged Supabase work.

## Updated

### `components/MagicianMode.tsx`

- Imports `TrialCountdownCard` and `FirstIdeaConversionModal`.
- Adds `showFirstIdeaConversionModal` state.
- Shows trial countdown in the main app shell.
- Shows first-save ownership modal after the user's first saved idea.
- Logs partner conversion telemetry at the first saved idea moment.

## Recommended next integration

The new server entitlement middleware is intentionally non-destructive. To harden fully, progressively add this pattern to protected API routes:

```ts
const entitlement = await requireToolEntitlement(req, 'director_mode');
if (!entitlement.ok) return sendEntitlementError(res, entitlement);
```

Start with the highest-cost and highest-value routes:

1. Live Rehearsal
2. Visual Brainstorm / image generation
3. Director Mode
4. Video Rehearsal
5. Contracts / CRM / Marketing Generator

## Validation note

Local dependency install completed far enough to run Vite, but the sandbox build timed out during Vite rendering. No TypeScript error was surfaced before timeout. Run locally with Node 20 as specified by `.nvmrc`:

```bash
npm install
npm run build
```
