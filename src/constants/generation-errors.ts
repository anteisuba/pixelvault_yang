export const GENERATION_ERROR_CODES = {
  PROVIDER_TIMEOUT: 'provider_timeout',
  PROVIDER_RATE_LIMIT: 'provider_rate_limit',
  PROVIDER_OVERLOADED: 'provider_overloaded',
  INVALID_API_KEY: 'invalid_api_key',
  CONTENT_FILTERED: 'content_filtered',
  MODEL_UNAVAILABLE: 'model_unavailable',
  PROVIDER_INSUFFICIENT_BALANCE: 'provider_insufficient_balance',
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  UNSUPPORTED_REFERENCE_IMAGE_FORMAT: 'unsupported_reference_image_format',
  REFERENCE_IMAGE_TOO_LARGE: 'reference_image_too_large',
  REFERENCE_IMAGE_UNREACHABLE: 'reference_image_unreachable',
  REFERENCE_IMAGE_LIMIT_EXCEEDED: 'reference_image_limit_exceeded',
  INVALID_REFERENCE_IMAGE_DIMENSIONS: 'invalid_reference_image_dimensions',
  UNKNOWN: 'unknown',
} as const

export type GenerationErrorCode =
  (typeof GENERATION_ERROR_CODES)[keyof typeof GENERATION_ERROR_CODES]

export const REFERENCE_IMAGE_ERROR_PATTERNS = {
  UNSUPPORTED_FORMAT:
    /unsupported_file_mimetype|unsupported\s+(?:mime|mimetype|file|image|format)|unsupported.*image\/|invalid\s+(?:mime|mimetype|file type|image format)|supported file formats|only.*(?:jpeg|jpg|png|webp|gif|heic|heif)|image\/avif|\.avif/i,
  TOO_LARGE:
    /(?:file|image|payload).*?(?:too large|exceeds?|exceeded|maximum|max)|less than \d+\s?mb|no more than \d+\s?mb|size.*limit/i,
  UNREACHABLE:
    /failed to download|could not download|unable to download|download.*failed|not accessible|direct download|directly viewable|invalid.*url|url.*invalid|could not fetch|fetch.*failed/i,
  LIMIT_EXCEEDED:
    /too many (?:images|files)|up to \d+ images|maximum.*(?:images|files)|must not exceed \d+|input.*output.*(?:exceed|limit)/i,
  INVALID_DIMENSIONS:
    /dimension|width|height|aspect ratio|resolution|pixels|same dimensions|match.*resolution|must match/i,
} as const

const PROVIDER_REFERENCE_FORMAT_GUIDANCE: Array<{
  providerPattern: RegExp
  i18nKey: string
  fallbackMessage: string
}> = [
  {
    providerPattern: /openai/i,
    i18nKey: 'errors.provider.unsupportedOpenAiReferenceImage',
    fallbackMessage:
      'OpenAI accepts JPEG, PNG, or WebP reference images. Convert the image and try again.',
  },
  {
    providerPattern: /gemini|google/i,
    i18nKey: 'errors.provider.unsupportedGeminiReferenceImage',
    fallbackMessage:
      'Gemini accepts PNG, JPEG, WebP, HEIC, or HEIF reference images. Convert the image and try again.',
  },
  {
    providerPattern: /fal/i,
    i18nKey: 'errors.provider.unsupportedFalReferenceImage',
    fallbackMessage:
      'fal.ai could not read this reference image. Use PNG, JPEG, WebP, or GIF, and make sure the image URL is directly accessible.',
  },
  {
    providerPattern: /volcengine|seedream|doubao|bytedance|byteplus/i,
    i18nKey: 'errors.provider.unsupportedVolcengineReferenceImage',
    fallbackMessage:
      'Seedream could not read this reference image. Use a common format such as JPEG, PNG, or WebP, and make sure the URL is directly accessible.',
  },
]

// Order matters — first match wins. Capacity / 503 phrases must beat the
// generic "api key" word so a message like "This is not an API key error"
// doesn't get classified as INVALID_API_KEY. Likewise, the api-key regex
// requires an "invalid/expired/missing" qualifier so casual mentions of
// the term don't trigger.
const ERROR_PATTERNS: Array<{ pattern: RegExp; code: GenerationErrorCode }> = [
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.UNSUPPORTED_FORMAT,
    code: GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.TOO_LARGE,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.UNREACHABLE,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.LIMIT_EXCEEDED,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_LIMIT_EXCEEDED,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.INVALID_DIMENSIONS,
    code: GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS,
  },
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
      /exhausted\s+balance|top\s+up.*balance|billing|payment|insufficient.*(?:balance|credits?)|余额不足|余额已耗尽|充值/i,
    code: GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE,
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

// Server-side `GenerationError` subclasses and legacy service errors use
// SCREAMING_SNAKE codes (PROVIDER_TIMEOUT, RATE_LIMIT_EXCEEDED…); the client
// classification dictionary uses the lower-case GENERATION_ERROR_CODES. This
// bridges the two so the UI can resolve a friendly reason from the payload's
// errorCode without re-parsing the message string.
const BACKEND_ERROR_CODE_MAP: Record<string, GenerationErrorCode> = {
  PROVIDER_TIMEOUT: GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
  RATE_LIMIT_EXCEEDED: GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
  SAFETY_FILTER_BLOCKED: GENERATION_ERROR_CODES.CONTENT_FILTERED,
  FREE_LIMIT_EXCEEDED: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
  INVALID_API_KEY: GENERATION_ERROR_CODES.INVALID_API_KEY,
  MISSING_API_KEY: GENERATION_ERROR_CODES.INVALID_API_KEY,
  UNSUPPORTED_MODEL: GENERATION_ERROR_CODES.MODEL_UNAVAILABLE,
}

const GENERATION_ERROR_CODE_VALUES = new Set<string>(
  Object.values(GENERATION_ERROR_CODES),
)

/**
 * Normalize an error code from any source into a client `GenerationErrorCode`.
 *
 * Returns `null` for codes that carry no specific classification (e.g. the
 * generic `PROVIDER_ERROR`, `VALIDATION_ERROR`) so the caller can fall back to
 * `parseGenerationErrorCode(message)` and recover a finer reason from the
 * provider's raw error text.
 */
export function normalizeErrorCode(
  code?: string | null,
): GenerationErrorCode | null {
  if (!code) {
    return null
  }
  if (GENERATION_ERROR_CODE_VALUES.has(code)) {
    return code as GenerationErrorCode
  }
  return BACKEND_ERROR_CODE_MAP[code] ?? null
}

function getUnsupportedReferenceImageI18nKey(errorMessage: string): string {
  const providerGuidance = PROVIDER_REFERENCE_FORMAT_GUIDANCE.find((guidance) =>
    guidance.providerPattern.test(errorMessage),
  )

  return (
    providerGuidance?.i18nKey ?? 'errors.provider.unsupportedReferenceImage'
  )
}

export function getGenerationErrorI18nKey(errorMessage: string): string | null {
  const errorCode = parseGenerationErrorCode(errorMessage)

  if (errorCode === GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT) {
    return getUnsupportedReferenceImageI18nKey(errorMessage)
  }
  if (errorCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE) {
    return 'errors.provider.referenceImageTooLarge'
  }
  if (errorCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE) {
    return 'errors.provider.referenceImageUnreachable'
  }
  if (errorCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_LIMIT_EXCEEDED) {
    return 'errors.provider.referenceImageLimitExceeded'
  }
  if (errorCode === GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS) {
    return 'errors.provider.invalidReferenceImageDimensions'
  }
  if (errorCode === GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE) {
    return 'errors.provider.insufficientBalance'
  }

  return null
}

export function getUnsupportedReferenceImageMessage(provider: string): string {
  const providerGuidance = PROVIDER_REFERENCE_FORMAT_GUIDANCE.find((guidance) =>
    guidance.providerPattern.test(provider),
  )

  return (
    providerGuidance?.fallbackMessage ??
    'This model could not read the reference image format. Use JPEG, PNG, or WebP, then try again.'
  )
}
