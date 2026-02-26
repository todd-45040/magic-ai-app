// Lightweight CSV export helper for Admin Ops pages.
// - No deps
// - Safe for Vite/React browser builds

export type CsvRow = Record<string, any>;

function escapeCsvValue(v: any): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'string') s = v;
  else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
  else s = JSON.stringify(v);

  // Normalize newlines
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Escape quotes
  const needsQuotes = /[\n\r,\"]/g.test(s);
  if (s.includes('"')) s = s.replace(/"/g, '""');
  return needsQuotes ? `"${s}"` : s;
}

function inferHeaders(rows: CsvRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (!r) continue;
    for (const k of Object.keys(r)) set.add(k);
  }
  return Array.from(set);
}

export function downloadCsv(filename: string, rows: CsvRow[], headers?: string[]) {
  try {
    const safeRows = Array.isArray(rows) ? rows : [];
    const cols = (headers && headers.length ? headers : inferHeaders(safeRows));

    const lines: string[] = [];
    lines.push(cols.map(escapeCsvValue).join(','));

    for (const row of safeRows) {
      const line = cols.map((h) => escapeCsvValue((row as any)?.[h])).join(',');
      lines.push(line);
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // fail silently in Admin; export is best-effort
  }
}
