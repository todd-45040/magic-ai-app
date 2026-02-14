import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  return res.status(200).json({
    ok: true,
    data: {
      plan: "pro",
      generation_count: 3,
      generation_limit: 20,
      live_minutes_used: 5,
      live_minutes_limit: 30,
      reset_date: new Date().toISOString()
    }
  });
}
