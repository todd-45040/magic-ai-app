import { requireSupabaseAuth } from './lib/auth';

function sendJson(res: any, status: number, body: any) {
  // Works with Next/Vercel response objects AND plain Node responses
  try {
    if (typeof res?.status === 'function' && typeof res?.json === 'function') {
      return res.status(status).json(body);
    }
  } catch {}
  try {
    if (typeof res?.status === 'function' && typeof res?.send === 'function') {
      res.status(status);
      try { res.setHeader?.('Content-Type', 'application/json; charset=utf-8'); } catch {}
      return res.send(JSON.stringify(body));
    }
  } catch {}
  // Fallback: Node ServerResponse
  res.statusCode = status;
  try { res.setHeader?.('Content-Type', 'application/json; charset=utf-8'); } catch {}
  res.end(JSON.stringify(body));
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, '').trim();
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

async function fetchRss(url: string, source: string) {
  const controller = new AbortController();
  const timeoutMs = 6500;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MagicAIWizard/1.0 (+https://www.magicaiwizard.com)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    } as any);

    if (!r.ok) return [];

    const xml = await r.text();

    const items = xml.match(/<item[\\s\\S]*?<\\/item>/gi) || [];
    const entries = xml.match(/<entry[\\s\\S]*?<\\/entry>/gi) || [];
    const blocks = items.length ? items : entries;

    return blocks.slice(0, 15).map((b) => {
      const title = decodeHtml(stripTags(extractTag(b, 'title') || '')) || 'Magic News';

      let link = extractTag(b, 'link');
      // Atom <link href="..."/>
      if (!link) {
        const m = b.match(/<link[^>]*href=["']([^"']+)["'][^>]*\\/?>/i);
        if (m) link = m[1];
      } else {
        link = stripTags(link);
      }

      const desc = decodeHtml(
        stripTags(extractTag(b, 'description') || extractTag(b, 'summary') || '')
      );
      const pub =
        extractTag(b, 'pubDate') ||
        extractTag(b, 'updated') ||
        extractTag(b, 'published') ||
        '';

      const summary = desc
        ? (desc.length > 180 ? desc.slice(0, 177) + '...' : desc)
        : 'Tap to read more.';

      return {
        category: 'Community News',
        headline: title,
        source,
        sourceUrl: link || undefined,
        summary,
        body: desc || summary,
        publishedAt: pub || undefined,
      };
    });
  } catch {
    // Fail soft for this feed only
    return [];
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req?.method && req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });

    const countRaw = req?.query?.count ?? '9';
    const count = Math.max(1, Math.min(12, parseInt(String(countRaw), 10) || 9));

    const feeds = [
      { url: 'https://www.vanishingincmagic.com/rss/', source: 'Vanishing Inc.' },
      { url: 'https://www.penguinmagic.com/rss.php', source: 'Penguin Magic' },
      { url: 'https://www.magicshop.co.uk/feed/', source: 'Magic Shop UK' },
    ];

    const results = await Promise.allSettled(feeds.map((f) => fetchRss(f.url, f.source)));

    const merged: any[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) merged.push(...r.value);
    }

    if (!merged.length) return sendJson(res, 200, []);

    const seen = new Set<string>();
    const deduped = merged.filter((a) => {
      const k = (a?.headline || '').toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return sendJson(res, 200, deduped.slice(0, count));
  } catch (e: any) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
}
