# Friction-Based Conversion Patch

Implemented controlled conversion friction for trial/free users.

## Added

- `services/conversionFriction.ts`
  - Central friction constants and helper functions.
  - Dispatches `maw:conversion-friction-upgrade` so the app can open the upgrade modal from any tool.
  - Logs conversion friction telemetry.

## Hard Limits

- Free daily AI text generation limit: 3
- Trial daily AI text generation limit: 10
- Trial live rehearsal daily limit: 10 minutes
- Free/trial saved idea limit: 1 non-rehearsal saved idea

## Save-Lock Logic

- First saved idea remains free for activation.
- Second non-rehearsal save is blocked for free/trial users.
- Block logs `locked_feature_clicked` with `reason: saved_idea_limit`.
- Upgrade modal opens automatically.

## Generation Nudge

- After the second successful chat generation for free/trial users, the app logs `conversion_nudge_after_second_generate` and opens the upgrade modal as a soft prompt.

## Server/Quota Alignment

Updated limits in:

- `services/usageService.ts`
- `services/usageTracker.ts`
- `api/_usage.ts`
- `server/billing/planMapping.ts`
- `services/planCatalog.ts`

## Telemetry Events to Watch

```sql
select event_name, count(*)
from analytics_events
group by event_name
order by count desc;
```

Expected new/increased events:

- `locked_feature_clicked`
- `limit_hit_ai_generation`
- `upgrade_prompt_shown`
- `conversion_nudge_after_second_generate`
- `upgrade_clicked`
- `upgrade_completed`

## Test Script

1. Log in as a trial user.
2. Generate two chat/effect responses.
3. Confirm the upgrade modal appears after the second generation.
4. Save one idea.
5. Try saving a second non-rehearsal idea.
6. Confirm the save is blocked and the upgrade modal appears.
7. Start Live Rehearsal and use/consume minutes.
8. Confirm trial daily limit is 10 minutes.
9. Check Supabase telemetry for the events above.
