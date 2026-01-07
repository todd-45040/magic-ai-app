import { requireSupabaseAuth } from './lib/auth';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
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
  const re = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i');
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

async function fetchRss(url: string, source: string) {
  const r = await fetch(url, { headers: { 'User-Agent': 'MagicAIWizard/1.0 (+https://www.magicaiwizard.com)' } } as any);
  const xml = await r.text();

  // Prefer <item> (RSS) then <entry> (Atom)
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  const blocks = items.length ? items : entries;

  return blocks.slice(0, 15).map((b) => {
    const title = decodeHtml(stripTags(extractTag(b, 'title') || ''));
    let link = extractTag(b, 'link');

    // Atom often uses <link href="..."/>
    if (!link) {
      const m = b.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/>/i);
      if (m) link = m[1];
    } else {
      link = stripTags(link);
    }

    const desc = decodeHtml(stripTags(extractTag(b, 'description') || extractTag(b, 'summary') || ''));
    const pub = extractTag(b, 'pubDate') || extractTag(b, 'updated') || extractTag(b, 'published') || '';

    const summary = desc ? (desc.length > 180 ? desc.slice(0, 177) + '...' : desc) : 'Tap to read more.';

    return {
      category: 'Community News',
      headline: title || 'Magic News',
      source,
      sourceUrl: link || undefined,
      summary,
      body: desc || summary,
      publishedAt: pub || undefined,
    };
  });
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req as any);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    const count = Math.max(1, Math.min(12, parseInt(String(req.query.count || '9'), 10) || 9));

    const feeds = [
      { url: 'https://www.vanishingincmagic.com/rss/', source: 'Vanishing Inc.' },
      { url: 'https://www.penguinmagic.com/rss.php', source: 'Penguin Magic' },
      { url: 'https://www.magicshop.co.uk/feed/', source: 'Magic Shop UK' },
    ];

    const results = await Promise.allSettled(feeds.map((f) => fetchRss(f.url, f.source)));
    const merged: any[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') merged.push(...r.value);
    }

    // If all feeds fail, fail soft (return empty) rather than 500
    if (!merged.length) return json(res, 200, []);

    // Basic de-dupe by headline
    const seen = new Set<string>();
    const deduped = merged.filter((a) => {
      const k = (a.headline || '').toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return json(res, 200, deduped.slice(0, count));
  } catch (e: any) {
    // Return JSON so UI can show meaningful error
    return json(res, 500, { error: e?.message || String(e) });
  }
}
