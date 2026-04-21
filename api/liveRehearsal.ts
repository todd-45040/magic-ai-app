import { markLegacyRoute } from './_lib/legacyRoute.js';
import { GoogleGenAI } from '@google/genai';
import { enforceLiveMinutes } from '../server/usage.js';
import { resolveProvider, callOpenAI, callAnthropic } from '../lib/server/providers/index.js';
import { getGoogleAiApiKey } from '../server/gemini.js';

export default async function handler(request: any, response: any) {
  markLegacyRoute(response, '/api/ai/live-rehearsal');
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Unauthorized.' });
  }

  const body = request.body || {};
  const requestedMinutes = Number.isFinite(Number(body.minutes)) ? Number(body.minutes) : 1;
  const minutes = Math.max(1, Math.min(10, Math.ceil(requestedMinutes)));
  const liveGate = await enforceLiveMinutes(request, minutes, { route: 'liveRehearsal' });
  if (!liveGate.ok) {
    return response
      .status(liveGate.status || 429)
      .json({
        ok: false,
        code: 'quota_exceeded',
        reason: liveGate.reason,
        message: liveGate.error || 'Live rehearsal limit reached.',
        error: liveGate.error || 'Live rehearsal limit reached.',
        membership: liveGate.membership,
        usage: {
          remainingDaily: liveGate.remainingDailyMinutes ?? liveGate.liveRemaining ?? 0,
          remainingMonthly: liveGate.remainingMonthlyMinutes ?? 0,
        },
        liveUsed: liveGate.liveUsed,
        liveLimit: liveGate.liveLimit,
        liveRemaining: liveGate.liveRemaining,
        remainingDailyMinutes: liveGate.remainingDailyMinutes,
        remainingMonthlyMinutes: liveGate.remainingMonthlyMinutes,
        burstRemaining: liveGate.burstRemaining,
        burstLimit: liveGate.burstLimit,
      });
  }

  try {
    const provider = await resolveProvider(request);
    let result: any;

    if (provider === 'openai') {
      // Accept either Gemini-style body (model/contents/config) or {prompt, systemInstruction}
      const contents =
        body.contents ||
        [
          { role: 'user', parts: [{ text: body.prompt || '' }] },
        ];

      const config = body.config || {
        systemInstruction: body.systemInstruction,
      };

      result = await callOpenAI({
        model: body.model || 'gemini-3-pro-preview',
        contents,
        config,
      });
    } else if (provider === 'anthropic') {
      const contents =
        body.contents ||
        [
          { role: 'user', parts: [{ text: body.prompt || '' }] },
        ];

      const config = body.config || {
        systemInstruction: body.systemInstruction,
      };

      result = await callAnthropic({
        model: body.model || 'gemini-3-pro-preview',
        contents,
        config,
      });
    } else {
      const apiKey = getGoogleAiApiKey();
      if (!apiKey) {
        return response.status(500).json({ error: 'GOOGLE_AI_API_KEY is not configured.' });
      }

      const ai = new GoogleGenAI({ apiKey });

      if (body.prompt && body.systemInstruction) {
        // For endpoints that send prompt/systemInstruction directly
        result = await ai.models.generateContent({
          model: body.model || 'gemini-3-pro-preview',
          contents: [{ role: 'user', parts: [{ text: body.prompt }] }],
          config: {
            systemInstruction: body.systemInstruction,
          },
        });
      } else {
        // For endpoints that send model/contents/config
        result = await ai.models.generateContent({
          model: body.model || 'gemini-3-pro-preview',
          contents: body.contents,
          config: body.config,
        });
      }
    }

    response.setHeader('X-AI-Remaining', String(liveGate.remainingDailyMinutes ?? liveGate.liveRemaining ?? ''));
    response.setHeader('X-AI-Limit', String(liveGate.liveLimit ?? ''));
    response.setHeader('X-AI-Membership', String(liveGate.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(liveGate.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(liveGate.burstLimit ?? ''));
    response.setHeader('X-Live-Daily-Remaining', String(liveGate.remainingDailyMinutes ?? liveGate.liveRemaining ?? ''));
    response.setHeader('X-Live-Monthly-Remaining', String(liveGate.remainingMonthlyMinutes ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(result);
  } catch (error: any) {
    console.error('AI Provider Error:', error);
    return response.status(500).json({ error: error?.message || 'Request failed.' });
  }
}
