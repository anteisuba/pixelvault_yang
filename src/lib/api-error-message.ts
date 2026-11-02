import {
  GENERATION_ERROR_CODES,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'

/** 原话附在提示里时最多带多少字（整段 JSON 糊一屏读不下去）。 */
const GENERATION_ERROR_DETAIL_MAX_CHARS = 240

/** NovelAI 402 原话：`Not enough Anlas … Required: 20, Available: 7`。 */
const NOVELAI_ANLAS_SHORTFALL_RE =
  /anlas[\s\S]*?required:\s*(\d+)[\s\S]*?available:\s*(\d+)/i

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
 * Priority: backend `i18nKey` → caller's localized fallback, with the raw
 * `error` appended as detail when there is one (never the raw English alone).
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

  return withRawDetail(tErrors, fallbackMessage, payload.error)
}

/** 浏览器自己的网络失败（断网 / CORS / DNS）在各家浏览器里的原话。 */
const BROWSER_NETWORK_FAILURE_RE =
  /^(?:Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|Network request failed)$/i

/** 替身 / 旧调用方的翻译函数可能没有 `has`：当作没翻译。 */
function canTranslate(tErrors: ErrorTranslator, key: string): boolean {
  return typeof tErrors.has === 'function' && tErrors.has(key)
}

/** 我们自己的程序异常（`TypeError: …`）不是给人看的原因。 */
function isProgramErrorText(detail: string): boolean {
  return /^(?:TypeError|ReferenceError|SyntaxError|RangeError|Error)\b/.test(
    detail,
  )
}

/**
 * 本地化的那句（调用方的 fallback）打头，没翻译过的原话放在括号里补充。
 *
 * ⚠ 不再把服务端英文原话**单独**当提示：中文 / 日文界面上整句英文是这一类 bug 的
 *   根（o-errors，2026-11-01）。原话仍然带上 —— owner 09-24「失败原因要具体」。
 */
function withRawDetail(
  tErrors: ErrorTranslator,
  message: string,
  rawDetail: string | undefined,
): string {
  const detail = rawDetail?.trim()
  if (!detail || detail === message || isProgramErrorText(detail)) {
    return message
  }
  if (
    BROWSER_NETWORK_FAILURE_RE.test(detail) &&
    canTranslate(tErrors, 'common.network')
  ) {
    return tErrors('common.network')
  }
  if (!canTranslate(tErrors, 'common.withDetail')) return message
  return tErrors('common.withDetail', {
    message,
    detail:
      detail.length > GENERATION_ERROR_DETAIL_MAX_CHARS
        ? `${detail.slice(0, GENERATION_ERROR_DETAIL_MAX_CHARS)}…`
        : detail,
  })
}

/**
 * 一个被 `throw` 出来的东西 → 给人看的一句话（`catch (err)` 用）。
 * 与 {@link getApiErrorMessage} 同一条规则：本地化 fallback 打头，原话补充。
 */
export function getThrownErrorMessage(
  tErrors: ErrorTranslator,
  error: unknown,
  fallbackMessage: string,
): string {
  return withRawDetail(
    tErrors,
    fallbackMessage,
    error instanceof Error ? error.message : undefined,
  )
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

  // NovelAI 的原话带着「要多少 / 剩多少」——比一句「服务商余额不足」能用得多。
  const anlas = payload.error?.match(NOVELAI_ANLAS_SHORTFALL_RE)
  if (
    code === GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE &&
    anlas?.[1] &&
    anlas[2] &&
    tErrors.has('generation.novelai_anlas_shortfall')
  ) {
    return tErrors('generation.novelai_anlas_shortfall', {
      required: anlas[1],
      available: anlas[2],
    })
  }

  if (
    code === GENERATION_ERROR_CODES.EXECUTION_REQUEST_REJECTED &&
    tErrors.has('generation.execution_request_rejected')
  ) {
    // `Execution worker dispatch failed (400): <worker 原话>` → 只留原话。
    const rejection = (payload.error ?? '').replace(/^[^:]*\(\d{3}\):\s*/, '')
    return tErrors('generation.execution_request_rejected', {
      detail:
        rejection.length > GENERATION_ERROR_DETAIL_MAX_CHARS
          ? `${rejection.slice(0, GENERATION_ERROR_DETAIL_MAX_CHARS)}…`
          : rejection,
    })
  }

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
  const isProgramError = detail ? isProgramErrorText(detail) : false
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
