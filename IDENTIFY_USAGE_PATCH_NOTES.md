Identify a Trick usage patch v2

This corrected patch finishes the wiring in three places:
1. Adds `identify` as a tracked local usage metric in `services/usageTracker.ts`.
2. Consumes 1 identify unit after a successful Identify a Trick result in `components/MagicianMode.tsx`.
3. Feeds Identify daily used/limit/remaining into the Home Usage snapshot so the panel can stop showing "Not tracked yet" once the tool is used.

Expected behavior after applying:
- Before any identify call: the row may still show a not-tracked/empty state, depending on the current card UI logic.
- After a successful identify call: the row should move to a real usage state like `Daily: 1 / 100`.

If your current `UsageLimitsCard` uses a custom normalized row format, make sure it reads `quota.identify.daily` the same way it already reads `live_audio_minutes.daily` and `image_gen.daily`.
