// ESM compatibility shim for Vercel runtime.
// api/ai/_lib/usage.ts imports "./telemetry.js" at runtime.
// This file ensures api/ai/_lib/telemetry.js exists after build by re-exporting
// the canonical server-side telemetry utilities.

export { getIpFromReq, hashIp, logUsageEvent } from "../../../server/telemetry.js";
