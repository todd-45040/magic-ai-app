import { supabase } from '../supabase';

export type UserActivityEventType =
  | 'signup'
  | 'login'
  | 'first_login'
  | 'tool_used'
  | 'first_tool_used'
  | 'idea_saved'
  | 'first_idea_saved'
  | 'upgrade_prompt_viewed'
  | 'upgrade_clicked'
  | 'checkout_started'
  | 'checkout_completed'
  | 'trial_expired'
  | 'error';

async function getDefaultActivityMetadata(): Promise<Record<string, any>> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    const user = session?.user as any;
    const source = String(user?.user_metadata?.signup_source || '').trim().toLowerCase();
    const requestedTrialDaysRaw = Number(user?.user_metadata?.requested_trial_days);
    const requestedTrialDays = Number.isFinite(requestedTrialDaysRaw) && requestedTrialDaysRaw > 0 ? requestedTrialDaysRaw : null;
    const ibmRing = String(user?.user_metadata?.ibm_ring || '').trim();
    const samAssembly = String(user?.user_metadata?.sam_assembly || '').trim();

    const meta: Record<string, any> = {};
    if (source) meta.source = source;
    if (source === 'ibm') meta.campaign = 'ibm-30day';
    if (source === 'sam') meta.campaign = 'sam_30day';
    if (requestedTrialDays) meta.requested_trial_days = requestedTrialDays;
    if (ibmRing) meta.ibm_ring = ibmRing;
    if (samAssembly) meta.sam_assembly = samAssembly;
    return meta;
  } catch {
    return {};
  }
}

export async function logUserActivity(input: {
  tool_name: string;
  event_type: UserActivityEventType;
  success?: boolean;
  duration_ms?: number | null;
  metadata?: Record<string, any> | null;
}): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const defaultMetadata = await getDefaultActivityMetadata();
    await fetch('/api/user-activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : 'Bearer guest',
      },
      body: JSON.stringify({
        tool_name: input.tool_name,
        event_type: input.event_type,
        success: input.success ?? true,
        duration_ms: input.duration_ms ?? null,
        metadata: { ...defaultMetadata, ...(input.metadata ?? {}) },
      }),
    });
  } catch {
    // Never break UX for activity logging
  }
}
