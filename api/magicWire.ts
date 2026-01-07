type WireItem = {
  category: string;
  headline: string;
  summary: string;
  body: string;
  source: string;
  sourceUrl: string | null;
  publishedAt?: string;
};

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, "").trim();
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

function extractAtomLink(block: string): string | null {
  // Atom: <link href="..."/> (Google News is RSS, Reddit is RSS, but keep this anyway)
  const m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : null;
}

function pickBlocks(xml: string): { blocks: string[]; kind: "rss" | "atom" | "none" } {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  if (items.length) return { blocks: items, kind: "rss" };
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  if (entries.length) return { blocks: entries, kind: "atom" };
  return { blocks: [], kind: "none" };
}

async function fetchXml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 7500);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MagicAIWizard/1.0 (+https://www.magicaiwizard.com)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    } as any);

    if (!r.ok) return null;
    const text = await r.text();

    // If a site returns HTML (WAF page), ignore it.
    const head = text.slice(0, 2000).toLowerCase();
    if (head.includes("<html") || head.includes("<!doctype html")) return null;

    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseFeed(xml: string, source: string, category: string): WireItem[] {
  const { blocks } = pickBlocks(xml);
  if (!blocks.length) return [];

  return blocks.slice(0, 25).map((b) => {
    const titleRaw = extractTag(b, "title") || "";
    const headline = decodeHtml(stripTags(titleRaw)) || "Magic News";

    // RSS: <link>...</link>
    let link = extractTag(b, "link");
    if (link) link = stripTags(link);

    // Atom fallback
    if (!link) link = extractAtomLink(b) || undefined;

    const sourceUrl = link && link.length ? link : null;

    const descRaw =
      extractTag(b, "description") ||
      extractTag(b, "summary") ||
      extractTag(b, "content") ||
      "";

    const desc = decodeHtml(stripTags(descRaw)).trim();
    const summary = desc
      ? desc.length > 180
        ? desc.slice(0, 177) + "..."
        : desc
      : "Read more…";

    const publishedAt =
      extractTag(b, "pubDate") ||
      extractTag(b, "updated") ||
      extractTag(b, "published") ||
      undefined;

    return {
      category,
      headline,
      summary,
      body: desc || summary,
      source,
      sourceUrl,
      publishedAt: publishedAt || undefined,
    };
  });
}

// ---- simple in-memory cache (works well on warm lambdas) ----
declare global {
  // eslint-disable-next-line no-var
  var __mw_cache: { ts: number; items: WireItem[] } | undefined;
}

function getCached(maxAgeMs: number): WireItem[] | null {
  const c = globalThis.__mw_cache;
  if (!c) return null;
  if (Date.now() - c.ts > maxAgeMs) return null;
  return c.items;
}

function setCached(items: WireItem[]) {
  globalThis.__mw_cache = { ts: Date.now(), items };
}

export default async function handler(req: any, res: any) {
  try {
    if (req?.method && req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const countRaw = String(req?.query?.count ?? "9");
    const count = Math.max(1, Math.min(12, parseInt(countRaw, 10) || 9));

    // Cache for 10 minutes (prevents slow feeds + stabilizes UI)
    const cached = getCached(10 * 60 * 1000);
    if (cached) {
      return sendJson(res, 200, cached.slice(0, count));
    }

    // ✅ Reliable feeds for serverless:
    // Google News RSS queries (very stable)
    const feeds: { url: string; source: string; category: string }[] = [
      {
        url: "https://news.google.com/rss/search?q=magic+trick+magician&hl=en-US&gl=US&ceid=US:en",
        source: "Google News",
        category: "Magic News",
      },
      {
        url: "https://news.google.com/rss/search?q=illusionist+show&hl=en-US&gl=US&ceid=US:en",
        source: "Google News",
        category: "Shows & Events",
      },
      // Reddit RSS tends to work well from serverless
      {
        url: "https://www.reddit.com/r/MagicTricks/.rss",
        source: "Reddit r/MagicTricks",
        category: "Community",
      },
    ];

    const settled = await Promise.allSettled(
      feeds.map(async (f) => {
        const xml = await fetchXml(f.url);
        if (!xml) return [] as WireItem[];
        return parseFeed(xml, f.source, f.category);
      })
    );

    const merged: WireItem[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") merged.push(...s.value);
    }

    // De-dupe by headline
    const seen = new Set<string>();
    const deduped = merged.filter((a) => {
      const k = (a.headline || "").toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // If still empty, provide stable fallback so UI always populates
    const fallback: WireItem[] = [
      {
        category: "Magic News",
        headline: "Magic Wire is warming up feeds",
        summary: "If sources throttle requests, feeds may take a moment to refresh. Try Refresh in a minute.",
        body: "If sources throttle requests, feeds may take a moment to refresh. Try Refresh in a minute.",
        source: "Magic AI Wizard",
        sourceUrl: "https://www.magicaiwizard.com/app/",
      },
      {
        category: "Community",
        headline: "Tip: Add more sources anytime",
        summary: "You can add or swap RSS sources easily in api/magicWire.ts under the feeds list.",
        body: "You can add or swap RSS sources easily in api/magicWire.ts under the feeds list.",
        source: "Magic AI Wizard",
        sourceUrl: "https://www.magicaiwizard.com/app/",
      },
      {
        category: "Shows & Events",
        headline: "Want dealer/event feeds too?",
        summary: "We can add convention/event RSS sources next for a stronger Magic Wire.",
        body: "We can add convention/event RSS sources next for a stronger Magic Wire.",
        source: "Magic AI Wizard",
        sourceUrl: "https://www.magicaiwizard.com/app/",
      },
    ];

    const finalItems = deduped.length ? deduped : fallback;

    setCached(finalItems);
    return sendJson(res, 200, finalItems.slice(0, count));
  } catch {
    // Never break the page
    return sendJson(res, 200, []);
  }
}
