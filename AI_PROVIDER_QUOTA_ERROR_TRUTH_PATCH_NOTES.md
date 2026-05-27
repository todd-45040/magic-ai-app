# AI Provider Quota Error Truth Patch

## Problem
Visual Brainstorm could still show the account-upgrade quota message even after admin usage bypass was working.

## Root Cause
Provider-side Imagen/Gemini quota or resource exhaustion errors were being normalized as `QUOTA_EXCEEDED`. The UI correctly treats `QUOTA_EXCEEDED` as an application/account quota failure, so provider capacity problems were being mislabeled as user allowance failures.

## Fix
`api/ai/_lib/hardening.ts` now reserves `QUOTA_EXCEEDED` for Magic AI Wizard application-level quota enforcement only. Provider quota/resource-exhausted responses are returned as temporary service availability problems instead.

## Result
Admin users should no longer see:

> You have reached the current allowance for AI. Upgrade for more capacity or wait until your usage resets.

for provider-side image generation availability errors. True application quota denials still use the quota error path.
