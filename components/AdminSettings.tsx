import React, { useEffect, useMemo, useState } from 'react';

type AIProvider = 'gemini' | 'openai' | 'anthropic';

export default function AdminSettings({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<AIProvider>('gemini');
  const [saved, setSaved] = useState(false);

  const providers: { value: AIProvider; label: string }[] = useMemo(
    () => [
      { value: 'gemini', label: 'Google Gemini (default)' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
    ],
    []
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch('/api/adminSettings', { method: 'GET' });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json?.error || `Request failed (${r.status})`);
        const p = String(json?.settings?.aiProvider || 'gemini').toLowerCase();
        if (mounted && (p === 'gemini' || p === 'openai' || p === 'anthropic')) {
          setAiProvider(p as AIProvider);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load admin settings.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function save() {
    try {
      setSaving(true);
      setSaved(false);
      setError(null);
      const r = await fetch('/api/adminSettings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiProvider }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error || `Save failed (${r.status})`);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e: any) {
      setError(e?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="card" style={{ width: 'min(720px, 92vw)' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">Administrator Settings</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Configure app-wide options. End users cannot change these.
            </div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close admin settings">
            Close
          </button>
        </div>

        <div className="card-body">
          {loading ? (
            <div className="muted">Loading settings…</div>
          ) : (
            <>
              {error ? (
                <div className="toast toast-error" style={{ marginBottom: 12 }}>
                  {error}
                </div>
              ) : null}

              <div className="menu-item" style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Default AI Provider</div>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as AIProvider)}
                  style={{ width: '100%' }}
                >
                  {providers.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Tip: If you select OpenAI or Anthropic, make sure the corresponding server env keys are set in Vercel.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Settings'}
                </button>
                {saved ? <div className="muted">Saved.</div> : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
