import type { User } from "../types";
import { getMembershipDaysRemaining, hasExpiredTrial, isActiveTrialUser } from "./membershipService";

export type TrialPromptStage = 'none' | '7d' | '3d' | '1d' | 'expired';

export function isPartnerTrialUser(user?: User | null): boolean {
  const source = String(user?.signupSource || '').toLowerCase();
  return source === 'ibm' || source === 'sam';
}

export function isIbmTrialUser(user?: User | null): boolean {
  return String(user?.signupSource || '').toLowerCase() === 'ibm';
}

export function getPartnerTrialLabel(user?: User | null): string {
  return String(user?.signupSource || '').toLowerCase() === 'sam' ? 'SAM Partner Access' : 'IBM Partner Access';
}

export function getTrialPromptStage(user?: User | null): TrialPromptStage {
  if (!user || !isPartnerTrialUser(user)) return 'none';
  if (hasExpiredTrial(user)) return 'expired';
  if (!isActiveTrialUser(user)) return 'none';
  const days = getMembershipDaysRemaining(user);
  if (days == null) return 'none';
  if (days <= 1) return '1d';
  if (days <= 3) return '3d';
  if (days <= 7) return '7d';
  return 'none';
}

export function getTrialPromptCopy(user?: User | null): { stage: TrialPromptStage; title: string; message: string; cta: string } | null {
  const stage = getTrialPromptStage(user);
  if (stage === 'none') return null;
  if (stage === 'expired') {
    return {
      stage,
      title: `Your ${getPartnerTrialLabel(user)} trial has ended`,
      message: 'Your 30-day Professional Trial has ended. Your account and saved work stay intact, but Professional tools are now locked until you upgrade.',
      cta: 'View upgrade options',
    };
  }
  const days = stage === '1d' ? '1 day' : stage === '3d' ? '3 days' : '7 days';
  return {
    stage,
    title: `Your ${getPartnerTrialLabel(user)} trial ends in ${days}`,
    message: 'Keep your scripts, rehearsal tools, and show-planning workflow active by choosing a paid plan before the trial ends.',
    cta: 'Review plans',
  };
}
