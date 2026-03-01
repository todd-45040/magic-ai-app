import React, { useEffect, useState } from 'react';
import { fetchAdminAiStatus, fetchAdminSettings, saveAdminSettings, type AdminAIProvider, type AdminAiStatus } from '../services/adminSettingsService';

export default function AdminSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<AdminAIProvider>('gemini');
  const [aiStatus, setAiStatus] = useState<AdminAiStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);

    // Load settings + runtime status in parallel
    Promise.all([
      fetchAdminSettings().then((s) => setProvider(s.defaultProvider || 'gemini')),
      fetchAdminAiStatus().then((s) => setAiStatus(s)),
    ])
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [open]);

  function statusLabel() {
    if (!aiStatus) return null;
    const pretty = (p: string) => (p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic' : 'Google Gemini');
    const src = aiStatus.envOverrideActive ? 'ENV override active' : aiStatus.source === 'db' ? 'from DB' : 'default';
    return `Runtime Provider: ${pretty(aiStatus.runtimeProvider)} (${src})`;
  }

  function providerConfigured(p: AdminAIProvider): boolean {
    if (!aiStatus) return true;
    if (p === 'openai') return aiStatus.keys.openai.configured;
    if (p === 'anthropic') return aiStatus.keys.anthropic.configured;
    return aiStatus.keys.gemini.configured;
  }

  function previewLimitations(p: AdminAIProvider) {
    const tools = aiStatus?.tool_support || [];
    return tools.filter((t) => !t.support.includes(p));
  }

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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '72px 16px 16px',
        overflowY: 'auto',
      }}
    >
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

          {aiStatus && (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
              {statusLabel()}
            </div>
          )}

          {aiStatus && !providerConfigured(provider) && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#ffb4b4' }}>
              Warning: Server API key for <b>{provider}</b> is not configured. Switching may fail until keys are set in Vercel.
            </div>
          )}

          {aiStatus && (aiStatus.tool_support?.length || 0) > 0 && (
            (() => {
              const issues = previewLimitations(provider);
              const pretty = (p: string) => (p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic' : 'Google Gemini');
              if (issues.length === 0) {
                return (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.88 }}>
                    Compatibility: <b>No known tool limitations</b> for {pretty(provider)}.
                  </div>
                );
              }
              return (
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  <div style={{ color: '#ffd27a', fontWeight: 700 }}>
                    Compatibility warning: {issues.length} tool{issues.length === 1 ? '' : 's'} may be limited if you switch to {pretty(provider)}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>
                    You can still save this setting, but these tools may fail or degrade under the selected provider:
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, opacity: 0.92 }}>
                    {issues.slice(0, 8).map((t) => (
                      <li key={t.tool + t.route} style={{ marginBottom: 6 }}>
                        <b>{t.tool}</b>
                        {t.note ? <span style={{ opacity: 0.9 }}> — {t.note}</span> : null}
                      </li>
                    ))}
                    {issues.length > 8 && (
                      <li style={{ opacity: 0.9 }}>…and {issues.length - 8} more (see Admin → Overview → AI Provider Health)</li>
                    )}
                  </ul>
                  {aiStatus.envOverrideActive && (
                    <div style={{ marginTop: 8, color: '#ffb4b4', opacity: 0.95 }}>
                      Note: ENV override is currently active, so runtime behavior may not match this selection until AI_PROVIDER is unset.
                    </div>
                  )}
                </div>
              );
            })()
          )}
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
