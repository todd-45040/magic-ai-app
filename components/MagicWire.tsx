import React, { useEffect, useMemo, useState } from "react";

/**
 * MagicWire.tsx (clean rebuild)
 * - Restores card/box grid layout
 * - Removes repetitive "Magic News" and "Google News" labels
 * - Shows per-story publisher domain + relative time
 * - Works with BOTH API shapes:
 *    - v1: WireItem[]
 *    - v2: { meta, items: WireItem[] }
 */

type WireItem = {
  category?: string;
  headline: string;
  summary?: string;
  body?: string;
  source?: string;
  sourceUrl?: string | null;
  publishedAt?: string;
};

function domainFromUrl(url: string | null | undefined) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";

  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day >= 7) return d.toLocaleDateString();
  if (day >= 1) return `${day}d ago`;
  if (hr >= 1) return `${hr}h ago`;
  if (min >= 1) return `${min}m ago`;
  return "Just now";
}

function cleanSummary(text?: string, maxLen = 180) {
  const t = (text || "").trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen - 1) + "…" : t;
}

function getItemsFromApiPayload(payload: any): WireItem[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

export default function MagicWire() {
  const [items, setItems] = useState<WireItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const count = 9;

  async function load(refresh = false) {
    setLoading(true);
    setError("");

    try {
      const url = refresh
        ? `/api/magicWire?count=${count}&refresh=1`
        : `/api/magicWire?count=${count}`;

      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();

      // Some failures return text/plain; keep UI stable.
      let payload: any = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }

      const next = getItemsFromApiPayload(payload);

      setItems(next);
      if (!res.ok) {
        setError(`Feed error (${res.status}).`);
      } else if (next.length === 0) {
        setError("No stories returned yet. Try Refresh.");
      }
    } catch (e: any) {
      setError("Unable to load Magic Wire. Please try again.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = useMemo(() => {
    return items.map((it, idx) => {
      const publisher =
        domainFromUrl(it.sourceUrl) ||
        (it.source ? it.source : "");

      const when = timeAgo(it.publishedAt);

      return {
        key: `${idx}-${it.headline}`,
        headline: it.headline,
        summary: cleanSummary(it.summary || it.body),
        publisher,
        when,
        url: it.sourceUrl || null,
      };
    });
  }, [items]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Magic Wire</h1>
          <p className="text-slate-300/90">
            Curated magic news, reviews, and community updates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => load(true)}
          className="px-4 py-2 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20 text-white flex items-center gap-2"
        >
          <span aria-hidden="true">🛠️</span>
          Refresh Feed
        </button>
      </div>

      {/* Error (non-blocking) */}
      {error ? (
        <div className="mb-4 text-sm text-slate-300/90">
          {error}
        </div>
      ) : null}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Skeletons */}
        {loading &&
          Array.from({ length: 9 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="rounded-xl bg-slate-900/35 border border-slate-800 p-4 h-[180px] animate-pulse"
            />
          ))}

        {!loading &&
          cards.map((c) => (
            <div
              key={c.key}
              className="rounded-xl bg-slate-900/40 border border-slate-800 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20 p-4 flex flex-col justify-between gap-4"
            >
              <div>
                {/* Top: publisher/domain (replaces repeated "Magic News") */}
                <div className="text-xs text-slate-300/80 tracking-wide">
                  {c.publisher || "—"}
                </div>

                <h3 className="mt-2 font-bold text-lg text-yellow-300">
                  {c.headline}
                </h3>

                {c.summary ? (
                  <p className="mt-2 text-sm text-slate-300/80 leading-relaxed line-clamp-3">
                    {c.summary}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-300/60">
                    Read more…
                  </p>
                )}
              </div>

              {/* Bottom: time + link (replaces repeated "Google News") */}
              <div className="text-xs text-slate-300/70 flex items-center justify-between gap-3">
                <span>{c.when}</span>

                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-white"
                  >
                    Read original ↗
                  </a>
                ) : (
                  <span />
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
