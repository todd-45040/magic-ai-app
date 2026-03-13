// services/blockedUx.ts
// One canonical client-side normalizer for "blocked" AI/tool states.
//
// Sources:
// - Hardened AI endpoints: { ok:false, error_code, message, retryable }
// - Legacy endpoints: { error: string } or plain Error(message)
//
// This file converts those into a single UI contract.

export type BlockedReasonCode =
  | 'USAGE_LIMIT_REACHED'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'TIER_RESTRICTED'
  | 'PRO_ONLY'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNKNOWN';

export type BlockedUx = {
  blocked: boolean;
  reason: BlockedReasonCode;
  title: string;
  message: string;
  retryable: boolean;
  showUpgrade: boolean;
  showTryAgain: boolean;
  upgradeLabel?: string;
  badge?: string;
  currentPlanLabel?: string;
  founderProtected?: boolean;
};

import type { User } from '../types';
import { getUpgradeUxCopy, isFounderProtected } from './upgradeUx';
import { formatTierLabel, normalizeTier } from './membershipService';

type AnyErr = any;

function lower(s: any) {
  return String(s ?? '').toLowerCase();
}

function pullMessage(err: AnyErr): string {
  return (
    err?.message ??
    err?.error ??
    err?.msg ??
    err?.toString?.() ??
    ''
  );
}

function pullCode(err: AnyErr): string {
  return (
    err?.code ??
    err?.error_code ??
    err?.errorCode ??
    err?.status ??
    ''
  );
}

export function normalizeBlockedUx(err: unknown, opts?: { toolName?: string; plan?: string; user?: User | null; targetPlan?: 'Amateur' | 'Professional' }): BlockedUx {
  const toolName = opts?.toolName || 'this tool';
  const plan = (opts?.plan || opts?.user?.membership || '').toLowerCase();
  const founderProtected = isFounderProtected(opts?.user);
  const currentPlanLabel = formatTierLabel(normalizeTier(plan || 'free'));

  const rawMsg = pullMessage(err);
  const msg = lower(rawMsg);
  const rawCode = String(pullCode(err) || '').toUpperCase();

  // Prefer explicit server error_code when present.
  const code =
    rawCode.includes('USAGE_LIMIT') ? 'USAGE_LIMIT_REACHED' :
    rawCode.includes('QUOTA') ? 'QUOTA_EXCEEDED' :
    rawCode === '429' || rawCode.includes('RATE') ? 'RATE_LIMITED' :
    rawCode === '401' || rawCode.includes('UNAUTH') ? 'UNAUTHORIZED' :
    rawCode.includes('PRO') ? 'PRO_ONLY' :
    rawCode.includes('TIER') ? 'TIER_RESTRICTED' :
    rawCode.includes('TIMEOUT') ? 'TIMEOUT' :
    rawCode.includes('SERVICE_UNAVAILABLE') ? 'SERVICE_UNAVAILABLE' :
    'UNKNOWN';

  // Heuristic fallback if no code:
  const heurIsRate =
    msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('resource_exhausted');
  const heurIsQuota =
    msg.includes('quota') || msg.includes('usage limit') || msg.includes('limit reached') || msg.includes('exceeded');
  const heurIsAuth =
    msg.includes('unauthorized') || msg.includes('not authorized') || msg.includes('login');
  const heurIsTimeout =
    msg.includes('timeout') || msg.includes('timed out');

  const inferred =
    code !== 'UNKNOWN' ? code :
    heurIsAuth ? 'UNAUTHORIZED' :
    heurIsTimeout ? 'TIMEOUT' :
    heurIsRate ? 'RATE_LIMITED' :
    heurIsQuota ? 'USAGE_LIMIT_REACHED' :
    'UNKNOWN';

  const blocked = inferred !== 'UNKNOWN';

  if (!blocked) {
    return {
      blocked: false,
      reason: 'UNKNOWN',
      title: 'Something went wrong',
      message: rawMsg || 'Unexpected error.',
      retryable: Boolean((err as any)?.retryable),
      showUpgrade: false,
      showTryAgain: true,
      upgradeLabel: undefined,
    };
  }

  const retryable =
    Boolean((err as any)?.retryable) ||
    inferred === 'RATE_LIMITED' ||
    inferred === 'TIMEOUT' ||
    inferred === 'SERVICE_UNAVAILABLE';

  const showUpgrade =
    inferred === 'QUOTA_EXCEEDED' ||
    inferred === 'USAGE_LIMIT_REACHED' ||
    inferred === 'PRO_ONLY' ||
    inferred === 'TIER_RESTRICTED';

  const showTryAgain = retryable || inferred === 'UNAUTHORIZED';

  const targetPlan = opts?.targetPlan ?? (plan === 'amateur' ? 'Professional' : 'Amateur');
  const upgradeCopy =
    inferred === 'PRO_ONLY' || inferred === 'TIER_RESTRICTED'
      ? getUpgradeUxCopy('locked_by_plan', { toolName, targetPlan, user: opts?.user ?? null })
      : inferred === 'QUOTA_EXCEEDED' || inferred === 'USAGE_LIMIT_REACHED'
        ? getUpgradeUxCopy('limit_reached', { toolName, targetPlan, user: opts?.user ?? null })
        : null;

  const title =
    inferred === 'RATE_LIMITED' ? 'Please wait a moment' :
    inferred === 'TIMEOUT' ? 'The request timed out' :
    inferred === 'SERVICE_UNAVAILABLE' ? 'AI service temporarily unavailable' :
    inferred === 'UNAUTHORIZED' ? 'Please sign in' :
    upgradeCopy?.badge === 'Locked by Plan' ? 'Locked by plan' :
    upgradeCopy?.badge === 'Limit Reached' ? 'Limit reached' :
    'Blocked';

  const message =
    inferred === 'UNAUTHORIZED'
      ? `You need to sign in to use ${toolName}.`
      : inferred === 'RATE_LIMITED'
        ? `We’re receiving too many requests right now. Please wait a moment, then try again.`
        : inferred === 'TIMEOUT'
          ? `The request took too long. Please try again.`
          : inferred === 'SERVICE_UNAVAILABLE'
            ? `The AI service is temporarily unavailable. Please try again shortly.`
            : (upgradeCopy?.message || rawMsg || `Blocked from using ${toolName}.`);

  return {
    blocked: true,
    reason: inferred as any,
    title,
    message,
    retryable,
    showUpgrade,
    showTryAgain,
    upgradeLabel: upgradeCopy?.primaryCta || (showUpgrade ? 'Upgrade' : undefined),
    badge: upgradeCopy?.badge,
    currentPlanLabel,
    founderProtected,
  };
}
