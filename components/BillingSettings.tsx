import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import type { BillingPlanKey } from '../services/planCatalog';
import { BILLING_PLAN_CATALOG } from '../services/planCatalog';
import {
  createPortalSession,
  fetchBillingStatus,
  type BillingPortalPayload,
  type BillingStatusPayload,
} from '../services/billingClient';
import { ShieldIcon, WandIcon, ClockIcon, CalendarIcon, DollarSignIcon, LockIcon } from './icons';

interface BillingSettingsProps {
  user: User;
  onUpgrade: (tier: 'amateur' | 'professional') => Promise<void> | void;
}

const statusTone: Record<string, string> = {
  active: 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10',
  trialing: 'text-sky-300 border-sky-400/25 bg-sky-500/10',
  past_due: 'text-amber-200 border-amber-400/25 bg-amber-500/10',
  canceled: 'text-slate-200 border-slate-500/25 bg-slate-500/10',
  unpaid: 'text-rose-200 border-rose-400/25 bg-rose-500/10',
  unknown: 'text-slate-200 border-slate-500/25 bg-slate-500/10',
};

function formatDate(value: string | null): string {
  if (!value) return 'Not available yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available yet';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatPriceCents(value: number | null): string {
  if (typeof value !== 'number') return 'Locked founder rate';
  return `$${(value / 100).toFixed(2)}/mo`;
}

function humanizePlan(planKey: BillingPlanKey | null | undefined): string {
  if (!planKey) return 'Not set';
  return BILLING_PLAN_CATALOG[planKey]?.displayName || planKey.replace(/_/g, ' ');
}

const InfoTile: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  accentClassName?: string;
}> = ({ icon: Icon, label, value, hint, accentClassName }) => (
  <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${accentClassName || ''}`}>
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/10 text-purple-200">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">{label}</p>
        <p className="mt-1 text-base font-semibold text-white">{value}</p>
        {hint ? <p className="mt-1 text-sm text-white/60">{hint}</p> : null}
      </div>
    </div>
  </div>
);

const BillingSettings: React.FC<BillingSettingsProps> = ({ user, onUpgrade }) => {
  // build-fix normalized: JSX structure verified and end-of-component closing tags aligned.
  const [status, setStatus] = useState<BillingStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalMessage, setPortalMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBillingStatus();
      setStatus(result);
    } catch (err: any) {
      setError(err?.message || 'Unable to load billing status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const currentPlanKey = status?.planKey || (user?.membership === 'professional' ? 'professional' : user?.membership === 'amateur' ? 'amateur' : 'free');
  const currentPlanLabel = useMemo(() => humanizePlan(currentPlanKey), [currentPlanKey]);

  const founderNotice = useMemo(() => {
    if (!status?.founderProtected) return 'No founder protection is attached to this account.';
    const lockedPlan = humanizePlan(status.founderLockedPlan);
    const lockedRate = formatPriceCents(status.founderLockedPriceCents);
    return `${lockedPlan} remains founder protected on this account. Locked rate: ${lockedRate}.`;
  }, [status?.founderLockedPlan, status?.founderLockedPriceCents, status?.founderProtected]);

  const openPortal = useCallback(async () => {
    setPortalBusy(true);
    setPortalMessage(null);
    try {
      const result = await createPortalSession();
      const portalResult = result as BillingPortalPayload;
      if (portalResult.url) {
        window.location.href = portalResult.url;
        return;
      }
      setPortalMessage(portalResult.message || 'Billing portal is not available yet.');
    } catch (err: any) {
      setPortalMessage(err?.message || 'Billing portal is not available yet.');
    } finally {
      setPortalBusy(false);
    }
  }, []);

  const amateurUpgradeAvailable = Boolean(status?.upgradeTargets.includes('amateur'));
  const professionalUpgradeAvailable = Boolean(status?.upgradeTargets.includes('professional') || status?.upgradeTargets.includes('founder_professional'));
  const isCurrentAmateur = currentPlanKey === 'amateur';
  const isCurrentProfessional = currentPlanKey === 'professional' || currentPlanKey === 'founder_professional';

  return (
    <div className="px-4 py-6 space-y-6 md:px-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-yellow-300/80">Billing & Account</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-white md:text-3xl">
            Billing settings and upgrade controls
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
            This page reads the billing status endpoint directly, so current plan state, upgrade availability, and founder protection stay aligned with entitlement truth.
          </p>
        </div>
        <button
          onClick={() => void loadStatus()}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
        >
          Refresh billing status
        </button>
      </div>

      {status && !status.stripeConfigured ? (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <LockIcon className="mt-0.5 h-5 w-5 text-amber-200" />
            <div>
              <p className="font-semibold">Stripe not connected yet</p>
              <p className="mt-1 text-amber-100/85">
                Upgrade available actions are already routed through the billing endpoint layer. Until Stripe is connected, checkout and portal actions return structured placeholder responses and do not change access.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {status?.founderProtected ? (
        <div className="rounded-2xl border border-yellow-300/30 bg-yellow-500/10 px-5 py-4 text-sm text-yellow-50">
          <div className="flex items-start gap-3">
            <ShieldIcon className="mt-0.5 h-5 w-5 text-yellow-200" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Founder protected</p>
                <span className="rounded-full border border-yellow-300/30 bg-yellow-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-yellow-100">
                  Locked pricing preserved
                </span>
              </div>
              <p className="mt-1 text-yellow-50/90">{founderNotice}</p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InfoTile
          icon={WandIcon}
          label="Current plan"
          value={loading ? 'Loading…' : currentPlanLabel}
          hint={status ? `Current plan state: ${status.accessState}` : 'Resolved from billing status when available.'}
          accentClassName={isCurrentProfessional ? 'border-amber-400/20 bg-amber-500/5' : isCurrentAmateur ? 'border-purple-400/20 bg-purple-500/5' : ''}
        />
        <InfoTile
          icon={ShieldIcon}
          label="Founder protection"
          value={status?.founderProtected ? 'Founder protected' : 'Standard pricing'}
          hint={loading ? 'Loading founder protection…' : founderNotice}
          accentClassName={status?.founderProtected ? 'border-yellow-300/20 bg-yellow-500/5' : ''}
        />
        <InfoTile
          icon={ClockIcon}
          label="Billing state"
          value={loading ? 'Loading…' : (status?.billingStatus || 'Unknown')}
          hint={status?.cancelAtPeriodEnd ? 'Cancellation scheduled at period end.' : 'No end-of-period cancellation is scheduled.'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-5 w-5 text-purple-200" />
            <div>
              <h2 className="text-lg font-semibold text-white">Billing timing</h2>
              <p className="mt-1 text-sm text-white/60">Renewal, cancellation, and usage window dates in one place.</p>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Renewal</p>
                <p className="mt-1 text-sm text-white">{loading ? 'Loading…' : formatDate(status?.renewalDate || null)}</p>
                <p className="mt-1 text-xs text-white/50">{status?.cancelAtPeriodEnd ? 'Cancellation scheduled at period end.' : 'Renews normally when billing is active.'}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[status?.billingStatus || 'unknown'] || statusTone.unknown}`}>
                {status?.billingStatus || 'unknown'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Usage window start</p>
                <p className="mt-1 text-sm text-white">{loading ? 'Loading…' : formatDate(status?.usagePeriodStart || null)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Usage window end</p>
                <p className="mt-1 text-sm text-white">{loading ? 'Loading…' : formatDate(status?.usagePeriodEnd || null)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <DollarSignIcon className="h-5 w-5 text-amber-200" />
            <div>
              <h2 className="text-lg font-semibold text-white">Portal & customer record</h2>
              <p className="mt-1 text-sm text-white/60">Pre-Stripe placeholder messaging stays calm and intentional here.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3 text-sm text-white/70">
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Billing customer</p>
              <p className="mt-1 text-sm text-white">
                {loading ? 'Loading…' : status?.billingCustomerExists ? 'Customer record exists' : 'Customer record not created yet'}
              </p>
              <p className="mt-1 text-xs text-white/50">
                {status?.stripeConfigured
                  ? 'Portal access will use the billing customer record when Stripe is connected.'
                  : 'Expected before Stripe launch. This account is still in placeholder mode.'}
              </p>
            </div>
            <button
              onClick={() => void openPortal()}
              disabled={portalBusy}
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {portalBusy ? 'Checking billing portal…' : status?.stripeConfigured ? 'Open billing portal' : 'Billing portal coming soon'}
            </button>
            {portalMessage ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
                {portalMessage}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Upgrade actions</h2>
            <p className="mt-1 text-sm text-white/65">
              All upgrade actions route through the billing endpoint layer. Labels stay consistent with locked by plan, upgrade available, and founder protected states.
            </p>
          </div>
          <div className="text-xs text-white/45">
            Allowed upgrade targets: {loading ? 'Loading…' : (status?.upgradeTargets.length ? status.upgradeTargets.map((planKey) => humanizePlan(planKey)).join(', ') : 'None')}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={`rounded-2xl p-5 ${isCurrentAmateur ? 'border border-purple-300/30 bg-purple-500/12' : 'border border-purple-400/20 bg-purple-500/10'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-purple-100">Amateur</p>
                  {isCurrentAmateur ? (
                    <span className="rounded-full border border-purple-300/30 bg-purple-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-purple-100">
                      Current plan
                    </span>
                  ) : amateurUpgradeAvailable ? (
                    <span className="rounded-full border border-purple-300/25 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-purple-100">
                      Upgrade available
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-white/65">Expanded creation limits with Show Planner, Search, and Saved Ideas access.</p>
              </div>
              <span className="rounded-full border border-purple-400/25 px-3 py-1 text-xs font-semibold text-purple-200">$9.95/mo</span>
            </div>
            <button
              onClick={() => void onUpgrade('amateur')}
              disabled={loading || !amateurUpgradeAvailable || isCurrentAmateur}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCurrentAmateur ? 'Current plan' : amateurUpgradeAvailable ? 'Upgrade to Amateur' : 'Locked by plan'}
            </button>
          </div>

          <div className={`rounded-2xl p-5 ${isCurrentProfessional ? 'border border-amber-300/35 bg-amber-500/12' : 'border border-amber-400/30 bg-amber-500/10'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-amber-100">Professional</p>
                  {isCurrentProfessional ? (
                    <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                      Current plan
                    </span>
                  ) : status?.founderProtected ? (
                    <span className="rounded-full border border-yellow-300/30 bg-yellow-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-yellow-100">
                      Founder protected
                    </span>
                  ) : professionalUpgradeAvailable ? (
                    <span className="rounded-full border border-amber-300/25 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                      Upgrade available
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-white/65">Highest limits, rehearsal tools, business tools, and founder-aware upgrade protection.</p>
              </div>
              <span className="rounded-full border border-amber-400/25 px-3 py-1 text-xs font-semibold text-amber-100">
                {status?.founderProtected ? formatPriceCents(status?.founderLockedPriceCents || 2995) : '$29.95/mo'}
              </span>
            </div>
            <button
              onClick={() => void onUpgrade('professional')}
              disabled={loading || !professionalUpgradeAvailable || isCurrentProfessional}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCurrentProfessional
                ? 'Current plan'
                : status?.founderProtected
                  ? 'Continue with founder pricing'
                  : professionalUpgradeAvailable
                    ? 'Upgrade to Professional'
                    : 'Locked by plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingSettings;
