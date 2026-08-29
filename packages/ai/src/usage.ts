export type AiErrorCategory =
  | 'AUTHENTICATION'
  | 'CONTENT_POLICY'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_UNAVAILABLE'
  | 'QUOTA'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'UNKNOWN';

/** Provider-neutral measurements returned by one external AI request. */
export interface AiUsage {
  /** Total input, including cached input when the provider reports both. */
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly audioSeconds: number | null;
  readonly latencyMs: number;
  readonly requestId: string | null;
}

export function emptyAiUsage(
  latencyMs: number,
  requestId: string | null = null,
): AiUsage {
  return {
    audioSeconds: null,
    cachedInputTokens: null,
    cacheWriteTokens: null,
    inputTokens: null,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    outputTokens: null,
    reasoningTokens: null,
    requestId,
  };
}

export function finiteUsageCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}
