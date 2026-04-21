import { requireAdmin } from './_auth.js';

const ALLOWED_WINDOWS = [1, 7, 30, 90] as const;
type AllowedWindowDays = typeof ALLOWED_WINDOWS[number];
const ALLOWED_SOURCES = ['ibm', 'sam', 'all'] as const;
type AllowedSource = typeof ALLOWED_SOURCES[number];

function asDays(raw: any, fallback: AllowedWindowDays = 7): AllowedWindowDays {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.round(n);
  return (ALLOWED_WINDOWS as readonly number[]).includes(v) ? (v as AllowedWindowDays) : fallback;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function asSource(raw: any, fallback: AllowedSource = 'ibm'): AllowedSource {
  const s = String(raw || '').trim().toLowerCase();
  return (ALLOWED_SOURCES as readonly string[]).includes(s) ? (s as AllowedSource) : fallback;
}

function campaignLabel(source: AllowedSource): string {
  if (source === 'sam') return 'SAM';
  if (source === 'all') return 'All Partners';
  return 'IBM';
}

function sourceList(source: AllowedSource): string[] {
  if (source === 'all') return ['ibm', 'sam'];
  return [source];
}

function isPaidMembership(raw: any): boolean {
  const v = String(raw || '').trim().toLowerCase();
  return v === 'amateur' || v === 'professional';
}

function normalizeTool(raw: any): string {
  const s = String(raw || '').trim();
  if (!s) return 'unknown';
  const lower = s.toLowerCase();
  if (lower === 'angle-risk' || lower === 'angle_risk') return 'angle_risk';
  if (lower === 'identifytrick' || lower === 'identify_trick') return 'identify_trick';
  if (lower === "assistant's studio" || lower === 'assistant_studio') return 'assistant_studio';
  return lower;
}


async function fetchAllAnalyticsEvents(admin: any, sources: string[], sinceIso: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let start = 0; start < 10000; start += pageSize) {
    const end = start + pageSize - 1;
    let query = admin
      .from('analytics_events')
      .select('user_id,event_name,event_payload,partner_source,created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(start, end);

    if (sources.length === 1) {
      query = query.eq('partner_source', sources[0]);
    } else {
      query = query.in('partner_source', sources);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) rows.push(...data);
    if (!data || data.length < pageSize) break;
  }
  return rows;
}


function pctOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function buildFunnel(signupsWindow: number, activatedWindow: number, firstIdeaSavedEvents: number, upgradePromptViewed: number, upgradeClicked: number, checkoutStarted: number, checkoutCompleted: number) {
  const stages = [
    { key: 'signups', label: 'Signups', count: signupsWindow },
    { key: 'activated', label: 'Activated', count: activatedWindow },
    { key: 'idea_saved', label: 'First Idea Saved', count: firstIdeaSavedEvents },
    { key: 'prompt_viewed', label: 'Upgrade Prompt Viewed', count: upgradePromptViewed },
    { key: 'upgrade_clicked', label: 'Upgrade Clicked', count: upgradeClicked },
    { key: 'checkout_started', label: 'Checkout Started', count: checkoutStarted },
    { key: 'checkout_completed', label: 'Checkout Completed', count: checkoutCompleted },
  ];

  return stages.map((stage, index) => {
    const prev = index > 0 ? stages[index - 1] : null;
    return {
      ...stage,
      conversion_from_previous: prev ? pctOrNull(stage.count, prev.count) : null,
      conversion_from_start: pctOrNull(stage.count, stages[0].count),
      dropoff_count_from_previous: prev ? Math.max(prev.count - stage.count, 0) : 0,
      dropoff_rate_from_previous: prev ? pctOrNull(Math.max(prev.count - stage.count, 0), prev.count) : null,
    };
  });
}

function buildActivationMetrics(rows: any[]) {
  const viewed = new Set<string>();
  const started = new Set<string>();
  const generated = new Set<string>();
  const saved = new Set<string>();
  const completed = new Set<string>();

  for (const row of rows || []) {
    const userId = String(row?.user_id || '').trim();
    if (!userId) continue;
    const eventName = String(row?.event_name || '').trim().toLowerCase();
    if (eventName === 'activation_viewed') viewed.add(userId);
    if (eventName === 'activation_started') started.add(userId);
    if (eventName === 'activation_generate_clicked') generated.add(userId);
    if (eventName === 'first_idea_saved') saved.add(userId);
    if (eventName === 'activation_completed') completed.add(userId);
  }

  return {
    counts: {
      viewed: viewed.size,
      started: started.size,
      generated: generated.size,
      saved: saved.size,
      completed: completed.size,
    },
    total_activations: saved.size,
    activation_rate: viewed.size > 0 ? saved.size / viewed.size : null,
  };
}

async function fetchAllUserActivity(admin: any, partnerIds: string[], sinceIso: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let start = 0; start < 10000; start += pageSize) {
    const end = start + pageSize - 1;
    const { data, error } = await admin
      .from('user_activity_log')
      .select('user_id,event_type,tool_name,created_at,metadata,success')
      .in('user_id', partnerIds)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(start, end);
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) rows.push(...data);
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin } = auth as any;

    const days = asDays(req?.query?.days, 7);
    const source = asSource(req?.query?.source, 'ibm');
    const sinceIso = isoDaysAgo(days);
    const now = Date.now();

    const sources = sourceList(source);
    const { data: partnerUsers, error: userErr } = await admin
      .from('users')
      .select('id,email,membership,trial_end_date,created_at,signup_source')
      .in('signup_source', sources)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (userErr) return res.status(500).json({ ok: false, error: `Failed to load ${campaignLabel(source)} users`, details: userErr });

    const users = Array.isArray(partnerUsers) ? partnerUsers : [];
    const partnerIds = users.map((u: any) => u.id).filter(Boolean);

    const signupsTotal = users.length;
    const signupsWindow = users.filter((u: any) => {
      const created = Date.parse(String(u?.created_at || ''));
      return Number.isFinite(created) && created >= Date.parse(sinceIso);
    }).length;

    const conversionsTotal = users.filter((u: any) => isPaidMembership(u?.membership)).length;
    const activeTrialCurrent = users.filter((u: any) => {
      const t = Number(u?.trial_end_date || 0);
      return Number.isFinite(t) && t > now && !isPaidMembership(u?.membership);
    }).length;
    const expiredUsersCurrent = users.filter((u: any) => {
      const t = Number(u?.trial_end_date || 0);
      return Number.isFinite(t) && t > 0 && t <= now && !isPaidMembership(u?.membership);
    }).length;

    let activity: any[] = [];
    if (partnerIds.length > 0) {
      activity = await fetchAllUserActivity(admin, partnerIds, sinceIso);
    }

    let activationAnalytics: any[] = [];
    try {
      activationAnalytics = await fetchAllAnalyticsEvents(admin, sources, sinceIso);
    } catch (analyticsErr) {
      console.error('adminIbmFunnel analytics_events load failed', analyticsErr);
      activationAnalytics = [];
    }

    const activationMetrics = buildActivationMetrics(activationAnalytics);

    const activatedWindowUsers = new Set<string>();
    const activatedTotalUsers = new Set<string>();
    const toolEventUsers = new Map<string, Set<string>>();
    const toolEventCounts = new Map<string, number>();
    let signupEvents = 0;
    let loginEvents = 0;
    let firstLoginEvents = 0;
    let firstToolUsedEvents = 0;
    let firstIdeaSavedEvents = 0;
    let upgradePromptViewed = 0;
    let upgradeClicked = 0;
    let checkoutStarted = 0;
    let checkoutCompleted = 0;
    let trialExpiredEvents = 0;
    let errorEvents = 0;
    const errorKinds = new Map<string, number>();

    for (const row of activity) {
      const eventType = String(row?.event_type || '').trim().toLowerCase();
      const uid = String(row?.user_id || '');
      if (!uid) continue;

      if (eventType === 'signup') signupEvents += 1;
      if (eventType === 'login') loginEvents += 1;
      if (eventType === 'first_login') firstLoginEvents += 1;
      if (eventType === 'first_tool_used') {
        activatedWindowUsers.add(uid);
        firstToolUsedEvents += 1;
      }
      if (eventType === 'first_idea_saved') firstIdeaSavedEvents += 1;
      if (eventType === 'upgrade_prompt_viewed') upgradePromptViewed += 1;
      if (eventType === 'upgrade_clicked') upgradeClicked += 1;
      if (eventType === 'checkout_started') checkoutStarted += 1;
      if (eventType === 'checkout_completed') checkoutCompleted += 1;
      if (eventType === 'trial_expired') trialExpiredEvents += 1;
      if (eventType === 'error') {
        errorEvents += 1;
        const kind = String(row?.metadata?.error_kind || 'unknown');
        errorKinds.set(kind, (errorKinds.get(kind) || 0) + 1);
      }

      if (eventType === 'tool_used' || eventType === 'first_tool_use' || eventType === 'first_tool_used') {
        const tool = normalizeTool(row?.tool_name);
        if (!toolEventUsers.has(tool)) toolEventUsers.set(tool, new Set());
        toolEventUsers.get(tool)!.add(uid);
        toolEventCounts.set(tool, (toolEventCounts.get(tool) || 0) + 1);
      }
    }

    // total activated users across all time: prefer event log if present, otherwise current paid/trial-active users with activity unavailable won't count.
    if (partnerIds.length > 0) {
      const { data: allTimeFirstTool, error: ftErr } = await admin
        .from('user_activity_log')
        .select('user_id')
        .in('user_id', partnerIds)
        .in('event_type', ['first_tool_use', 'first_tool_used'])
        .limit(5000);
      if (ftErr) {
        console.warn('adminIbmFunnel first tool query failed', ftErr);
      } else {
        for (const row of allTimeFirstTool || []) {
          if (row?.user_id) activatedTotalUsers.add(String(row.user_id));
        }
      }
    }

    const mostUsedTools = Array.from(toolEventCounts.entries())
      .map(([tool, events]) => ({
        tool,
        events,
        users: toolEventUsers.get(tool)?.size || 0,
      }))
      .sort((a, b) => (b.events - a.events) || (b.users - a.users) || a.tool.localeCompare(b.tool))
      .slice(0, 8);

    const topErrorKinds = Array.from(errorKinds.entries()).map(([error_kind, events]) => ({ error_kind, events })).sort((a,b)=>b.events-a.events).slice(0,5);

    const rates = {
      signup_to_activation: signupsTotal > 0 ? activatedTotalUsers.size / signupsTotal : null,
      window_signup_to_activation: signupsWindow > 0 ? activatedWindowUsers.size / signupsWindow : null,
      activation_to_first_idea_saved: activatedWindowUsers.size > 0 ? firstIdeaSavedEvents / activatedWindowUsers.size : null,
      trial_to_paid: activeTrialCurrent > 0 ? conversionsTotal / activeTrialCurrent : null,
      prompt_to_click: upgradePromptViewed > 0 ? upgradeClicked / upgradePromptViewed : null,
      click_to_checkout: upgradeClicked > 0 ? checkoutStarted / upgradeClicked : null,
      checkout_to_paid: checkoutStarted > 0 ? checkoutCompleted / checkoutStarted : null,
      signup_to_checkout_started: signupsWindow > 0 ? checkoutStarted / signupsWindow : null,
      signup_to_checkout_completed: signupsWindow > 0 ? checkoutCompleted / signupsWindow : null,
    };

    const funnel = buildFunnel(
      signupsWindow,
      activatedWindowUsers.size,
      firstIdeaSavedEvents,
      upgradePromptViewed,
      upgradeClicked,
      checkoutStarted,
      checkoutCompleted,
    );

    let ibmActivationAnalytics: any[] = [];
    let samActivationAnalytics: any[] = [];
    try {
      [ibmActivationAnalytics, samActivationAnalytics] = await Promise.all([
        fetchAllAnalyticsEvents(admin, ['ibm'], sinceIso),
        fetchAllAnalyticsEvents(admin, ['sam'], sinceIso),
      ]);
    } catch (partnerActivationErr) {
      console.error('adminIbmFunnel partner activation load failed', partnerActivationErr);
      ibmActivationAnalytics = [];
      samActivationAnalytics = [];
    }

    const activationPartnerView = {
      ibm: buildActivationMetrics(ibmActivationAnalytics),
      sam: buildActivationMetrics(samActivationAnalytics),
    };

    const recentConverted = users
      .filter((u: any) => isPaidMembership(u?.membership))
      .map((u: any) => ({
        email: u?.email || '—',
        membership: String(u?.membership || ''),
        created_at: u?.created_at || null,
      }))
      .slice(0, 5);

    return res.status(200).json({
      ok: true,
      campaign: { source, label: campaignLabel(source), options: ALLOWED_SOURCES },
      window: { days, sinceIso, optionsDays: ALLOWED_WINDOWS },
      summary: {
        signups_window: signupsWindow,
        signups_total: signupsTotal,
        activated_users_window: activatedWindowUsers.size,
        activated_users_total: activatedTotalUsers.size,
        expired_users_current: expiredUsersCurrent,
        conversions_total: conversionsTotal,
        conversion_rate_total: signupsTotal > 0 ? conversionsTotal / signupsTotal : null,
        active_trial_current: activeTrialCurrent,
      },
      activation_metrics: activationMetrics,
      partner_activation_view: activationPartnerView,
      events: {
        signup: signupEvents,
        login: loginEvents,
        first_login: firstLoginEvents,
        first_tool_use: firstToolUsedEvents,
        first_tool_used: firstToolUsedEvents,
        first_idea_saved: firstIdeaSavedEvents,
        upgrade_prompt_viewed: upgradePromptViewed,
        upgrade_clicked: upgradeClicked,
        checkout_started: checkoutStarted,
        checkout_completed: checkoutCompleted,
        trial_expired: trialExpiredEvents,
        error: errorEvents,
      },
      rates,
      funnel,
      most_used_tools: mostUsedTools,
      top_error_kinds: topErrorKinds,
      recent_converted: recentConverted,
    });
  } catch (e: any) {
    console.error('adminIbmFunnel error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}
