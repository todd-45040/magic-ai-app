export default async function handler(req: any, res: any) {
  try {
    // ultra-compatible response (no res.status / res.json)
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    const out = {
      ok: true,
      route: "/api/magicWire",
      method: req?.method,
      url: req?.url,
      now: new Date().toISOString(),
      node: process.version,
      hasFetch: typeof (globalThis as any).fetch === "function",
    };

    res.end(JSON.stringify(out));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("magicWire canary failed: " + (e?.message || String(e)));
  }
}
