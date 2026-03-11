import React, { useEffect, useMemo, useState } from "react";
import { trackClientEvent } from "../services/telemetryClient";
import {
  getPosts,
  getSavedPosts,
  isPostSaved,
  removeSavedPost,
  savePost,
  type MagicWireItem,
  type MagicWireSavedPost,
} from "../services/magicWireService";

type WireCard = {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl?: string | null;
  publishedAt?: string;
  when: string;
  category: string;
  type: string;
  tags: string[];
};

function domainFromUrl(url?: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function publisherFromItem(it: MagicWireItem) {
  const host = domainFromUrl(it.sourceUrl);
  if (host && host !== "news.google.com") return host;

  const h = it.headline || it.title || "";
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

function titleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferCategory(item: MagicWireItem): string {
  const raw = (item.category || item.type || "").toLowerCase();
  const text = `${item.headline || ""} ${item.title || ""} ${item.summary || ""} ${item.body || ""}`.toLowerCase();

  if (raw.includes("video") || text.includes("youtube") || text.includes("video")) return "Videos";
  if (raw.includes("tip") || text.includes("tip") || text.includes("advice") || text.includes("lesson")) return "Performance Tips";
  if (raw.includes("community") || text.includes("community") || text.includes("forum") || text.includes("club")) return "Community";
  if (raw.includes("announcement") || text.includes("launch") || text.includes("announcement") || text.includes("update")) return "Platform Updates";
  if (raw.includes("trick") || text.includes("trick") || text.includes("effect") || text.includes("routine")) return "New Tricks";
  return "Industry News";
}

function inferType(item: MagicWireItem): string {
  const raw = (item.type || item.category || "").toLowerCase();
  const text = `${item.headline || ""} ${item.title || ""} ${item.summary || ""}`.toLowerCase();

  if (raw.includes("video") || text.includes("youtube") || text.includes("video")) return "video";
  if (raw.includes("announcement") || text.includes("announcement") || text.includes("launch")) return "announcement";
  if (raw.includes("community") || text.includes("community") || text.includes("forum")) return "community";
  if (raw.includes("tip") || text.includes("tip") || text.includes("advice")) return "tip";
  if (raw.includes("article")) return "article";
  return "news";
}

function inferTags(item: MagicWireItem, category: string, source: string, type: string): string[] {
  const tags = new Set<string>();

  if (category) tags.add(category);
  if (source) tags.add(source);
  if (type) tags.add(titleCase(type));

  const text = `${item.headline || ""} ${item.title || ""} ${item.summary || ""} ${item.body || ""}`.toLowerCase();

  if (text.includes("review")) tags.add("Review");
  if (text.includes("convention")) tags.add("Convention");
  if (text.includes("lecture")) tags.add("Lecture");
  if (text.includes("release")) tags.add("Release");
  if (text.includes("creator")) tags.add("Creator");
  if (text.includes("mentalism")) tags.add("Mentalism");
  if (text.includes("close-up")) tags.add("Close-Up");
  if (text.includes("stage")) tags.add("Stage");
  if (text.includes("card")) tags.add("Card Magic");

  return Array.from(tags).slice(0, 4);
}

function buildCard(item: MagicWireItem, idx: number): WireCard {
  const source = publisherFromItem(item);
  const category = inferCategory(item);
  const type = inferType(item);
  const title = item.headline || item.title || "Untitled";
  const summary = item.summary || item.body || "No summary available.";
  const id =
    item.id ||
    `${idx}-${title}-${item.publishedAt || ""}-${item.sourceUrl || ""}`
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, 140);

  return {
    id,
    title,
    summary,
    source,
    sourceUrl: item.sourceUrl,
    publishedAt: item.publishedAt,
    when: timeAgo(item.publishedAt),
    category,
    type,
    tags: inferTags(item, category, source, type),
  };
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

export default function MagicWire() {
  const [items, setItems] = useState<MagicWireItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedPosts, setSavedPosts] = useState<MagicWireSavedPost[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<"all" | "7d" | "30d">("all");
  const [savedOnly, setSavedOnly] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState({
    categories: true,
    sources: true,
    dateRange: true,
    saved: true,
  });

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState("");

  async function load(refresh = false) {
    try {
      setLoading(true);
      setError("");
      const data = await getPosts({ count: 12, refresh });
      setItems(data);

      if (refresh) {
        void trackClientEvent({
          tool: "magic_wire",
          action: "magic_wire_click",
          outcome: "SUCCESS_NOT_CHARGED",
          metadata: {
            target: "refresh_feed",
            count: data.length,
          },
        });
      }
    } catch (err: any) {
      console.error("Magic Wire load error:", err);
      setError("Magic Wire could not load right now.");
      setItems([]);

      if (refresh) {
        void trackClientEvent({
          tool: "magic_wire",
          action: "magic_wire_click",
          outcome: "ERROR_UPSTREAM",
          metadata: {
            target: "refresh_feed",
            message: err?.message || "unknown error",
          },
          error_code: "MAGIC_WIRE_REFRESH_ERROR",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    setSavedPosts(getSavedPosts());
  }, []);

  useEffect(() => {
    if (!actionNotice) return;
    const t = window.setTimeout(() => setActionNotice(""), 2200);
    return () => window.clearTimeout(t);
  }, [actionNotice]);

  const cards = useMemo(() => items.map(buildCard), [items]);

  const categories = useMemo(
    () => Array.from(new Set(cards.map((c) => c.category))).sort(),
    [cards]
  );

  const sources = useMemo(
    () => Array.from(new Set(cards.map((c) => c.source))).sort(),
    [cards]
  );

  const savedIds = useMemo(() => new Set(savedPosts.map((p) => p.id)), [savedPosts]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const categoryMatch =
        selectedCategories.length === 0 || selectedCategories.includes(card.category);

      const sourceMatch =
        selectedSources.length === 0 || selectedSources.includes(card.source);

      const savedMatch = !savedOnly || savedIds.has(card.id);

      let dateMatch = true;
      if (dateRange !== "all" && card.publishedAt) {
        const published = new Date(card.publishedAt).getTime();
        if (!Number.isNaN(published)) {
          const now = Date.now();
          const days = dateRange === "7d" ? 7 : 30;
          dateMatch = now - published <= days * 24 * 60 * 60 * 1000;
        }
      }

      return categoryMatch && sourceMatch && savedMatch && dateMatch;
    });
  }, [cards, selectedCategories, selectedSources, savedOnly, savedIds, dateRange]);

  const postsToday = useMemo(() => {
    const now = Date.now();
    return cards.filter((card) => {
      if (!card.publishedAt) return false;
      const ts = new Date(card.publishedAt).getTime();
      if (Number.isNaN(ts)) return false;
      return now - ts <= 24 * 60 * 60 * 1000;
    }).length;
  }, [cards]);

  const trendingTopic = useMemo(() => {
    if (filteredCards.length === 0) return "No topic yet";

    const counts = filteredCards.reduce<Record<string, number>>((acc, card) => {
      acc[card.category] = (acc[card.category] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "No topic yet";
  }, [filteredCards]);

  const latestSource = useMemo(() => {
    if (filteredCards.length === 0) return "No source yet";

    const sorted = [...filteredCards].sort((a, b) => {
      const aTs = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTs = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bTs - aTs;
    });

    return sorted[0]?.source || "No source yet";
  }, [filteredCards]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const toggleSource = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const toggleSaved = (card: WireCard) => {
    const currentlySaved = isPostSaved(card.id);

    if (currentlySaved) {
      removeSavedPost(card.id);
      setSavedPosts(getSavedPosts());
      setActionNotice("Removed from saved posts.");

      void trackClientEvent({
        tool: "magic_wire",
        action: "magic_wire_save",
        outcome: "SUCCESS_NOT_CHARGED",
        metadata: {
          mode: "remove",
          post_id: card.id,
          title: card.title,
          category: card.category,
          source: card.source,
        },
      });
      return;
    }

    savePost({
      id: card.id,
      title: card.title,
      summary: card.summary,
      source: card.source,
      sourceUrl: card.sourceUrl,
      publishedAt: card.publishedAt,
      category: card.category,
      type: card.type,
      tags: card.tags,
    });

    setSavedPosts(getSavedPosts());
    setActionNotice("Saved to Magic Wire.");

    void trackClientEvent({
      tool: "magic_wire",
      action: "magic_wire_save",
      outcome: "SUCCESS_NOT_CHARGED",
      metadata: {
        mode: "save",
        post_id: card.id,
        title: card.title,
        category: card.category,
        source: card.source,
      },
    });
  };

  const openOriginal = (card: WireCard) => {
    if (!card.sourceUrl) return;

    void trackClientEvent({
      tool: "magic_wire",
      action: "magic_wire_open",
      outcome: "SUCCESS_NOT_CHARGED",
      metadata: {
        post_id: card.id,
        title: card.title,
        category: card.category,
        source: card.source,
        url: card.sourceUrl,
      },
    });

    window.open(card.sourceUrl, "_blank", "noopener,noreferrer");
  };

  const shareCard = async (card: WireCard) => {
    const shareUrl = card.sourceUrl || window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: card.title,
          text: card.summary,
          url: shareUrl,
        });

        void trackClientEvent({
          tool: "magic_wire",
          action: "magic_wire_click",
          outcome: "SUCCESS_NOT_CHARGED",
          metadata: {
            target: "share",
            method: "native",
            post_id: card.id,
            title: card.title,
            source: card.source,
          },
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setActionNotice("Article link copied to clipboard.");

        void trackClientEvent({
          tool: "magic_wire",
          action: "magic_wire_click",
          outcome: "SUCCESS_NOT_CHARGED",
          metadata: {
            target: "share",
            method: "clipboard",
            post_id: card.id,
            title: card.title,
            source: card.source,
          },
        });
      } else {
        setActionNotice("Sharing is not available in this browser.");

        void trackClientEvent({
          tool: "magic_wire",
          action: "magic_wire_click",
          outcome: "ERROR_UPSTREAM",
          metadata: {
            target: "share",
            method: "unsupported",
            post_id: card.id,
            title: card.title,
          },
          error_code: "MAGIC_WIRE_SHARE_UNSUPPORTED",
        });
      }
    } catch {
      setActionNotice("Share was cancelled.");

      void trackClientEvent({
        tool: "magic_wire",
        action: "magic_wire_click",
        outcome: "SUCCESS_NOT_CHARGED",
        metadata: {
          target: "share",
          method: "cancelled",
          post_id: card.id,
          title: card.title,
        },
      });
    }
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedSources([]);
    setDateRange("all");
    setSavedOnly(false);

    void trackClientEvent({
      tool: "magic_wire",
      action: "magic_wire_click",
      outcome: "SUCCESS_NOT_CHARGED",
      metadata: {
        target: "reset_filters",
      },
    });
  };

  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Magic Wire</h1>
          <p className="text-slate-300/90">
            Curated magic news, reviews, and community updates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {actionNotice ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {actionNotice}
            </div>
          ) : null}

          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20 text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Refreshing..." : "🛠 Refresh Feed"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Wire Filters
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Narrow the feed by category, source, date, or saved posts.
                </p>
              </div>
              <button
                onClick={clearFilters}
                className="text-xs text-purple-300 hover:text-white transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/35 overflow-hidden">
            <button
              onClick={() =>
                setFiltersOpen((prev) => ({ ...prev, categories: !prev.categories }))
              }
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <span className="font-semibold text-white">Categories</span>
              <span className="text-slate-400">{filtersOpen.categories ? "−" : "+"}</span>
            </button>

            {filtersOpen.categories && (
              <div className="px-4 pb-4 space-y-2">
                {categories.length === 0 ? (
                  <div className="text-sm text-slate-400">No categories yet.</div>
                ) : (
                  categories.map((category) => {
                    const active = selectedCategories.includes(category);
                    return (
                      <button
                        key={category}
                        onClick={() => toggleCategory(category)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                          active
                            ? "border-purple-500 bg-purple-500/10 text-white"
                            : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/35 overflow-hidden">
            <button
              onClick={() =>
                setFiltersOpen((prev) => ({ ...prev, sources: !prev.sources }))
              }
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <span className="font-semibold text-white">Sources</span>
              <span className="text-slate-400">{filtersOpen.sources ? "−" : "+"}</span>
            </button>

            {filtersOpen.sources && (
              <div className="px-4 pb-4 space-y-2">
                {sources.length === 0 ? (
                  <div className="text-sm text-slate-400">No sources yet.</div>
                ) : (
                  sources.map((source) => {
                    const active = selectedSources.includes(source);
                    return (
                      <button
                        key={source}
                        onClick={() => toggleSource(source)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                          active
                            ? "border-purple-500 bg-purple-500/10 text-white"
                            : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        {source}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/35 overflow-hidden">
            <button
              onClick={() =>
                setFiltersOpen((prev) => ({ ...prev, dateRange: !prev.dateRange }))
              }
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <span className="font-semibold text-white">Date Range</span>
              <span className="text-slate-400">{filtersOpen.dateRange ? "−" : "+"}</span>
            </button>

            {filtersOpen.dateRange && (
              <div className="px-4 pb-4 space-y-2">
                {[
                  { value: "all", label: "All time" },
                  { value: "7d", label: "Last 7 days" },
                  { value: "30d", label: "Last 30 days" },
                ].map((option) => {
                  const active = dateRange === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setDateRange(option.value as "all" | "7d" | "30d")}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                        active
                          ? "border-purple-500 bg-purple-500/10 text-white"
                          : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/35 overflow-hidden">
            <button
              onClick={() =>
                setFiltersOpen((prev) => ({ ...prev, saved: !prev.saved }))
              }
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <span className="font-semibold text-white">Saved</span>
              <span className="text-slate-400">{filtersOpen.saved ? "−" : "+"}</span>
            </button>

            {filtersOpen.saved && (
              <div className="px-4 pb-4">
                <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={savedOnly}
                    onChange={(e) => setSavedOnly(e.target.checked)}
                    className="h-4 w-4 accent-purple-500"
                  />
                  <span className="text-sm text-slate-300">Show saved posts only</span>
                </label>
              </div>
            )}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/35 overflow-hidden">
            <button
              onClick={() => setSummaryOpen((prev) => !prev)}
              className="w-full px-4 py-4 flex items-center justify-between text-left"
            >
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Magic Wire Summary
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Quick feed intelligence at a glance.
                </p>
              </div>
              <span className="text-slate-400">{summaryOpen ? "−" : "+"}</span>
            </button>

            {summaryOpen && (
              <div className="px-4 pb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatPill label="Posts Today" value={postsToday} />
                <StatPill label="Saved Posts" value={savedPosts.length} />
                <StatPill label="Trending Topic" value={trendingTopic} />
                <StatPill label="Latest Source" value={latestSource} />
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/25 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Magic Wire Feed</h2>
                <p className="text-sm text-slate-400">
                  {loading
                    ? "Loading current feed..."
                    : `${filteredCards.length} post${filteredCards.length === 1 ? "" : "s"} shown`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs text-purple-200"
                  >
                    {category}
                  </span>
                ))}
                {savedOnly && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                    Saved Only
                  </span>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[220px] rounded-2xl bg-slate-900/35 border border-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200">
              <div className="text-lg font-semibold">Magic Wire could not load</div>
              <p className="mt-2 text-sm text-rose-200/90">{error}</p>
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-8 text-center">
              <div className="text-4xl mb-3">🪄</div>
              <h3 className="text-xl font-semibold text-white">Magic Wire is warming up</h3>
              <p className="mt-2 text-slate-400 max-w-xl mx-auto">
                This is where curated magic news, tips, and inspiration will appear.
                Adjust your filters or check back after the next refresh.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredCards.map((card) => {
                const saved = savedIds.has(card.id);

                return (
                  <article
                    key={card.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 hover:bg-slate-900/55 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20 transition-colors transition-shadow duration-200"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-slate-300">
                        {card.source}
                      </span>
                      <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] uppercase tracking-wide text-purple-200">
                        {card.category}
                      </span>
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] uppercase tracking-wide text-amber-200">
                        {titleCase(card.type)}
                      </span>
                    </div>

                    <h3 className="mt-3 text-lg font-bold text-amber-400 line-clamp-2">
                      {card.title}
                    </h3>

                    <p className="mt-2 text-sm text-slate-300/85 line-clamp-4">
                      {card.summary}
                    </p>

                    {card.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {card.tags.map((tag) => (
                          <button
                            key={`${card.id}-${tag}`}
                            onClick={() => {
                              if (categories.includes(tag)) {
                                toggleCategory(tag);
                                void trackClientEvent({
                                  tool: "magic_wire",
                                  action: "magic_wire_click",
                                  outcome: "SUCCESS_NOT_CHARGED",
                                  metadata: {
                                    target: "tag_filter",
                                    tag,
                                    post_id: card.id,
                                  },
                                });
                              }
                            }}
                            className="rounded-full border border-slate-700 bg-slate-950/30 px-2.5 py-1 text-[11px] text-slate-300"
                            title={categories.includes(tag) ? "Filter by this category" : tag}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                      <span>{card.when || "Recent"}</span>
                      <span>{card.publishedAt ? new Date(card.publishedAt).toLocaleDateString() : ""}</span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => toggleSaved(card)}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          saved
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                            : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-slate-600"
                        }`}
                      >
                        {saved ? "Saved" : "Save"}
                      </button>

                      <button
                        onClick={() => openOriginal(card)}
                        disabled={!card.sourceUrl}
                        className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Open
                      </button>

                      <button
                        onClick={() => void shareCard(card)}
                        className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                      >
                        Share
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
