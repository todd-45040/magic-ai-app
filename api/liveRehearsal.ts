import { GoogleGenAI } from '@google/genai';
import { enforceAiUsage } from './_usage';

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return response.status(500).json({ error: 'API_KEY is not configured.' });
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Unauthorized.' });

  }

  // AI cost protection (daily caps + per-minute burst limits)
  const usage = await enforceAiUsage(request, 2);
  if (!usage.ok) {
    return response
      .status(usage.status || 429)
            .json({
        error: usage.error || 'AI usage limit reached.',
        remaining: usage.remaining,
        limit: usage.limit,
        burstRemaining: usage.burstRemaining,
        burstLimit: usage.burstLimit,
      });}



  try {
    const ai = new GoogleGenAI({ apiKey });
    const { contents, config } = request.body;

    // Use Gemini 3 Flash for quick, responsive coaching feedback
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        ...config,
        temperature: 0.5, // Lower for more consistent, practical advice
      }
    });

    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    return response.status(200).json(result);
  } catch (error: any) {
    console.error('Rehearsal API Error:', error);
    return response.status(500).json({ error: 'Failed to process rehearsal feedback.' });
  }
}
