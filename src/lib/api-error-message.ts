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

  // Validation errors carry the specific, actionable reason in `error` (which
  // field or rule failed). Surface it instead of the generic localized
  // "invalid input" string, which hides what the user actually has to fix.
  const isValidationError =
    payload.errorCode === 'VALIDATION_ERROR' ||
    normalizedKey === 'validation.invalidInput'
  if (isValidationError && payload.error) {
    return payload.error
  }

  if (normalizedKey && tErrors.has(normalizedKey)) {
    return tErrors(normalizedKey)
  }

  const code =
    normalizeErrorCode(payload.errorCode) ??
    parseGenerationErrorCode(payload.error ?? '', {
      hasReferenceImage: payload.hasReferenceImage,
    })

  if (code !== GENERATION_ERROR_CODES.UNKNOWN) {
    const generationKey = `generation.${code}`
    if (tErrors.has(generationKey)) {
      const localized = tErrors(generationKey)
      /**
       * 台账 H（owner 2026-08-29 真机）：内容被安全系统拒了的时候，**上游的原话
       * 是唯一能指向真因的信息**，不能被本地化文案整条替换掉。
       *
       * owner 实测：同一批角色设定图，「16岁女生」正常通过，「男子高中生，17岁」
       * 被 Seedream 拒 —— 删掉年龄词后即通过。而 UI 只说「内容被服务商安全系统
       * 过滤」，是哪个词触发的一个字都没有，用户只能瞎猜、甚至会以为是自己写错了。
       *
       * ⚠ **只对这一档这么做**。其余错误码（超时 / 限流 / 余额 / key 无效）的
       * provider 原文是英文技术噪音，本地化文案已经把该说的说完了，附上去只是让
       * 提示变长。内容过滤不一样：它的原文里可能带着被拒的具体理由或分类。
       *
       * ⚠ 原文与本地化文案相同时不重复拼（有的 provider 回的就是一句
       * "content filtered"，那时附上去等于把同一句话说两遍）。
       */
      if (code === GENERATION_ERROR_CODES.CONTENT_FILTERED) {
        const raw = payload.error?.trim()
        if (raw && raw !== localized) return `${localized} — ${raw}`
      }
      return localized
    }
  }

  return payload.error ?? fallbackMessage
}
