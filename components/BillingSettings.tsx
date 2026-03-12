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
}> = ({ icon: Icon, label, value, hint }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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

  const currentPlanLabel = useMemo(() => {
    if (status?.planKey) return humanizePlan(status.planKey);
    return humanizePlan(user?.membership === 'professional' ? 'professional' : user?.membership === 'amateur' ? 'amateur' : 'free');
  }, [status?.planKey, user?.membership]);

  const founderNotice = useMemo(() => {
    if (!status?.founderProtected) return 'No founder pricing lock is attached to this account.';
    const lockedPlan = humanizePlan(status.founderLockedPlan);
    const lockedRate = formatPriceCents(status.founderLockedPriceCents);
    return `${lockedPlan} remains protected on this account. Locked rate: ${lockedRate}.`;
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

  return (
    <div className="px-4 md:px-6 py-6 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.08em] font-semibold text-yellow-300/80">Billing & Account</p>
          <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-white leading-tight">
            Billing settings and upgrade controls
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
            This page reads the billing status endpoint directly, so upgrade controls stay aligned with entitlement truth and Stripe placeholder mode.
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
              <p className="font-semibold">Stripe is not connected yet.</p>
              <p className="mt-1 text-amber-100/85">
                Upgrade actions are wired to the billing endpoint layer now. Until Stripe is connected, checkout and portal actions return structured placeholder responses instead of granting access.
              </p>
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
          hint={status ? `Access state: ${status.accessState}` : 'Resolved from billing status when available.'}
        />
        <InfoTile
          icon={ShieldIcon}
          label="Founder protection"
          value={status?.founderProtected ? 'Founder protected' : 'Standard pricing'}
          hint={loading ? 'Loading founder lock…' : founderNotice}
        />
        <InfoTile
          icon={ClockIcon}
          label="Billing state"
          value={loading ? 'Loading…' : (status?.billingStatus || 'Unknown')}
          hint={status?.cancelAtPeriodEnd ? 'Cancellation is scheduled at period end.' : 'No end-of-period cancellation is scheduled.'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-5 w-5 text-purple-200" />
            <h2 className="text-lg font-semibold text-white">Cycle timing</h2>
          </div>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Renewal date</p>
                <p className="mt-1 text-sm text-white">{loading ? 'Loading…' : formatDate(status?.renewalDate || null)}</p>
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
            <h2 className="text-lg font-semibold text-white">Portal & customer record</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm text-white/70">
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Billing customer</p>
              <p className="mt-1 text-sm text-white">
                {loading ? 'Loading…' : status?.billingCustomerExists ? 'Customer record exists' : 'No billing customer yet'}
              </p>
              <p className="mt-1 text-xs text-white/55">
                {loading ? 'Loading…' : status?.stripeCustomerIdPresent ? 'Stripe customer id is present in billing records.' : 'A Stripe customer will appear here after Stripe goes live.'}
              </p>
            </div>
            <button
              onClick={() => void openPortal()}
              disabled={portalBusy || loading}
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {portalBusy ? 'Opening billing portal…' : 'Open billing portal'}
            </button>
            {portalMessage ? <p className="text-sm text-amber-100">{portalMessage}</p> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Upgrade actions</h2>
            <p className="mt-1 text-sm text-white/65">
              All upgrade actions route through the billing endpoint layer. No client-side plan mutation is performed here.
            </p>
          </div>
          <div className="text-xs text-white/45">
            Allowed upgrade targets: {loading ? 'Loading…' : (status?.upgradeTargets.length ? status.upgradeTargets.map((planKey) => humanizePlan(planKey)).join(', ') : 'None')}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-purple-100">Amateur</p>
                <p className="mt-1 text-sm text-white/65">Expanded creation limits with Show Planner, Search, and Saved Ideas access.</p>
              </div>
              <span className="rounded-full border border-purple-400/25 px-3 py-1 text-xs font-semibold text-purple-200">$9.95/mo</span>
            </div>
            <button
              onClick={() => void onUpgrade('amateur')}
              disabled={loading || !status?.upgradeTargets.includes('amateur')}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Upgrade to Amateur
            </button>
          </div>

          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-100">Professional</p>
                <p className="mt-1 text-sm text-white/65">Highest limits, rehearsal tools, business tools, and founder-aware upgrade protection.</p>
              </div>
              <span className="rounded-full border border-amber-400/25 px-3 py-1 text-xs font-semibold text-amber-100">
                {status?.founderProtected ? formatPriceCents(status?.founderLockedPriceCents || 2995) : '$29.95/mo'}
              </span>
            </div>
            <button
              onClick={() => void onUpgrade('professional')}
              disabled={loading || !(status?.upgradeTargets.includes('professional') || status?.upgradeTargets.includes('founder_professional'))}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status?.founderProtected ? 'Continue with founder pricing' : 'Upgrade to Professional'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingSettings;
