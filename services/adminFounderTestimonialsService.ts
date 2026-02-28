import { supabase } from '../supabase';

export type FounderTestimonial = {
  id: string;
  created_at: string;
  updated_at: string;
  founder_name: string | null;
  founder_title: string | null;
  use_case: string | null;
  headline: string | null;
  quote: string;
  meta: any | null;
  is_published: boolean;
  featured_at: string | null;
};

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchFounderTestimonials(params?: { limit?: number; published?: 'all' | 'true' | 'false' }) {
  const headers = await authHeaders();
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.published && params.published !== 'all') qs.set('published', params.published);

  const r = await fetch(`/api/adminFounderTestimonials?${qs.toString()}`, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || `Request failed (${r.status})`);
  return (j.testimonials || []) as FounderTestimonial[];
}

export async function createFounderTestimonial(input: Partial<FounderTestimonial>) {
  const headers = await authHeaders();
  const r = await fetch('/api/adminFounderTestimonials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || `Request failed (${r.status})`);
  return String(j.id || '');
}

export async function updateFounderTestimonial(id: string, patch: Partial<FounderTestimonial>) {
  const headers = await authHeaders();
  const r = await fetch('/api/adminFounderTestimonials', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ id, ...patch }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || `Request failed (${r.status})`);
}

export async function deleteFounderTestimonial(id: string) {
  const headers = await authHeaders();
  const qs = new URLSearchParams({ id });
  const r = await fetch(`/api/adminFounderTestimonials?${qs.toString()}`, { method: 'DELETE', headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || `Request failed (${r.status})`);
}
