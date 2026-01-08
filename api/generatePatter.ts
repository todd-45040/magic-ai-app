export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Missing GOOGLE_API_KEY (or legacy API_KEY) in server environment",
      });
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const body = req.body || {};
    const prompt = body.prompt || "Hello";

    const result = await ai.models.generateContent({
      model: process.env.AI_MODEL || "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("generatePatter error:", err);
    return res.status(500).json({
      error: err?.message || "Internal server error",
    });
  }
}
