import React, { useEffect, useState } from 'react';
import { fetchAdminSettings, saveAdminSettings, type AdminAIProvider } from '../services/adminSettingsService';

export default function AdminSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<AdminAIProvider>('gemini');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchAdminSettings()
      .then((s) => setProvider(s.defaultProvider || 'gemini'))
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [open]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await saveAdminSettings({ defaultProvider: provider });
      onClose();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 420, maxWidth: '100%', background: 'rgba(20,20,30,0.98)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Administrator Settings</div>
          <button onClick={onClose} style={{ opacity: 0.9 }}>✕</button>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.9 }}>
          Set global defaults for AI provider. Users will not be able to change these.
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Default AI Provider</div>
          <select value={provider} onChange={(e) => setProvider(e.target.value as AdminAIProvider)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12 }}>
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        {error && <div style={{ marginTop: 12, color: '#ffb4b4', fontSize: 12, whiteSpace: 'pre-wrap' }}>{error}</div>}
        {loading && <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>Loading…</div>}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 10px', borderRadius: 12, opacity: saving ? 0.7 : 1 }}>Cancel</button>
          <button onClick={onSave} disabled={saving || loading} style={{ padding: '8px 10px', borderRadius: 12, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
