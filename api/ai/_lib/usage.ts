// Canonical usage shim for hardened AI endpoints.
//
// IMPORTANT:
// - There should be exactly ONE implementation of usage logic.
// - The implementation lives in: /server/usage.ts
// - The canonical export surface lives in: /lib/server/usage/index.ts
//
// Many API routes historically import from "./_lib/usage.js".
// Keep this file as a thin re-export so those imports remain stable.

export { getAiUsageStatus, enforceAiUsage, incrementAiUsage } from '../../../lib/server/usage/index.js';
