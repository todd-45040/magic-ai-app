# TypeScript Safety Alignment Patch

Scope: narrow Phase 1 TypeScript safety cleanup only. This patch intentionally avoids changing Stripe webhook behavior, entitlement logic, Supabase RLS/migrations, trial calculations, or app routing behavior beyond type alignment.

## Changed files

- `api/ai/_lib/toolPolicy.ts`
  - Added normalized policy defaults for body size, prompt size, context size, cooldown, and duplicate-request windows.
  - Added backward-compatible alias fields so older request-safety guards and newer policy names stay synchronized.
  - Added `getCooldownHeaders()` export used by protected AI requests.

- `api/ai/_lib/requestSafety.ts`
  - Aligned request validation with canonical policy names: `maxBodyBytes`, `maxPromptChars`, `maxContextChars`, and `maxFileBytes`.
  - Preserved existing runtime behavior with conservative defaults when a policy omits optional values.

- `components/BillingSettings.tsx`
  - Replaced stale snake_case User references with canonical camelCase fields:
    - `stripeSubscriptionId`
    - `stripeStatus`
    - `stripePriceId`
  - No billing API behavior was changed.

- `components/FoundingCirclePage.tsx`
  - Added the optional `onJoined` prop to match the existing App usage.
  - Preserved current founder-join behavior.

- `vite-env.d.ts`
  - Added Vite client typing so `import.meta.env` resolves correctly during TypeScript checks.

- `package.json`
  - Confirms `@types/qrcode` is present as a dev dependency for `ShowPlanner.tsx` QR code usage.

## Validation

- `npm run build` passes.
- Full `npx tsc --noEmit` still has broader strictness/dead-code debt outside this patch scope.

## Not changed

- Stripe webhook route
- Checkout flow
- Membership/entitlement logic
- Supabase migrations/RLS
- Live Rehearsal runtime behavior
- Creative Pipeline behavior
- Activation removal behavior from the prior patch
