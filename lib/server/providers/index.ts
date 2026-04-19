import { getSupabaseAdmin } from '../auth/index.js';

export type AIProvider = 'gemini' | 'openai' | 'anthropic';

function normProvider(v: any): AIProvider | null {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'gemini' || s === 'openai' || s === 'anthropic') return s as AIProvider;
  return null;
}

// Small in-memory cache so we don't hit Supabase on every AI call.
let _cached: { provider: AIProvider; at: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60s

async function fetchProviderFromDb(): Promise<AIProvider | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_defaults')
      .maybeSingle();

    if (error) {
      // If the table doesn't exist (or other schema issues), fall back safely.
      if (String(error.message || '').includes('does not exist')) return null;
      return null;
    }

    const v = (data as any)?.value;
    const provider = normProvider(v?.provider);
    return provider;
  } catch (_e) {
    // Missing env vars or any other error -> no DB provider
    return null;
  }
}

/**
 * Resolve AI provider in priority order:
 * 1) Env override AI_PROVIDER (break-glass)
 * 2) DB setting app_settings[key='ai_defaults'].value.provider
 * 3) Default: gemini
 *
 * End-users cannot override provider.
 */
export async function resolveProvider(_req: any): Promise<AIProvider> {
  const fromEnv = normProvider(process.env.AI_PROVIDER);
  if (fromEnv) return fromEnv;

  const now = Date.now();
  if (_cached && now - _cached.at < CACHE_TTL_MS) return _cached.provider;

  const fromDb = await fetchProviderFromDb();
  const provider = fromDb || 'gemini';
  _cached = { provider, at: now };
  return provider;
}

function partsToText(contents: any): string {
  // Accept either array of {role, parts:[{text}]} or {parts:[...]}
  const collect = (parts: any[]) =>
    parts
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n');

  if (Array.isArray(contents)) {
    return contents
      .map((c) => collect(Array.isArray(c?.parts) ? c.parts : []))
      .filter(Boolean)
      .join('\n\n');
  }

  if (contents && Array.isArray(contents?.parts)) return collect(contents.parts);
  return '';
}

function extractInlineImage(contents: any): { mimeType: string; data: string } | null {
  const scanParts = (parts: any[]) => {
    for (const p of parts) {
      const d = p?.inlineData;
      if (d?.data && d?.mimeType) return { mimeType: String(d.mimeType), data: String(d.data) };
    }
    return null;
  };

  if (Array.isArray(contents)) {
    for (const c of contents) {
      const found = scanParts(Array.isArray(c?.parts) ? c.parts : []);
      if (found) return found;
    }
    return null;
  }

  if (contents && Array.isArray(contents?.parts)) return scanParts(contents.parts);
  return null;
}

function mimeToDataUrl(mimeType: string, b64: string) {
  // base64 string without prefix -> data URL
  return `data:${mimeType};base64,${b64}`;
}

export async function callOpenAI(reqBody: any): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the server.');

  const model = reqBody?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const contents = reqBody?.contents;
  const config = reqBody?.config || {};

  const text = partsToText(contents);
  const img = extractInlineImage(contents);

  const systemInstruction = config?.systemInstruction || config?.system || '';

  const messages: any[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: String(systemInstruction) });

  if (img) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: text || 'Analyze the provided image.' },
        { type: 'image_url', image_url: { url: mimeToDataUrl(img.mimeType, img.data) } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: text || '' });
  }

  const wantJson = String(config?.responseMimeType || '').includes('json');
  const body: any = {
    model,
    messages,
    temperature: typeof config?.temperature === 'number' ? config.temperature : undefined,
  };
  if (wantJson) body.response_format = { type: 'json_object' };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error?.message || json?.message || `OpenAI request failed (${resp.status})`;
    throw new Error(msg);
  }

  const outText = json?.choices?.[0]?.message?.content ?? '';
  return { text: outText, provider: 'openai', raw: json };
}

export async function callAnthropic(reqBody: any): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');

  const model = reqBody?.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
  const contents = reqBody?.contents;
  const config = reqBody?.config || {};

  const text = partsToText(contents);
  const img = extractInlineImage(contents);
  const system = config?.systemInstruction || config?.system || '';

  const content: any[] = [];
  if (text) content.push({ type: 'text', text: String(text) });

  if (img) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: String(img.mimeType), data: String(img.data) },
    });
  }

  const wantJson = String(config?.responseMimeType || '').includes('json');

  const body: any = {
    model,
    max_tokens: typeof config?.maxOutputTokens === 'number' ? config.maxOutputTokens : 1024,
    system: system ? String(system) : undefined,
    messages: [{ role: 'user', content: content.length ? content : [{ type: 'text', text: '' }] }],
  };
  // Anthropic doesn't have a strict "json mode", but we can nudge it
  if (wantJson) {
    body.system = (body.system ? body.system + '\n\n' : '') + 'Return ONLY valid JSON.';
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error?.message || json?.message || `Anthropic request failed (${resp.status})`;
    throw new Error(msg);
  }

  const outText =
    Array.isArray(json?.content) ? json.content.map((c: any) => c?.text || '').join('') : '';
  return { text: outText, provider: 'anthropic', raw: json };
}
