import type { AIProvider } from './providers';

export type AppSettings = {
  aiProvider: AIProvider;
};

const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'gemini',
};

// Table/row convention (recommended):
// public.app_settings (
//   id text primary key,
//   ai_provider text not null,
//   updated_at timestamptz
// ) with a single row id='global'
const SETTINGS_TABLE = 'app_settings';
const SETTINGS_ID = 'global';

export async function getAppSettings(admin: any): Promise<AppSettings> {
  try {
    const { data, error } = await admin
      .from(SETTINGS_TABLE)
      .select('ai_provider')
      .eq('id', SETTINGS_ID)
      .maybeSingle();

    if (error) {
      // If the table doesn't exist (or other schema issues), fall back safely.
      return DEFAULT_SETTINGS;
    }

    const aiProvider = String(data?.ai_provider || '').toLowerCase().trim();
    if (aiProvider === 'openai' || aiProvider === 'anthropic' || aiProvider === 'gemini') {
      return { aiProvider: aiProvider as AIProvider };
    }

    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function setAppSettings(admin: any, settings: Partial<AppSettings>): Promise<AppSettings> {
  const aiProvider = settings.aiProvider || DEFAULT_SETTINGS.aiProvider;
  const safe: AppSettings = {
    aiProvider: aiProvider,
  };

  try {
    const { error } = await admin.from(SETTINGS_TABLE).upsert({
      id: SETTINGS_ID,
      ai_provider: safe.aiProvider,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      // If table doesn't exist, return safe defaults.
      return safe;
    }
    return safe;
  } catch {
    return safe;
  }
}
