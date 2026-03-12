import crypto from 'crypto';

type DuplicateEntry = {
  state: 'processing' | 'complete';
  expiresAt: number;
  startedAt: number;
  response?: any;
};

const entries = new Map<string, DuplicateEntry>();
let lastCleanup = 0;

function cleanup(now = Date.now()) {
  if (now - lastCleanup < 15000) return;
  lastCleanup = now;
  for (const [k, v] of entries.entries()) {
    if (v.expiresAt <= now) entries.delete(k);
  }
}

function stable(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

export function normalizePayload(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;
  const clone: any = { ...payload };
  if (typeof clone.prompt === 'string') clone.prompt = clone.prompt.trim();
  if (Array.isArray(clone.messages)) {
    clone.messages = clone.messages.map((m: any) => ({
      role: String(m?.role || 'user'),
      content: typeof m?.content === 'string' ? m.content.trim() : m?.content,
    }));
  }
  if (Array.isArray(clone.contents)) clone.contents = clone.contents;
  return clone;
}

export function makeFingerprint(input: { identityKey: string; tool: string; payload: any }): string {
  cleanup();
  const normalized = normalizePayload(input.payload);
  const raw = `${input.identityKey}|${input.tool}|${stable(normalized)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function inspectDuplicate(fingerprint: string): { status: 'fresh' | 'processing' | 'cached'; cached?: any } {
  cleanup();
  const existing = entries.get(fingerprint);
  const now = Date.now();
  if (!existing || existing.expiresAt <= now) {
    return { status: 'fresh' };
  }
  if (existing.state === 'processing') return { status: 'processing' };
  return { status: 'cached', cached: existing.response };
}

export function markProcessing(fingerprint: string, ttlMs: number) {
  cleanup();
  entries.set(fingerprint, {
    state: 'processing',
    startedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
}

export function markCompleted(fingerprint: string, response: any, ttlMs: number) {
  cleanup();
  entries.set(fingerprint, {
    state: 'complete',
    response,
    startedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearFingerprint(fingerprint: string) {
  entries.delete(fingerprint);
}
