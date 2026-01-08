import React, { useEffect, useMemo, useState } from "react";

type WireItem = {
  category?: string;
  headline: string;
  summary?: string;
  body?: string;
  source?: string;
  sourceUrl?: string | null;
  publishedAt?: string;
};

/* ---------- helpers ---------- */

function domainFromUrl(url?: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Prefer a real publisher label over "news.google.com"
 */
function publisherFromItem(it: WireItem) {
  const host = domainFromUrl(it.sourceUrl);
  if (host && host !== "news.google.com") return host;

  const h = it.headline || "";
  const parts = h.split(" - ");
  if (parts.length > 1) return parts[parts.length - 1].trim();

  return it.source || host || "Source";
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";

  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day >= 7) return d.toLocaleDateString();
  if (day >= 1) return `${day}d ago`;
  if (hr >= 1) return `${hr}h ago`;
  if (min >= 1) return `${min}m ago`;
  return "Just now";
}

function normalizePayload(payload: any): WireItem[] {
  if (Array.isArray(payload)) return payload;
  if (payload?.items && Array.isArray(payload.items)) return payload.items;
  return [];
}

/* ---------- component ---------- */

export default function MagicWire() {
  const [items, setItems] = useState<WireItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(refresh = false) {
    setLoading(true);
    const url = refresh
      ? "/api/magicWire?count=9&refresh=1"
      : "/api/magicWire?count=9";

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    setItems(normalizePayload(json));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const cards = useMemo(
    () =>
      items.map((it, idx) => ({
        key: `${idx}-${it.headline}`,
        headline: it.headline,
        summary: it.summary || it.body || "",
        publisher: publisherFromItem(it),
        when: timeAgo(it.publishedAt),
        url: it.sourceUrl,
      })),
    [items]
  );

  const openOriginal = (url?: string | null) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Magic Wire</h1>
          <p className="text-slate-300/90">
            Curated magic news, reviews, and community updates.
          </p>
        </div>

        <button
          onClick={() => load(true)}
          className="px-4 py-2 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20 text-white"
        >
          🛠 Refresh Feed
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[180px] rounded-xl bg-slate-900/35 border border-slate-800 animate-pulse"
            />
          ))}

        {!loading &&
          cards.map((c) => (
            <div
              key={c.key}
              role={c.url ? "link" : undefined}
              tabIndex={c.url ? 0 : -1}
              onClick={() => openOriginal(c.url)}
              onKeyDown={(e) => {
                if (!c.url) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openOriginal(c.url);
                }
              }}
              className="cursor-pointer rounded-xl bg-slate-900/40 border border-slate-800 hover:bg-slate-900/50 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20 p-4 flex flex-col justify-between transition-colors transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
              title={c.url ? "Open original article" : undefined}
            >
              <div>
                {/* Publisher (improved styling) */}
                <div className="text-[11px] uppercase tracking-wider text-slate-400/70">
                  {c.publisher}
                </div>

                {/* Headline */}
                <h3 className="mt-2 font-bold text-lg text-amber-400 line-clamp-2">
                  {c.headline}
                </h3>

                {/* Summary */}
                <p className="mt-2 text-sm text-slate-300/80 line-clamp-3">
                  {c.summary}
                </p>
              </div>

              {/* Footer */}
              <div className="mt-3 text-xs text-slate-300/70 flex justify-between items-center">
                <span>{c.when}</span>

                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 underline opacity-80 hover:opacity-100 hover:text-white transition-colors"
                  >
                    Read original
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
