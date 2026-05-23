# Final Runtime Safety Cleanup Patch

Scope: narrow TypeScript/runtime-safety cleanup only.

## Updated Areas

- `components/ContractGenerator.tsx`
  - Replaced stale `Show['contract']` type dependency with a local `ContractSections` type.
  - Added explicit typing for the `setResult` updater callback.
  - Preserved `ActionButton.className` support so the prop is no longer unused.

- `components/AngleRiskAnalysis.tsx`
  - Added nullability guards around refinement-question output.

- `components/MagicArchives.tsx`
  - Normalized compare-result references from stale `a` / `b` fields to `topicA` / `topicB`.

- `components/MentalismAssistant.tsx`
  - Added optional `persona_reports` typing for stress-test telemetry compatibility.

## Validation

- `npm run build` passes.
- `npx tsc --noEmit` reduced remaining TypeScript errors from about 84 to about 71.

## Explicitly Not Changed

- No billing changes.
- No Stripe webhook changes.
- No membership/trial/entitlement changes.
- No Live Rehearsal architecture changes.
- No AI service restructuring.
