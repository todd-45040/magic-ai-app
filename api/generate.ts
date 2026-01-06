import { GoogleGenAI } from '@google/genai';
import { enforceAiUsage } from './_usage.js';

// In a real production app, you would use firebase-admin to verify the Bearer token
// and check the user's membership tier in Firestore before proceeding.

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    return response.status(500).json({ error: 'API_KEY is not configured on the server.' });
  }

  // Basic Auth Check (Simulated)
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  // AI cost protection (daily caps + per-minute burst limits)
  const usage = await enforceAiUsage(request, 1);
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
    const { model, contents, config } = request.body;

    // Call the Gemini model
    // Note: Use 'gemini-3-pro-preview' for complex magician tasks as per guidelines
    const result = await ai.models.generateContent({
      model: model || 'gemini-3-pro-preview',
      contents,
      config: {
        ...config,
        // Enforce safety settings or specific configs here if needed
      }
    });

    // Return the response candidate
    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    return response.status(200).json(result);

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    
    // Check for specific error types to handle tier limits or safety blocks
    if (error.message?.includes('finishReason: SAFETY')) {
        return response.status(400).json({ error: 'The request was blocked by safety filters.' });
    }

    return response.status(500).json({ 
      error: 'An internal error occurred while processing your request.' 
    });
  }
}
