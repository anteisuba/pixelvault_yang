import {
  GENERATION_ERROR_CODES,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'

interface ApiErrorLike {
  error?: string
  errorCode?: string
  i18nKey?: string
  /** See `ParseGenerationErrorCodeOptions.hasReferenceImage`. */
  hasReferenceImage?: boolean
}

type ErrorTranslator = ((key: string) => string) & {
  has: (key: string) => boolean
  raw?: (key: string) => unknown
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
 * 3. Localized unknown error, then the caller's generic fallback.
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

  if (
    payload.errorCode === 'VALIDATION_ERROR' &&
    tErrors.has('validation.invalidInput')
  ) {
    return tErrors('validation.invalidInput')
  }

  // Run items may already carry a localized reason from the generation hook.
  if (payload.error && tErrors.raw) {
    for (const namespace of ['generation', 'provider', 'validation']) {
      if (!tErrors.has(namespace)) continue
      const messages = tErrors.raw(namespace)
      if (
        messages &&
        typeof messages === 'object' &&
        Object.values(messages).includes(payload.error)
      ) {
        return payload.error
      }
    }
  }

  const code =
    normalizeErrorCode(payload.errorCode) ??
    parseGenerationErrorCode(payload.error ?? '', {
      hasReferenceImage: payload.hasReferenceImage,
    })

  if (code !== GENERATION_ERROR_CODES.UNKNOWN) {
    const generationKey = `generation.${code}`
    if (tErrors.has(generationKey)) {
      return tErrors(generationKey)
    }
  }

  return tErrors.has('generation.unknown')
    ? tErrors('generation.unknown')
    : fallbackMessage
}
