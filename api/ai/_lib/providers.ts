// NOTE: This file intentionally re-exports provider resolution from the shared server provider layer.
// All AI endpoints must agree on provider selection rules (env override -> DB app_settings -> default).
export type { AIProvider } from '../../../lib/server/providers/index.js';
export { resolveProvider } from '../../../lib/server/providers/index.js';
