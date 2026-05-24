# Guided Creator Session — Phase 2 Patch Notes

## Scope

This patch routes first-time eligible users into the Guided Creator Session webpage and adds a dashboard entry point for returning users.

## Files Updated

- `types.ts`
- `components/GuidedCreatorSession.tsx`
- `components/MagicianMode.tsx`

## Behavior Added

- Added the `guided-creator` view to the Magician Mode view system.
- First-time eligible users are routed to the Guided Creator webpage when:
  - the user has no saved ideas,
  - the Guided Creator onboarding has not been dismissed,
  - the user is not an admin,
  - the app is not in demo mode.
- Added a small `Skip to dashboard` link on the Guided Creator webpage.
- Added a `Start Guided Creator Session` button to the normal dashboard so returning users can launch it manually.
- Selecting a Guided Creator path now sends users into the existing app tools:
  - `Create a new effect` → Effect Generator
  - `Improve my patter` → Patter Engine
  - `Prepare a performance` → Show Planner

## Telemetry Added

Existing Phase 1 telemetry remains:

- `guided_creator_viewed`
- `guided_creator_path_selected`

Phase 2 telemetry added:

- `guided_creator_skipped`
- `guided_creator_completed`

## Safety Notes

- No billing, Stripe, entitlement, Supabase auth, or LiveRehearsal logic was changed.
- This does not create a separate GUI or app shell.
- The Guided Creator Session remains a normal in-app webpage view.
