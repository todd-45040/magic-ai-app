# Sprint 3F + 3G — Upgrade UX + Founder Protection

Implemented in this pass:

## Upgrade UX standardization

Added `services/upgradeUx.ts` as the central copy/pattern helper for:
- locked by plan
- limit reached
- upgrade available
- trial exhausted
- founder protected

Updated surfaces:
- `components/UpgradeModal.tsx`
- `components/UsageLimitsCard.tsx`
- `components/BlockedPanel.tsx`
- `services/blockedUx.ts`

Result:
- consistent plan-lock language
- consistent limit-reached language
- founder-specific protected copy where relevant
- more consistent CTA labels across cards, notices, and blocked states

## Founder protection review / hardening

Added `server/billing/founderProtection.ts` to centralize founder-protection resolution.

Updated:
- `server/billing/stripeWebhook.ts`
- `api/adminManualFounderClaim.ts`

Key protections:
- existing founder override survives later webhook events
- founder-protected users continue resolving to `founder_professional`
- founder locked price is preserved in the billing domain
- admin manual founder claims also persist to `founder_overrides`

## Explicit scenarios covered by logic

1. Founder user signs up before Stripe
   - founder identity may exist before billing
   - later billing sync preserves founder lock

2. Founder user upgrades after Stripe goes live
   - webhook sync resolves founder protection and persists lock data

3. Founder rate remains locked
   - founder override stores locked plan and locked price

4. Founder never accidentally falls onto public Professional pricing
   - webhook sync now checks existing founder override before normalizing plan state

5. Founder downgrade / re-upgrade behavior is defined
   - founder protection helper preserves founder-professional lock state across syncs

6. Founder record survives webhook noise and manual admin changes
   - manual founder claim writes founder override directly
   - webhook uses founder override as a higher-confidence signal
