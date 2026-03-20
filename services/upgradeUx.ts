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
      badge: 'Trial Exhausted',
      title: 'Your trial access has ended',
      message: founderProtected
        ? 'Your founder protection remains intact. Choose a paid plan when you are ready and your locked founder pricing will still be honored.'
        : 'Choose a plan to continue creating, rehearsing, and managing your shows without trial limits.',
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

  const amateurLimitedSpecialtyTools = new Set([
    'Magic Dictionary',
    'Magic Theory Tutor',
    'Mentalism Assistant',
    'Gospel Magic Assistant',
  ]);

  if (kind === 'upgrade_available') {
    const limitedSpecialtyMessage = amateurLimitedSpecialtyTools.has(toolName)
      ? founderProtected
        ? `${toolName} is already available on your current plan with limited access. You can upgrade for fuller access without losing your founder protection.`
        : `${toolName} is already available on your current plan with limited access. Upgrade for fuller access and more monthly capacity.`
      : null;

    return {
      kind,
      badge: 'Upgrade Available',
      title: 'More capacity is available',
      message: limitedSpecialtyMessage ?? (founderProtected
        ? 'You can move up without losing your founder protection. Your locked pricing remains attached to your account.'
        : 'Upgrade to unlock more monthly capacity, heavier tools, and fewer limits across the platform.'),
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
