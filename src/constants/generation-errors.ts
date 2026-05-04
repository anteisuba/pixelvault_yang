export const GENERATION_ERROR_CODES = {
  PROVIDER_TIMEOUT: 'provider_timeout',
  PROVIDER_RATE_LIMIT: 'provider_rate_limit',
  INVALID_API_KEY: 'invalid_api_key',
  CONTENT_FILTERED: 'content_filtered',
  MODEL_UNAVAILABLE: 'model_unavailable',
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  UNKNOWN: 'unknown',
} as const

export type GenerationErrorCode =
  (typeof GENERATION_ERROR_CODES)[keyof typeof GENERATION_ERROR_CODES]

const ERROR_PATTERNS: Array<{ pattern: RegExp; code: GenerationErrorCode }> = [
  {
    pattern: /timeout|timed?\s*out/i,
    code: GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
  },
  {
    pattern: /rate\s*limit|too many requests|429/i,
    code: GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
  },
  {
    pattern: /api\s*key|unauthorized|invalid.*key|401/i,
    code: GENERATION_ERROR_CODES.INVALID_API_KEY,
  },
  {
    pattern: /content.*filter|safety|nsfw|blocked|moderation/i,
    code: GENERATION_ERROR_CODES.CONTENT_FILTERED,
  },
  {
    pattern: /model.*unavailable|not\s*found|503|502/i,
    code: GENERATION_ERROR_CODES.MODEL_UNAVAILABLE,
  },
  {
    pattern: /credit|limit\s*reached|quota|exceeded/i,
    code: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
  },
]

export function parseGenerationErrorCode(
  errorMessage: string,
): GenerationErrorCode {
  for (const { pattern, code } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return code
    }
  }
  return GENERATION_ERROR_CODES.UNKNOWN
}
