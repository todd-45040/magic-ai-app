import type { User } from '../types';
import type { UsageStatus } from './usageStatusService';
import { getUsage } from './usageTracker';

export type ToolUsageRow = {
  key: string;
  label: string;
  period: 'daily' | 'monthly' | 'unlimited' | 'untracked';
  unit?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  summary: string;
  detail: string;
};

export type NormalizedUsageSnapshot = {
  ok: boolean;
  plan: string;
  planLabel: string;
  used: number;
  limit: number;
  remaining: number;
  burstLimit: number;
  burstRemaining: number;
  nearLimit: boolean;
  upgradeRecommended: boolean;
  warnings: string[];
  resetLabel: string;
  toolRows: ToolUsageRow[];
  liveHeader: {
    used: number;
    limit: number;
    remaining: number;
  } | null;
};

function normalizePlan(membership?: string | null) {
  if (membership === 'admin') return 'admin';
  if (membership === 'professional' || membership === 'semi-pro' || membership === 'performer') return 'professional';
  if (membership === 'amateur') return 'amateur';
  if (membership === 'expired') return 'expired';
  return 'trial';
}

export function formatPlanLabel(plan: string) {
  if (plan === 'admin') return 'Admin';
  if (plan === 'professional') return 'Professional';
  if (plan === 'amateur') return 'Amateur';
  if (plan === 'expired') return 'Expired';
  return 'Trial';
}

function getDailyAiLimitForPlan(plan: string) {
  if (plan === 'admin') return 10000;
  if (plan === 'professional') return 1000;
  if (plan === 'amateur') return 200;
  if (plan === 'expired') return 0;
  return 20;
}

function getBurstLimitForPlan(plan: string) {
  if (plan === 'admin' || plan === 'professional') return 120;
  if (plan === 'amateur') return 60;
  if (plan === 'expired') return 0;
  return 20;
}

function isLargePlaceholder(value: unknown) {
  return typeof value === 'number' && value >= 9999;
}

function buildRowFromUsage(key: string, label: string, usage: { used: number; limit: number; remaining: number }, unit?: string): ToolUsageRow {
  const suffix = unit ? ` ${unit}` : '';
  return {
    key,
    label,
    period: 'daily',
    unit,
    used: usage.used,
    limit: usage.limit,
    remaining: usage.remaining,
    summary: `${usage.used} / ${usage.limit}${suffix}`,
    detail: `Daily: ${usage.used} / ${usage.limit}${suffix}`,
  };
}

function buildIdentifyRow(serverStatus?: UsageStatus | null): ToolUsageRow {
  const identify = serverStatus?.quota?.identify;
  const dailyAiUsed = Number(serverStatus?.used ?? 0);

  if (identify && typeof identify.limit === 'number' && typeof identify.remaining === 'number' && !isLargePlaceholder(identify.limit)) {
    const used = Math.max(0, Number(identify.limit) - Number(identify.remaining));
    return {
      key: 'identify',
      label: 'Identify a Trick',
      period: 'monthly',
      used,
      limit: Number(identify.limit),
      remaining: Number(identify.remaining),
      summary: `${used} / ${Number(identify.limit)}`,
      detail: `Monthly: ${used} / ${Number(identify.limit)}`,
    };
  }

  return {
    key: 'identify',
    label: 'Identify a Trick',
    period: 'info',
    summary: 'Tracked in daily AI total',
    detail: dailyAiUsed > 0 ? `Daily AI total currently ${dailyAiUsed}` : 'Tracked in daily AI total',
  };
}

function buildVideoRow(plan: string, user?: User | null, serverStatus?: UsageStatus | null): ToolUsageRow {
  const quota = serverStatus?.quota?.video_uploads;
  const daily = quota?.daily;

  if (daily && typeof daily.used === 'number' && typeof daily.limit === 'number') {
    return {
      key: 'video_uploads',
      label: 'Video Rehearsal Uploads',
      period: 'daily',
      used: Number(daily.used),
      limit: Number(daily.limit),
      remaining: Number(daily.remaining ?? Math.max(0, Number(daily.limit) - Number(daily.used))),
      summary: `${Number(daily.used)} / ${Number(daily.limit)}`,
      detail: `Daily: ${Number(daily.used)} / ${Number(daily.limit)}`,
    };
  }

  if (quota && typeof quota.limit === 'number' && typeof quota.remaining === 'number' && !isLargePlaceholder(quota.limit)) {
    const used = Math.max(0, Number(quota.limit) - Number(quota.remaining));
    return {
      key: 'video_uploads',
      label: 'Video Rehearsal Uploads',
      period: 'monthly',
      used,
      limit: Number(quota.limit),
      remaining: Number(quota.remaining),
      summary: `${used} / ${Number(quota.limit)}`,
      detail: `Monthly: ${used} / ${Number(quota.limit)}`,
    };
  }

  const usage = user ? getUsage(user, 'video_upload') : { used: 0, limit: 0, remaining: 0 };
  return buildRowFromUsage('video_uploads', 'Video Rehearsal Uploads', usage);
}

export function buildNormalizedUsageSnapshot(user?: User | null, serverStatus?: UsageStatus | null): NormalizedUsageSnapshot {
  const plan = normalizePlan(serverStatus?.membership ?? user?.membership);
  const planLabel = formatPlanLabel(plan);

  const dailyAiLimit = Number(serverStatus?.limit ?? getDailyAiLimitForPlan(plan));
  const dailyAiUsed = Number(serverStatus?.used ?? user?.generationCount ?? 0);
  const dailyAiRemaining = Number(serverStatus?.remaining ?? Math.max(0, dailyAiLimit - dailyAiUsed));
  const burstLimit = Number(serverStatus?.burstLimit ?? getBurstLimitForPlan(plan));
  const burstRemaining = Number(serverStatus?.burstRemaining ?? burstLimit);

  const liveUsage = user ? getUsage(user, 'live_minutes') : { used: 0, limit: 0, remaining: 0 };
  const imageUsage = user ? getUsage(user, 'image') : { used: 0, limit: 0, remaining: 0 };

  const liveHeader = {
    used: Number(serverStatus?.quota?.live_audio_minutes?.daily?.used ?? serverStatus?.liveUsed ?? liveUsage.used),
    limit: Number(serverStatus?.quota?.live_audio_minutes?.daily?.limit ?? serverStatus?.liveLimit ?? liveUsage.limit),
    remaining: Number(serverStatus?.quota?.live_audio_minutes?.daily?.remaining ?? serverStatus?.liveRemaining ?? liveUsage.remaining),
  };

  const toolRows: ToolUsageRow[] = [
    buildRowFromUsage('live_audio_minutes', 'Live Rehearsal (Audio)', liveHeader, 'min'),
    buildRowFromUsage('image_gen', 'Image Generation', imageUsage),
    buildIdentifyRow(serverStatus),
    buildVideoRow(plan, user, serverStatus),
  ];

  return {
    ok: true,
    plan,
    planLabel,
    used: dailyAiUsed,
    limit: dailyAiLimit,
    remaining: dailyAiRemaining,
    burstLimit,
    burstRemaining,
    nearLimit: dailyAiLimit > 0 ? dailyAiRemaining <= Math.ceil(dailyAiLimit * 0.15) : false,
    upgradeRecommended: plan === 'trial' && dailyAiLimit > 0 ? dailyAiRemaining <= Math.ceil(dailyAiLimit * 0.15) : false,
    warnings: [],
    resetLabel: 'Daily usage resets each day',
    toolRows,
    liveHeader,
  };
}
