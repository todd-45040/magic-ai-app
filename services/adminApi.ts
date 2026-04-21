import { supabase } from '../supabase';

export async function getAdminAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

export async function getAdminHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getAdminAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

export async function adminJson<T = any>(input: string, init: RequestInit = {}, fallbackError = 'Admin request failed'): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const hasBody = init.body != null;
  const headers = await getAdminHeaders(hasBody || method !== 'GET' ? { 'Content-Type': 'application/json' } : {});

  const response = await fetch(input, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const text = await response.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;

  if (!response.ok) {
    throw new Error((json && (json.error || json.message)) || text || `${fallbackError} (${response.status})`);
  }

  return (json ?? ({} as T)) as T;
}
