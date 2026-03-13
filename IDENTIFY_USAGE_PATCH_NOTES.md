Identify a Trick usage patch

Changed files:
- services/usageTracker.ts
- components/MagicianMode.tsx

What this patch does:
- adds a new local usage metric: identify
- records one Identify usage unit after a successful Identify a Trick result
- exposes Identify daily used/limit/remaining data to the Home Usage & Limits snapshot

This is packaged as a focused patch bundle so you can apply it on top of your current working repo without overwriting newer Home panel polish work.
