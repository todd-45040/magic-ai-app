export function markLegacyRoute(res: any, canonicalRoute: string) {
  try {
    res.setHeader('X-Legacy-Route', 'true');
    res.setHeader('X-Canonical-Route', canonicalRoute);
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Tue, 30 Jun 2026 00:00:00 GMT');
  } catch {
    // ignore header-setting issues in edge runtimes
  }
}
