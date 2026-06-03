import {
  GENERATION_ERROR_CODES,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'

interface ApiErrorLike {
  error?: string
  errorCode?: string
  i18nKey?: string
}

type ErrorTranslator = ((key: string) => string) & {
  has: (key: string) => boolean
}

function normalizeI18nKey(i18nKey?: string): string | null {
  if (!i18nKey) {
    return null
  }

  return i18nKey.startsWith('errors.')
    ? i18nKey.slice('errors.'.length)
    : i18nKey
}

/**
 * Resolve a generic API error payload into a human-readable message.
 *
 * Priority: backend `i18nKey` → raw `error` → caller fallback.
 *
 * For AI generation failures use {@link getGenerationErrorMessage} instead —
 * it adds error-code classification. Do NOT add that classification here:
 * generic payloads (downloads, profile updates) carry raw messages like
 * "Upstream returned 502" that would be misclassified as generation errors.
 */
export function getApiErrorMessage(
  tErrors: ErrorTranslator,
  payload: ApiErrorLike,
  fallbackMessage: string,
): string {
  const normalizedKey = normalizeI18nKey(payload.i18nKey)

  if (normalizedKey && tErrors.has(normalizedKey)) {
    return tErrors(normalizedKey)
  }

  return payload.error ?? fallbackMessage
}

/**
 * Resolve an AI generation error payload into a specific, localized reason.
 *
 * Priority:
 * 1. Backend `i18nKey` — most specific (e.g. a provider-aware reference-image
 *    message).
 * 2. Error-code classification — map `errorCode` (or, when it carries no
 *    specific classification, parse the raw provider message) to
 *    `Errors.generation.{code}`.
 * 3. Raw provider `error` string, then the caller's generic fallback.
 *
 * Only use this in generation flows: step 2's message parsing would
 * misclassify unrelated errors (a download "502" as `model_unavailable`).
 */
export function getGenerationErrorMessage(
  tErrors: ErrorTranslator,
  payload: ApiErrorLike,
  fallbackMessage: string,
): string {
  const normalizedKey = normalizeI18nKey(payload.i18nKey)

  if (normalizedKey && tErrors.has(normalizedKey)) {
    return tErrors(normalizedKey)
  }

  const code =
    normalizeErrorCode(payload.errorCode) ??
    parseGenerationErrorCode(payload.error ?? '')

  if (code !== GENERATION_ERROR_CODES.UNKNOWN) {
    const generationKey = `generation.${code}`
    if (tErrors.has(generationKey)) {
      return tErrors(generationKey)
    }
  }

  return payload.error ?? fallbackMessage
}
