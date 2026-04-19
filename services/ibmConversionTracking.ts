import type { User } from '../types';
import { logUserActivity, type UserActivityEventType } from './userActivityService';
import { getPartnerTrialLabel, getTrialPromptStage, isPartnerTrialUser } from './trialMessaging';
import { getPartnerMeta } from './partnerTrialService';

function getUserKey(user?: User | null): string {
  return String(user?.email || 'anonymous').trim().toLowerCase() || 'anonymous';
}

function safeStorageKey(eventType: string, user?: User | null, suffix?: string): string {
  const userKey = getUserKey(user).replace(/[^a-z0-9@._-]/gi, '_');
  return `maw_${eventType}_${userKey}${suffix ? `_${suffix}` : ''}`;
}

function markOnce(key: string): boolean {
  try {
    if (typeof window === 'undefined') return true;
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

function baseMetadata(user?: User | null): Record<string, any> {
  const meta: Record<string, any> = {};
  if (isPartnerTrialUser(user)) {
    Object.assign(meta, getPartnerMeta(user || undefined));
    meta.converted_from_trial = true;
    meta.partner_label = getPartnerTrialLabel(user);
  }
  if (typeof user?.requestedTrialDays === 'number' && user.requestedTrialDays > 0) {
    meta.requested_trial_days = user.requestedTrialDays;
  }
  return meta;
}

export function isPartnerConversionCandidate(user?: User | null): boolean {
  return isPartnerTrialUser(user);
}

export function isIbmConversionCandidate(user?: User | null): boolean {
  return isPartnerConversionCandidate(user);
}

export async function logIbmConversionEvent(
  user: User | null | undefined,
  eventType: UserActivityEventType,
  metadata?: Record<string, any>,
): Promise<void> {
  if (!isPartnerConversionCandidate(user)) return;
  await logUserActivity({
    tool_name: 'billing',
    event_type: eventType,
    success: true,
    metadata: { ...baseMetadata(user), ...(metadata || {}) },
  });
}

export async function logTrialPromptViewed(user: User | null | undefined, location: 'dashboard' | 'billing' | 'app' | 'app'): Promise<void> {
  if (!isPartnerConversionCandidate(user)) return;
  const stage = getTrialPromptStage(user);
  if (!stage || stage === 'none') return;
  const key = safeStorageKey('upgrade_prompt_viewed', user, stage);
  if (!markOnce(key)) return;
  await logIbmConversionEvent(user, 'upgrade_prompt_viewed', { stage, location });
}

export async function logTrialExpiredOnce(user: User | null | undefined, location: 'dashboard' | 'billing' | 'app' | 'app'): Promise<void> {
  if (!isPartnerConversionCandidate(user)) return;
  const stage = getTrialPromptStage(user);
  if (stage !== 'expired') return;
  const key = safeStorageKey('trial_expired', user);
  if (!markOnce(key)) return;
  await logIbmConversionEvent(user, 'trial_expired', { location, stage: 'expired' });
}
