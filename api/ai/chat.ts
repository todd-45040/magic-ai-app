import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error_code: "METHOD_NOT_ALLOWED",
      message: "Only POST allowed"
    });
  }

  return res.status(200).json({
    ok: true,
    data: {
      message: "Chat endpoint stub working"
    }
  });
}
