import type { Membership } from '../types';
import { supabase } from '../supabase';

export type UsageStatus = {
  ok: boolean;
  membership?: Membership;
  used?: number;
  limit?: number;
  remaining?: number;
  burstLimit?: number;
  burstRemaining?: number;
  liveUsed?: number;
  liveLimit?: number;
  liveRemaining?: number;
};

export async function getBearerToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? `Bearer ${token}` : 'Bearer guest';
  } catch {
    return 'Bearer guest';
  }
}

export async function fetchUsageStatus(): Promise<UsageStatus> {
  const res = await fetch('/api/ai/usage', {
    method: 'GET',
    headers: {
      'Authorization': await getBearerToken(),
    },
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }

  // Standardized contract: server returns either { ok:true, ... } or { ok:false, error_code, ... }
  if (!res.ok) return { ok: false };
  return (json as UsageStatus) || { ok: false };
}
