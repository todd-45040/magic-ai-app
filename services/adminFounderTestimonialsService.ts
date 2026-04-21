import { adminJson } from './adminApi';

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

export async function fetchFounderTestimonials(params?: { limit?: number; published?: 'all' | 'true' | 'false' }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.published && params.published !== 'all') qs.set('published', params.published);

  const j = await adminJson<any>(`/api/adminFounderTestimonials?${qs.toString()}`, {}, 'Failed to load founder testimonials');
  return (j.testimonials || []) as FounderTestimonial[];
}

export async function createFounderTestimonial(input: Partial<FounderTestimonial>) {
  const j = await adminJson<any>('/api/adminFounderTestimonials', { method: 'POST', body: JSON.stringify(input) }, 'Failed to create founder testimonial');
  return String(j.id || '');
}

export async function updateFounderTestimonial(id: string, patch: Partial<FounderTestimonial>) {
  await adminJson('/api/adminFounderTestimonials', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) }, 'Failed to update founder testimonial');
}

export async function deleteFounderTestimonial(id: string) {
  const qs = new URLSearchParams({ id });
  await adminJson(`/api/adminFounderTestimonials?${qs.toString()}`, { method: 'DELETE' }, 'Failed to delete founder testimonial');
}
