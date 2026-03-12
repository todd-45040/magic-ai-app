/**
 * Lightweight smoke checker for normalized AI response envelopes.
 * Run manually against a local or preview deployment after login/session wiring is available.
 *
 * Example:
 *   BASE_URL=http://localhost:5173 node scripts/ai-response-smoke.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function assertNormalizedEnvelope(payload, endpoint) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${endpoint}: payload is not an object`);
  }
  if (typeof payload.ok !== 'boolean') {
    throw new Error(`${endpoint}: missing boolean ok field`);
  }
  if (payload.ok) {
    if (typeof payload.tool !== 'string') throw new Error(`${endpoint}: missing tool`);
    if (!('data' in payload)) throw new Error(`${endpoint}: missing data`);
    if (!('warnings' in payload)) throw new Error(`${endpoint}: missing warnings`);
  } else {
    if (typeof payload.message !== 'string') throw new Error(`${endpoint}: missing message`);
    if (typeof payload.errorCode !== 'string') throw new Error(`${endpoint}: missing normalized errorCode`);
    if (typeof payload.error_code !== 'string') throw new Error(`${endpoint}: missing legacy error_code`);
  }
}

async function main() {
  const tests = [
    {
      endpoint: '/api/ai/chat',
      body: { messages: [{ role: 'user', content: 'Say hello in one sentence.' }] },
    },
    {
      endpoint: '/api/ai/json',
      body: { messages: [{ role: 'user', content: 'Return a JSON object with a hello field.' }] },
    },
  ];

  for (const t of tests) {
    const r = await fetch(`${BASE_URL}${t.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t.body),
    });
    const payload = await r.json();
    assertNormalizedEnvelope(payload, t.endpoint);
    console.log(`PASS ${t.endpoint} -> ${r.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
