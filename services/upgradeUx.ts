import type { User } from '../types';

export type UpgradeUxKind =
  | 'locked_by_plan'
  | 'limit_reached'
  | 'upgrade_available'
  | 'trial_exhausted'
  | 'founder_protected';

export type UpgradeUxCopy = {
  kind: UpgradeUxKind;
  title: string;
  message: string;
  badge?: string;
  primaryCta: string;
  secondaryCta?: string;
};

export function isFounderProtected(user?: User | null): boolean {
  return Boolean(user?.foundingCircleMember || user?.pricingLock);
}

export function getFounderLockLabel(user?: User | null): string {
  return user?.pricingLock || 'founding_pro_admc_2026';
}

export function getUpgradeUxCopy(kind: UpgradeUxKind, opts?: {
  toolName?: string;
  targetPlan?: 'Amateur' | 'Professional';
  user?: User | null;
}): UpgradeUxCopy {
  const toolName = opts?.toolName || 'this feature';
  const targetPlan = opts?.targetPlan || 'Professional';
  const founderProtected = isFounderProtected(opts?.user);

  if (kind === 'founder_protected') {
    return {
      kind,
      badge: 'Founder Protected',
      title: 'Your founder pricing is protected',
      message: 'Your Founder Professional rate stays locked across subscription changes and reactivation. You will not be moved onto the public Professional price by mistake.',
      primaryCta: 'Continue with founder pricing',
      secondaryCta: 'Close',
    };
  }

  if (kind === 'trial_exhausted') {
    return {
      kind,
      badge: 'Trial Ended',
      title: 'Your partner access trial has ended',
      message: founderProtected
        ? 'Your founder protection remains intact. Choose a paid plan when you are ready and your locked founder pricing will still be honored.'
        : 'Your 30-day Professional Trial has ended. Choose a paid plan to keep your rehearsal tools, scripts, and show-planning workflow active.',
      primaryCta: founderProtected ? 'View founder options' : 'View plans',
      secondaryCta: 'Close',
    };
  }

  if (kind === 'limit_reached') {
    return {
      kind,
      badge: 'Limit Reached',
      title: 'You have reached your current limit',
      message: founderProtected
        ? `You have reached the current allowance for ${toolName}. Upgrade when ready and your founder pricing will remain protected.`
        : `You have reached the current allowance for ${toolName}. Upgrade for more capacity or wait until your usage resets.`,
      primaryCta: founderProtected ? 'Upgrade with founder pricing' : `Upgrade to ${targetPlan}`,
      secondaryCta: 'Close',
    };
  }

  if (kind === 'upgrade_available') {
    return {
      kind,
      badge: 'Upgrade Available',
      title: 'More capacity is available',
      message: founderProtected
        ? 'You can move up without losing your founder protection. Your locked pricing remains attached to your account.'
        : 'Upgrade to unlock more monthly capacity, heavier tools, and fewer limits across the platform.',
      primaryCta: founderProtected ? 'See founder upgrade options' : `Upgrade to ${targetPlan}`,
      secondaryCta: 'Not now',
    };
  }

  return {
    kind: 'locked_by_plan',
    badge: 'Locked by Plan',
    title: `${toolName} is not included in your current plan`,
    message: founderProtected
      ? `This feature requires ${targetPlan}. Your founder pricing stays protected if you upgrade.`
      : `This feature requires ${targetPlan}. Upgrade to unlock it.`,
    primaryCta: founderProtected ? 'Unlock with founder pricing' : `Upgrade to ${targetPlan}`,
    secondaryCta: 'Close',
  };
}
