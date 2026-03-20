/**
 * YouTube Search proxy
 *
 * Why this exists:
 * - AI models frequently hallucinate video URLs.
 * - We instead ask the model for search queries, then look up real videos via the YouTube Data API.
 *
 * Auth:
 * - Requires the same Bearer auth header as other endpoints.
 *
 * Env:
 * - YOUTUBE_API_KEY (Google Cloud Console → APIs & Services → Credentials)
 */

type VideoResult = {
  title: string;
  url: string;
  videoId: string;
  channelTitle?: string;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YOUTUBE_API_KEY is not configured.' });
  }

  try {
    const body = req.body || {};
    const queries: string[] = Array.isArray(body.queries) ? body.queries : [];
    const maxResultsPerQuery = Math.min(Math.max(Number(body.maxResultsPerQuery || 3), 1), 5);
    const safeSearch = body.safeSearch === 'none' ? 'none' : 'strict';

    if (queries.length === 0) {
      return res.status(400).json({ error: 'Missing queries[]' });
    }

    // Fetch results for each query and flatten, then de-duplicate by videoId.
    const all: VideoResult[] = [];

    for (const q of queries.slice(0, 3)) {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('type', 'video');
      url.searchParams.set('maxResults', String(maxResultsPerQuery));
      url.searchParams.set('q', q);
      url.searchParams.set('safeSearch', safeSearch);
      url.searchParams.set('videoEmbeddable', 'true');
      url.searchParams.set('key', apiKey);

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return res.status(502).json({ error: 'YouTube API error', status: resp.status, details: text });
      }

      const data = await resp.json();
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        const videoId = item?.id?.videoId;
        const title = item?.snippet?.title;
        if (!videoId || !title) continue;
        all.push({
          videoId,
          title,
          channelTitle: item?.snippet?.channelTitle,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        });
      }
    }

    const seen = new Set<string>();
    const deduped = all.filter(v => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });

    // Return at most 3 final videos.
    return res.status(200).json({ videos: deduped.slice(0, 3) });
  } catch (err: any) {
    console.error('videoSearch error:', err);
    return res.status(500).json({ error: err?.message || 'Request failed.' });
  }
}
