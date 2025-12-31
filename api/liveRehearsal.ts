import { GoogleGenAI } from '@google/genai';

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

    return response.status(200).json(result);
  } catch (error: any) {
    console.error('Rehearsal API Error:', error);
    return response.status(500).json({ error: 'Failed to process rehearsal feedback.' });
  }
}
