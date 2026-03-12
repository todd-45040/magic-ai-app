export const BILLING_UI_COPY = {
  currentPlan: 'Current plan',
  upgradeAvailable: 'Upgrade available',
  founderProtected: 'Founder protected',
  billingPortalComingSoon: 'Billing portal coming soon',
  renewsOn: 'Renews on',
  accessUntil: 'Access until',
  cancelsAtPeriodEnd: 'Cancels at period end',
  continueOnCurrentPlan: 'Continue on current plan',
} as const;

export function getSubscriptionStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}
