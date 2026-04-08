# Phase 5 — Minimal Observability Implementation

Implemented with a deliberately small footprint:

## Table
- `public.user_activity_log`

## Event types now tracked
- `signup`
- `trial_started`
- `login` / `first_login`
- `tool_used` / `first_tool_used`
- `idea_saved` / `first_idea_saved`
- `pricing_viewed`
- `upgrade_prompt_viewed`
- `upgrade_clicked`
- `checkout_started`
- `checkout_completed`
- `quota_hit`
- `trial_expired`
- `error`

## Hooks added in this patch
- Signup/trial start logging in `components/Auth.tsx` and `App.tsx`
- Billing page pricing-view logging in `components/BillingSettings.tsx`
- Live Rehearsal quota-hit logging in `components/LiveRehearsal.tsx`
- Video Rehearsal quota-hit logging in `components/VideoRehearsal.tsx`

## Query pack
Use `docs/PHASE5_OBSERVABILITY_QUERIES.sql` for the first reporting pass.

## Goal
This is intentionally minimal so you can learn:
- where IBM users come from
- what they try first
- when they hit limits
- whether billing interest turns into checkout
