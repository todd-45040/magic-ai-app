import { GoogleGenAI } from '@google/genai';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    return response.status(500).json({ error: 'API_KEY is not set in the server environment.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const { prompt, aspectRatio } = request.body;

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

  } catch (error) {
    console.error('Imagen API Error:', error);
    return response.status(500).json({ 
      error: error instanceof Error ? error.message : 'An error occurred generating the image.' 
    });
  }
}