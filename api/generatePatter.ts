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

    // Use Gemini 3 Pro for high-quality creative scriptwriting
    const result = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents,
      config: {
        ...config,
        temperature: 0.8, // Slightly higher for more creative patter
      }
    });

    return response.status(200).json(result);
  } catch (error: any) {
    console.error('Patter API Error:', error);
    return response.status(500).json({ error: 'Failed to generate magical patter.' });
  }
}
