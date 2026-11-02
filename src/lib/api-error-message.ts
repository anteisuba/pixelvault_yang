import {
  GENERATION_ERROR_CODES,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'
import { BROWSER_NETWORK_FAILURE_RE } from '@/constants/transport-errors'
import { getThrownErrorFields } from '@/lib/api-client/error-fields'

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
 * 这些码说的是**请求本身**出了什么事（断网、登录过期、网关、我们自己的程序），
 * 不是服务商的原因：⛔ 不拿它们的原话去跑 `ERROR_PATTERNS`，也不贴「服务商返回：」。
 */
function isNonProviderCode(errorCode: string | undefined): boolean {
  if (!errorCode) return false
  return (
    errorCode.startsWith('TRANSPORT_') ||
    errorCode === 'CLIENT_ERROR' ||
    errorCode === 'ABORTED' ||
    errorCode === 'UNAUTHORIZED'
  )
}

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
 * 一般接口的失败结果 → 一句话。
 *
 * 只认结构化字段：后端 / api-client 给的 `i18nKey`，否则调用方那句本地化的 fallback。
 * ⛔ 服务端或浏览器的原话（`error`）不进主句（owner 11-02：原话只进「查看详情」）——
 *   中文 / 日文界面上的英文、以及「原话被猜成别的原因」都从这里来。
 *
 * For AI generation failures use {@link getGenerationErrorMessage} instead.
 */
export function getApiErrorMessage(
  tErrors: ErrorTranslator,
  payload: ApiErrorLike,
  fallbackMessage: string,
): string {
  const normalizedKey = normalizeI18nKey(payload.i18nKey)

  if (normalizedKey && canTranslate(tErrors, normalizedKey)) {
    return tErrors(normalizedKey)
  }

  // 还没迁到结构化字段的调用方可能把浏览器原话直接塞进 `error`。
  if (
    payload.error &&
    BROWSER_NETWORK_FAILURE_RE.test(payload.error.trim()) &&
    canTranslate(tErrors, 'transport.network')
  ) {
    return tErrors('transport.network')
  }

  return fallbackMessage
}

/**
 * 一个被 `throw` 出来的东西 → 给人看的一句话（`catch (err)` 用）。
 * 断网 / 前台超时 / 带字段的 `ApiClientError` 按事实说；其余用调用方那句。
 */
export function getThrownErrorMessage(
  tErrors: ErrorTranslator,
  error: unknown,
  fallbackMessage: string,
): string {
  const fields = getThrownErrorFields(error)
  if (fields.errorCode === 'CLIENT_ERROR') return fallbackMessage
  return getApiErrorMessage(tErrors, fields, fallbackMessage)
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

  if (isNonProviderCode(payload.errorCode)) {
    return fallbackMessage
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
