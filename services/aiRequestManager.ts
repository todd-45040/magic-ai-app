const inflight = new Map<string, Promise<any>>();
const completed = new Map<string, number>();

function stableStringify(input: any): string {
  if (input === null || input === undefined) return String(input);
  if (typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((v) => stableStringify(v)).join(',')}]`;
  const keys = Object.keys(input).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(input[k])}`).join(',')}}`;
}

export function buildAiRequestFingerprint(url: string, body: any): string {
  return `${url}::${stableStringify(body)}`;
}

export function getClientCooldownMs(url: string): number {
  if (/image|visual-brainstorm/i.test(url)) return 20_000;
  if (/video|live-rehearsal|show-planner/i.test(url)) return 15_000;
  if (/marketing|json|generate/i.test(url)) return 8_000;
  return 4_000;
}

export async function runManagedAiRequest<T>(fingerprint: string, run: () => Promise<T>, cooldownMs: number): Promise<T> {
  const now = Date.now();
  const last = completed.get(fingerprint);
  if (typeof last === 'number' && now - last < cooldownMs) {
    throw new Error(`Please wait ${Math.ceil((cooldownMs - (now - last)) / 1000)} seconds before trying again.`);
  }

  const existing = inflight.get(fingerprint);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = Promise.resolve()
    .then(run)
    .finally(() => {
      inflight.delete(fingerprint);
      completed.set(fingerprint, Date.now());
    });

  inflight.set(fingerprint, promise);
  return promise;
}
