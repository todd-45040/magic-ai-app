export type AIProvider = 'gemini' | 'openai' | 'anthropic';

const KEY = 'maw_ai_provider';

export function getAiProvider(): AIProvider {
  try {
    const v = String(localStorage.getItem(KEY) || '').toLowerCase();
    if (v === 'openai' || v === 'anthropic' || v === 'gemini') return v as AIProvider;
  } catch {}
  return 'gemini';
}

export function setAiProvider(provider: AIProvider) {
  try {
    localStorage.setItem(KEY, provider);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('ai-provider-update', { detail: { provider } }));
  } catch {}
}
