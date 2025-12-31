import { GoogleGenAI } from '@google/genai';

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return response.status(500).json({ error: 'API_KEY is not configured on the server.' });
  }

  // Basic Auth Check
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const { prompt, aspectRatio } = request.body;

    // Use Imagen 4 for high-quality magic concept art
    const result = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio || '1:1',
      },
    });

    return response.status(200).json(result);

  } catch (error: any) {
    console.error('Imagen API Error:', error);
    return response.status(500).json({ 
      error: 'Failed to generate image. Please try a different prompt.' 
    });
  }
}
