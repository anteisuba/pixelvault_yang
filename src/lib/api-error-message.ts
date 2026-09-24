import {
  GENERATION_ERROR_CODES,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'

/** 原话附在提示里时最多带多少字（整段 JSON 糊一屏读不下去）。 */
const GENERATION_ERROR_DETAIL_MAX_CHARS = 240

interface ApiErrorLike {
  error?: string
  errorCode?: string
  i18nKey?: string
  /** See `ParseGenerationErrorCodeOptions.hasReferenceImage`. */
  hasReferenceImage?: boolean
}

type ErrorTranslator = ((
  key: string,
  values?: Record<string, string>,
) => string) & {
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

  /**
   * ⭐ 认不出的原因**把服务商原话说出来**（owner 09-24「失败原因要具体」）：
   * 「暂时无法确定原因」让人无从下手，而原话里通常就写着要做什么。
   */
  const detail = payload.error?.trim()
  // ⚠ 我们自己的程序异常（`TypeError: …`）不是「服务商返回」—— 那种照旧走通用那句。
  const isProgramError = detail
    ? /^(?:TypeError|ReferenceError|SyntaxError|RangeError|Error)\b/.test(
        detail,
      )
    : false
  if (
    detail &&
    !isProgramError &&
    tErrors.has('generation.unknownWithDetail')
  ) {
    return tErrors('generation.unknownWithDetail', {
      detail:
        detail.length > GENERATION_ERROR_DETAIL_MAX_CHARS
          ? `${detail.slice(0, GENERATION_ERROR_DETAIL_MAX_CHARS)}…`
          : detail,
    })
  }

  return tErrors.has('generation.unknown')
    ? tErrors('generation.unknown')
    : fallbackMessage
}
