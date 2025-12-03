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
    const { model, contents, config } = request.body;

    // Use the SDK to call the API from the server
    const result = await ai.models.generateContent({
      model: model || 'gemini-2.5-flash',
      contents,
      config
    });

    // Return the raw result object (serialized)
    return response.status(200).json(result);

  } catch (error) {
    console.error('Gemini API Error:', error);
    return response.status(500).json({ 
      error: error instanceof Error ? error.message : 'An error occurred processing the AI request.' 
    });
  }
}