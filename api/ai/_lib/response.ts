export type NormalizedUsage = {
  remaining?: number;
  limit?: number;
  membership?: string;
  burstRemaining?: number;
  burstLimit?: number;
};

export type NormalizedSuccess<T = any> = {
  ok: true;
  requestId?: string;
  tool: string;
  content: T;
  warnings: string[];
  usage?: NormalizedUsage;
  data: T;
};

export type NormalizedError = {
  ok: false;
  requestId?: string;
  error_code: string;
  errorCode: string;
  legacy_error_code?: string;
  message: string;
  retryable: boolean;
  warnings: string[];
  details?: any;
};

function asNumber(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function usageFromGuard(usage: any): NormalizedUsage | undefined {
  if (!usage) return undefined;
  return {
    remaining: asNumber(usage?.remaining),
    limit: asNumber(usage?.limit),
    membership: typeof usage?.membership === 'string' ? usage.membership : undefined,
    burstRemaining: asNumber(usage?.burstRemaining),
    burstLimit: asNumber(usage?.burstLimit),
  };
}

export function normalizeAiErrorCode(code: string): string {
  const c = String(code || '').toUpperCase();
  switch (c) {
    case 'TIMEOUT':
    case 'AI_TIMEOUT':
      return 'AI_TIMEOUT';
    case 'QUOTA_EXCEEDED':
    case 'USAGE_LIMIT_REACHED':
    case 'RATE_LIMITED':
    case 'AI_LIMIT_REACHED':
      return 'AI_LIMIT_REACHED';
    case 'BAD_REQUEST':
    case 'BAD_JSON':
    case 'INVALID_REQUEST':
    case 'PAYLOAD_TOO_LARGE':
    case 'AI_INVALID_INPUT':
      return 'AI_INVALID_INPUT';
    case 'UNAUTHORIZED':
    case 'AI_AUTH_REQUIRED':
      return 'AI_AUTH_REQUIRED';
    case 'DUPLICATE_REQUEST':
    case 'AI_DUPLICATE_REQUEST':
      return 'AI_DUPLICATE_REQUEST';
    case 'CONFIG_ERROR':
    case 'SERVER_MISCONFIG':
    case 'PROVIDER_RATE_LIMIT':
    case 'INTERNAL_ERROR':
    case 'AI_ERROR':
    case 'SERVICE_UNAVAILABLE':
    case 'USAGE_UNAVAILABLE':
    case 'NOT_CONFIGURED':
    default:
      return 'AI_PROVIDER_UNAVAILABLE';
  }
}

export function normalizedSuccess<T = any>(args: {
  requestId?: string;
  tool: string;
  content: T;
  data?: any;
  usage?: any;
  warnings?: string[];
}): NormalizedSuccess<T> {
  const { requestId, tool, content, data, usage, warnings } = args;
  return {
    ok: true,
    ...(requestId ? { requestId } : {}),
    tool,
    content,
    warnings: Array.isArray(warnings) ? warnings.filter(Boolean) : [],
    ...(usage ? { usage: usageFromGuard(usage) } : {}),
    data: (data === undefined ? content : data) as T,
  };
}

export function normalizedError(args: {
  requestId?: string;
  error_code: string;
  message: string;
  retryable: boolean;
  details?: any;
  warnings?: string[];
}): NormalizedError {
  const { requestId, error_code, message, retryable, details, warnings } = args;
  const normalized = normalizeAiErrorCode(error_code);
  return {
    ok: false,
    ...(requestId ? { requestId } : {}),
    error_code,
    errorCode: normalized,
    ...(normalized !== error_code ? { legacy_error_code: error_code } : {}),
    message,
    retryable: Boolean(retryable),
    warnings: Array.isArray(warnings) ? warnings.filter(Boolean) : [],
    ...(details !== undefined ? { details } : {}),
  };
}

export function extractChatText(result: any): string {
  const t1 = result?.response?.text?.();
  if (typeof t1 === 'string') return t1;
  const parts = result?.candidates?.[0]?.content?.parts;
  const t2 = parts?.map((p: any) => p?.text).filter(Boolean).join('');
  if (typeof t2 === 'string' && t2.trim()) return t2;
  if (typeof result?.text === 'string') return result.text;
  if (typeof result?.output_text === 'string') return result.output_text;
  return '';
}

export function extractImageList(result: any): string[] {
  const direct = result?.generatedImages || result?.images || result?.data;
  if (Array.isArray(direct)) {
    return direct
      .map((item: any) => item?.image?.imageBytes || item?.b64_json || item?.url || item)
      .filter((v: any) => typeof v === 'string' && v.length > 0);
  }
  return [];
}
