export const GENERATION_ERROR_CODES = {
  PROVIDER_TIMEOUT: 'provider_timeout',
  PROVIDER_RATE_LIMIT: 'provider_rate_limit',
  PROVIDER_OVERLOADED: 'provider_overloaded',
  INVALID_API_KEY: 'invalid_api_key',
  CONTENT_FILTERED: 'content_filtered',
  MODEL_UNAVAILABLE: 'model_unavailable',
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  UNKNOWN: 'unknown',
} as const

export type GenerationErrorCode =
  (typeof GENERATION_ERROR_CODES)[keyof typeof GENERATION_ERROR_CODES]

// Order matters — first match wins. Capacity / 503 phrases must beat the
// generic "api key" word so a message like "This is not an API key error"
// doesn't get classified as INVALID_API_KEY. Likewise, the api-key regex
// requires an "invalid/expired/missing" qualifier so casual mentions of
// the term don't trigger.
const ERROR_PATTERNS: Array<{ pattern: RegExp; code: GenerationErrorCode }> = [
  {
    pattern: /timeout|timed?\s*out/i,
    code: GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
  },
  {
    pattern:
      /high demand|spike(?:s)?\s+in\s+demand|at capacity|overloaded|UNAVAILABLE|\b503\b/i,
    code: GENERATION_ERROR_CODES.PROVIDER_OVERLOADED,
  },
  {
    pattern: /rate\s*limit|too many requests|\b429\b/i,
    code: GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
  },
  {
    pattern:
      /(?:invalid|expired|missing|not\s+set).*api[\s-]?key|unauthorized|\b401\b/i,
    code: GENERATION_ERROR_CODES.INVALID_API_KEY,
  },
  {
    pattern: /content.*filter|safety|nsfw|blocked|moderation/i,
    code: GENERATION_ERROR_CODES.CONTENT_FILTERED,
  },
  {
    pattern: /model.*unavailable|not\s*found|\b502\b/i,
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
