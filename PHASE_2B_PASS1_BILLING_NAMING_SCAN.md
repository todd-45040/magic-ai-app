# Phase 2B — Pass 1 Billing Naming Scan

Date: 2026-03-12
Scope: repo scan for billing naming drift before the naming consistency refactor.
Status: scan complete, no behavior changes in this pass.

## Search terms used

- `plan`
- `tier`
- `lookup`
- `price`
- `pro`
- `professional`
- `founder`
- `status`
- `stripe`

This pass is intended to find naming drift, legacy labels, and ambiguous terms in active or adjacent billing code.

## Executive summary

The active billing checkout path is already mostly aligned around:

- membership tier values: `free`, `amateur`, `professional`
- checkout lookup keys: `amateur_monthly`, `professional_monthly`, `founder_professional_monthly`
- billing route family: `/api/billing/*`

The main naming drift still present is not in the active checkout route itself. It is in supporting terminology around:

1. `tier` vs `membership` vs `plan`
2. legacy aliases such as `pro`, `performer`, and `semi-pro`
3. mixed response field naming in billing status and surrounding admin/readiness utilities
4. `planKey` vs `lookupKey` vs `stripeLookupKey`
5. `billingStatus` used correctly in billing files, but plain `status` still appears widely across adjacent services and admin code

## Key findings by file

### 1. `App.tsx`

**Observed**
- `handleUpgrade` currently accepts `tier: 'amateur' | 'professional'`
- it then derives a `lookupKey` through `resolveCheckoutLookupKey(tier, user)`

**Assessment**
- behavior is correct
- naming is serviceable, but `tier` here really means **target membership tier**, not lookup key

**Phase 2B follow-up**
- likely rename parameter to `targetTier` or `membershipTier`

---

### 2. `services/billingClient.ts`

**Observed**
- active client checkout flow appears aligned around `lookupKey`
- this is the right term for the checkout target

**Assessment**
- this file should remain the canonical client-side home for `lookupKey`

**Phase 2B follow-up**
- ensure all client request payload naming uses `lookupKey` only
- avoid fallback aliases like `planKey` or `priceKey` in request bodies

---

### 3. `server/billing/planMapping.ts`

**Observed**
- this file uses `planKey`, `billingStatus`, `accessState`, and founder lock concepts
- it also contains `resolveUsagePlanAlias(...)`

**Assessment**
- `planKey` is acceptable here because this file resolves **billing plan state**
- `resolveUsagePlanAlias` introduces the word `plan` into usage logic, which is understandable but can blur with entitlement tier and checkout lookup key

**Phase 2B follow-up**
- evaluate whether usage naming should move toward `membershipTier` / `usageTierAlias`
- keep `billingStatus` as the canonical lifecycle field name

---

### 4. `server/billing/status.ts`

**Observed**
- current response fields include:
  - `planKey`
  - `billingStatus`
  - `accessState`
  - `founderProtected`
  - `founderLockedPlan`
  - `upgradeTargets`
  - Stripe configuration flags

**Assessment**
- this is structurally strong, but `planKey` may eventually want to become `membershipTier` or `currentPlanKey` depending on whether the endpoint is intended to expose entitlement or billing identity
- `upgradeTargets` likely refers to internal billing plan targets, not user-facing tiers

**Phase 2B follow-up**
- decide whether billing status endpoint should keep `planKey` as canonical or split into:
  - `membershipTier`
  - `currentPlanKey`
- clarify whether `upgradeTargets` should become `upgradeLookupKeys`

---

### 5. `services/planCatalog.ts`

**Observed**
- contains both:
  - `BillingPlanKey = 'free' | 'amateur' | 'professional' | 'founder_professional'`
  - `stripeLookupKey`
  - `entitlementTier`
- also uses `planId`, `publicLabel`, `displayName`, and `allowedUpgrades`

**Assessment**
- this is the main concentration point for naming decisions
- it already separates a lot of concepts, which is good
- however, multiple labels for related ideas create drift risk:
  - `BillingPlanKey`
  - `stripeLookupKey`
  - `entitlementTier`
  - `allowedUpgrades`

**Phase 2B follow-up**
- define the canonical distinction clearly:
  - `membershipTier` = entitlement level
  - `lookupKey` = checkout target
  - `planKey` = internal billing catalog identity, only if still needed
- verify whether `founder_professional` should remain a `BillingPlanKey` while checkout uses `founder_professional_monthly`

---

### 6. `services/usersService.ts`

**Observed**
- legacy membership aliases still appear:
  - `performer`
  - `semi-pro`
- comments and logic refer to paid tiers in a broader, backward-compatible way

**Assessment**
- this is one of the largest naming-drift hotspots
- it is not necessarily wrong yet because backward compatibility may still be required
- but it must be documented as legacy normalization, not active billing vocabulary

**Phase 2B follow-up**
- isolate legacy alias handling behind normalization helpers
- document that canonical active tiers are:
  - `free`
  - `amateur`
  - `professional`

---

### 7. `types.ts`

**Observed**
- `semi-pro` is still retained for backward compatibility
- tier-like values include older membership vocabulary

**Assessment**
- this is another important hotspot because type drift becomes bug drift

**Phase 2B follow-up**
- tighten the canonical billing and entitlement types
- preserve legacy aliases only in normalization layers, not in new active billing flow types where possible

---

### 8. `server/usage.ts`

**Observed**
- uses `normalizeTier(...)`, `tierRank(...)`, and multiple references to `semi-pro`
- also contains comments such as `pro-only`
- several messages still say `plan` generically

**Assessment**
- usage enforcement is adjacent to billing, so naming drift here matters
- this file still treats `tier` as the dominant word

**Phase 2B follow-up**
- likely keep `tier` for entitlement comparisons if desired, but document that it means **membership tier**
- remove casual `pro` wording in favor of `professional` where this affects active UI or logic labels

---

### 9. `api/adminUsers.ts`

**Observed**
- explicitly handles mixed historical columns and values:
  - `membership` vs `tier`
  - `pro` vs `professional`

**Assessment**
- this file is an admin compatibility layer and should remain tolerant
- however, it should be clearly treated as a legacy/admin normalization area, not the standard naming model

**Phase 2B follow-up**
- keep compatibility logic
- annotate it as historical normalization, not canonical naming

---

## Drift categories found

### A. Canonical active billing language appears good

These look healthy in the active billing path:

- `/api/billing/create-checkout-session`
- `/api/billing/create-portal-session`
- `/api/billing/status`
- `lookupKey`
- `billingStatus`
- `founderProtected`

### B. Legacy vocabulary still present

These were found and should be treated as legacy compatibility only:

- `pro`
- `semi-pro`
- `performer`
- `tier` database fallback naming in admin/user lookup areas

### C. Ambiguous terms still in play

These terms still need canonical decisions in Phase 2B refactor passes:

- `plan`
- `tier`
- `planKey`
- `allowedUpgrades`
- `upgradeTargets`
- `status`

## Proposed canonical naming map for the next pass

This scan supports the following target map for the real refactor pass:

- `membershipTier` → entitlement level shown in app logic
- `lookupKey` → checkout target sent to billing checkout endpoint
- `subscriptionStatus` or `billingStatus` → Stripe lifecycle state
- `founderProtected` → founder billing protection flag
- `founderPriceLocked` → founder locked-price state

## Recommended Phase 2B next actions

### Pass 2 — Canonical map application

Decide exactly which of these stays exposed in billing responses:

- `planKey`
- `membershipTier`
- `upgradeTargets`
- `upgradeLookupKeys`

### Pass 3 — Replace drift

Refactor active billing files first:

- `App.tsx`
- `services/billingClient.ts`
- `services/planCatalog.ts`
- `server/billing/planMapping.ts`
- `server/billing/status.ts`
- `api/billing/*.ts`

### Pass 4 — Legacy isolation

Move old aliases like `pro`, `semi-pro`, and `performer` behind normalization utilities and comment them as backward-compatibility only.

## Suggested grep commands for follow-up

```bash
rg -n "\\bplan\\b|\\btier\\b|lookup|price|\\bpro\\b|professional|founder|status|stripe" App.tsx api server services components types.ts constants.ts
rg -n "semi-pro|performer|\\bpro\\b" services types.ts api
rg -n "planKey|lookupKey|stripeLookupKey|upgradeTargets|allowedUpgrades" App.tsx api server services
```

## Result of this pass

Phase 2B Pass 1 is complete.

This pass does **not** change behavior. It creates the naming scan baseline needed before doing the actual consistency refactor in the next Phase 2B pass.
