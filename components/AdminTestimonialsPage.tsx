import React, { useEffect, useMemo, useState } from 'react';
import {
  createFounderTestimonial,
  deleteFounderTestimonial,
  fetchFounderTestimonials,
  updateFounderTestimonial,
  type FounderTestimonial,
} from '../services/adminFounderTestimonialsService';

function fmt(ts: string | null | undefined) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function AdminTestimonialsPage() {
  const [rows, setRows] = useState<FounderTestimonial[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedFilter, setPublishedFilter] = useState<'all' | 'true' | 'false'>('all');

  // Create form
  const [founderName, setFounderName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [headline, setHeadline] = useState('');
  const [quote, setQuote] = useState('');
  const [publishNow, setPublishNow] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFounderTestimonials({ limit: 200, published: publishedFilter });
      setRows(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load testimonials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishedFilter]);

  const featuredHint = useMemo(() => {
    const published = rows.filter((r) => r.is_published);
    const top = published[0];
    if (!top) return 'No published testimonials yet. Day 7 Spotlight will auto-skip until you publish one.';
    return `Current spotlight pick: ${top.founder_name || 'Founding Member'} — ${top.headline || 'No headline'} (featured_at: ${fmt(
      top.featured_at
    )})`;
  }, [rows]);

  const onCreate = async () => {
    setError(null);
    const q = quote.trim();
    if (!q) {
      setError('Quote is required.');
      return;
    }
    try {
      await createFounderTestimonial({
        founder_name: founderName.trim() || null,
        use_case: useCase.trim() || null,
        headline: headline.trim() || null,
        quote: q,
        is_published: publishNow,
        featured_at: publishNow ? new Date().toISOString() : null,
      } as any);
      setFounderName('');
      setUseCase('');
      setHeadline('');
      setQuote('');
      setPublishNow(true);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to create testimonial');
    }
  };

  const setPublished = async (id: string, is_published: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await updateFounderTestimonial(id, {
        is_published,
        featured_at: is_published ? new Date().toISOString() : null,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to update testimonial');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this testimonial?')) return;
    setBusyId(id);
    setError(null);
    try {
      await deleteFounderTestimonial(id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete testimonial');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Founder Testimonials</div>
          <div className="text-sm opacity-75">
            Create and publish testimonials for the Day 7 Founder Spotlight email (auto-pulled from the latest published record).
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={publishedFilter}
            onChange={(e) => setPublishedFilter(e.target.value as any)}
            className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white/90"
          >
            <option value="all">All</option>
            <option value="true">Published</option>
            <option value="false">Unpublished</option>
          </select>
          <button
            type="button"
            onClick={() => load()}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-3 p-3 rounded-xl border border-amber-300/15 bg-amber-500/5 text-amber-100/90 text-sm">
        {featuredHint}
      </div>

      {error && <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-100">{error}</div>}

      {/* Create */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold">Add Testimonial</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs opacity-70 mb-1">Founder name</div>
            <input
              value={founderName}
              onChange={(e) => setFounderName(e.target.value)}
              placeholder="e.g., Alex R."
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white/90"
            />
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Use case</div>
            <input
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              placeholder="e.g., Corporate close-up"
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white/90"
            />
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Headline</div>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder='e.g., “Director in my pocket.”'
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white/90"
            />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-xs opacity-70 mb-1">Quote (required)</div>
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={4}
            placeholder="Paste the Founder quote here…"
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white/90"
          />
        </div>

        <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
            Publish immediately (will be eligible for Day 7 Spotlight)
          </label>

          <button
            type="button"
            onClick={onCreate}
            className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/25 text-emerald-100 hover:bg-emerald-500/25 transition"
          >
            Add Testimonial
          </button>
        </div>
      </div>

      {/* List */}
      <div className="mt-4 rounded-xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-white/5 text-xs uppercase tracking-wide text-white/60">
          <div className="col-span-3">Founder</div>
          <div className="col-span-5">Quote</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Actions</div>
        </div>

        {loading ? (
          <div className="p-4 text-white/70">Loading testimonials…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-white/60">No testimonials found.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3">
                <div className="col-span-3">
                  <div className="text-white/90 font-medium">{r.founder_name || 'Founding Member'}</div>
                  <div className="text-xs text-white/60">{r.use_case || '—'}</div>
                  <div className="text-xs text-white/50 mt-1">Created: {fmt(r.created_at)}</div>
                </div>
                <div className="col-span-5">
                  {r.headline && <div className="text-sm font-semibold text-amber-200">{r.headline}</div>}
                  <div className="text-sm text-white/80 mt-1 line-clamp-4">{r.quote}</div>
                </div>
                <div className="col-span-2">
                  <div
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs border ${
                      r.is_published
                        ? 'bg-emerald-500/15 border-emerald-400/25 text-emerald-100'
                        : 'bg-white/10 border-white/15 text-white/70'
                    }`}
                  >
                    {r.is_published ? 'Published' : 'Draft'}
                  </div>
                  <div className="text-xs text-white/50 mt-2">Featured: {fmt(r.featured_at)}</div>
                </div>
                <div className="col-span-2 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => setPublished(r.id, !r.is_published)}
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 transition disabled:opacity-60"
                  >
                    {r.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => onDelete(r.id)}
                    className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-400/20 text-red-100 hover:bg-red-500/15 transition disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
