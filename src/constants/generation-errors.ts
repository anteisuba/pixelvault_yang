export const GENERATION_ERROR_CODES = {
  PROVIDER_TIMEOUT: 'provider_timeout',
  PROVIDER_RATE_LIMIT: 'provider_rate_limit',
  PROVIDER_OVERLOADED: 'provider_overloaded',
  INVALID_API_KEY: 'invalid_api_key',
  CONTENT_FILTERED: 'content_filtered',
  MODEL_UNAVAILABLE: 'model_unavailable',
  PROVIDER_NO_OUTPUT: 'provider_no_output',
  CALLBACK_TIMEOUT: 'callback_timeout',
  STORAGE_UPLOAD_FAILED: 'storage_upload_failed',
  PROVIDER_INSUFFICIENT_BALANCE: 'provider_insufficient_balance',
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  UNSUPPORTED_REFERENCE_IMAGE_FORMAT: 'unsupported_reference_image_format',
  REFERENCE_IMAGE_TOO_LARGE: 'reference_image_too_large',
  REFERENCE_IMAGE_UNREACHABLE: 'reference_image_unreachable',
  REFERENCE_IMAGE_LIMIT_EXCEEDED: 'reference_image_limit_exceeded',
  INVALID_REFERENCE_IMAGE_DIMENSIONS: 'invalid_reference_image_dimensions',
  /**
   * A hosted provider's LoRA loader rejected a community LoRA outright
   * (Replicate delta-lock's `layer ... not supported` / "not in the list of
   * present adapters") — the LoRA itself is fine, the hosted backend just
   * can't load its layer format. Distinct from generic MODEL_UNAVAILABLE so
   * the UI can point the user at a runner-backed model instead of "try
   * again". See docs/references/domains/runner.md.
   */
  LORA_INCOMPATIBLE_HOSTED: 'lora_incompatible_hosted',
  /**
   * Civitai 的作者把这把 LoRA 的下载关了（version 详情的
   * `usageControl` 是 `Generation` / `InternalGeneration` 而不是 `Download`），
   * 权重只能在 Civitai 站内生成时用。`/api/download/models/:id` 对**任何**
   * token 都返 401 `The creator of this asset has disabled downloads on this
   * file` —— 有没有 Civitai token、token 有没有过期，跟这件事完全无关。
   *
   * 单列一个码，是因为它此前被 ERROR_PATTERNS 的通用 `\b401\b` 规则说成
   * INVALID_API_KEY（2026-08-29 owner 真机撞上：Runner 线报「你的 API Key
   * 无效或已过期」，云端 API 线报 `Replicate image generation failed: URL
   * responded with status code: 401` 同样落到 invalid_api_key）。那句话把人
   * 送去查一把根本没坏的 key，而**唯一的出路是换一把 LoRA**。
   */
  LORA_DOWNLOAD_DISABLED: 'lora_download_disabled',
  /** RUNNER's monthly generation budget cap (RUNNER_MONTHLY_LIMIT) was hit. */
  RUNNER_MONTHLY_LIMIT_EXCEEDED: 'runner_monthly_limit_exceeded',
  /** A requested LoRA isn't pre-baked on the runner's Network Volume yet. */
  RUNNER_LORA_UNAVAILABLE: 'runner_lora_unavailable',
  /**
   * RunPod 收下了作业，但没有任何 worker 来跑它 —— 端点零活跃 worker 且作业
   * 从未离开 IN_QUEUE（实测成因：已退出的 worker 仍被计为 ready，占住
   * workersMax 名额；也可能是长时间抢不到 GPU）。
   *
   * 单列一个码而不是复用 PROVIDER_TIMEOUT，是因为这两件事对用户的含义完全
   * 相反：超时值得重试，这个**重试只会再排一次队**，得先有人去看端点。
   * 由 Worker 的轮询僵死探测显式设置（约 3 分钟即判定，不再拖满整个轮询
   * 窗口）。
   */
  RUNNER_QUEUE_STUCK: 'runner_queue_stuck',
  /**
   * 派发不到执行 worker（本地没起 `npm --prefix workers/execution run dev`，
   * 或生产端点不可达）。**跟 provider 无关，也跟参考图无关** —— 请求根本没
   * 离开我们自己的机器。单列一个码，是因为它此前一直被参考图那条规则吃掉。
   */
  EXECUTION_WORKER_UNAVAILABLE: 'execution_worker_unavailable',
  /**
   * Provider 侧**账号自己设的**用量闸被触到，模型服务已被暂停（火山方舟
   * `SetLimitExceeded`：「Your account [...] has reached the set inference
   * limit for the [...] model, and the model service has been paused」）。
   *
   * 单列一个码而不是复用 PROVIDER_RATE_LIMIT，理由和 RUNNER_QUEUE_STUCK 一样：
   * 两者给用户的指示完全相反。限流值得等一会儿再试，**这个等多久都没用** ——
   * 得去 provider 控制台把限额调高或关掉。它走 HTTP 429，不单列就会被通用的
   * 429 规则说成「请求过于频繁，稍后重试」，把人钉在一个永远不会好的重试循环里。
   */
  PROVIDER_ACCOUNT_LIMIT_REACHED: 'provider_account_limit_reached',
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
/**
 * `requiresReferenceImage: true` marks patterns that only mean what they say
 * when the request actually carried a reference image. These regexes match
 * on generic English words (image/size/exceeds/maximum/resolution/pixels…)
 * that providers also use to complain about the OUTPUT image or unrelated
 * request fields — see the EXECUTION_WORKER_UNAVAILABLE comment below for a
 * previously-patched instance of the same failure mode. `parseGenerationErrorCode`
 * skips these entries when the caller knows (`hasReferenceImage: false`) that
 * no reference image was part of the request, instead of asserting "your
 * reference image is broken" about a request that never had one.
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp
  code: GenerationErrorCode
  requiresReferenceImage?: boolean
}> = [
  // Must beat the generic MODEL_UNAVAILABLE ("not found") pattern below —
  // Replicate's delta-lock/noobai-xl throws these exact phrases when a
  // community LoRA's layer format doesn't match its loader.
  {
    pattern:
      /layer\s+\S*\s*not\s+supported|not in the list of present adapters/i,
    code: GENERATION_ERROR_CODES.LORA_INCOMPATIBLE_HOSTED,
  },
  // ⚠ 必须排在所有参考图规则**之前**：本地/生产的执行 worker 派发失败原文是
  // `Execution worker dispatch failed: fetch failed`，尾部的 `fetch failed` 会被
  // UNREACHABLE 的 `fetch.*failed` 吃掉，于是「worker 没起」被显示成「服务商无法
  // 下载这张参考图」—— 一张参考图都没有的时候也照报，把人往完全错误的方向带
  // （owner 2026-08-14 真机撞上；此前已在 memory 里记过一次「文案是假线索」）。
  // `requiresReferenceImage` below generalizes this same fix to the other
  // four reference-image patterns instead of relying solely on ordering.
  {
    pattern: /execution worker|worker dispatch/i,
    code: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
  },
  // ⚠ 也必须排在参考图规则**之前**：火山的原文是
  // `...(429): {"error":{"code":"SetLimitExceeded","message":"Your account
  // [...] has reached the set inference limit for the [...] model..."}}`，
  // 里面同时有 "image"（来自我们自己的 `VolcEngine image generation failed`
  // 前缀）和 "Exceeded"，正好被 TOO_LARGE 的 `image.*?exceeded` 吃掉，于是
  // 账号限额被显示成「参考图文件过大」——一张参考图都没有的时候也照报
  // （owner 2026-08-27 真机撞上，DB 里 errorMessage 原文可查）。
  // ⚠ 这条正则刻意只认 provider 的具体标识（`SetLimitExceeded` / 那句
  // 固定英文），**不是**「含 limit/exceeded 就算」的兜底——那种兜底正是
  // 下面注释里记着的、2026-08-24 被删掉的那条祸根。
  {
    pattern: /SetLimitExceeded|reached the set inference limit/i,
    code: GENERATION_ERROR_CODES.PROVIDER_ACCOUNT_LIMIT_REACHED,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.UNSUPPORTED_FORMAT,
    code: GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT,
    requiresReferenceImage: true,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.TOO_LARGE,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
    requiresReferenceImage: true,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.UNREACHABLE,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE,
    requiresReferenceImage: true,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.LIMIT_EXCEEDED,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_LIMIT_EXCEEDED,
    requiresReferenceImage: true,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.INVALID_DIMENSIONS,
    code: GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS,
    requiresReferenceImage: true,
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
    pattern: /quota.*(?:exhausted|exceeded)|insufficient.*quota/i,
    code: GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE,
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
    pattern:
      /no_media_generated|no media|no output|no image|did not include.*(?:url|image|audio|video)|completed but no result/i,
    code: GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT,
  },
  {
    pattern: /model.*unavailable|not\s*found|\b502\b/i,
    code: GENERATION_ERROR_CODES.MODEL_UNAVAILABLE,
  },
  // ⚠ 这里曾有一条 `/credit|limit\s*reached|quota|exceeded/i` 兜底，把任何含
  // 「exceeded」的消息判成 INSUFFICIENT_CREDITS →「今日免费生成次数已用完」。
  // 2026-08-24 生产上，Runner 的 `exceeded max body size of 10MiB` 和
  // `Worker exceeded memory limit.` 都被它说成了「你没额度了」——而当天全站的免费
  // 额度一次都没用过，Runner 路径根本不经过免费额度闸。别再加回来：
  //   - 真正的免费额度耗尽走的是 backend code `FREE_LIMIT_EXCEEDED`（见下方
  //     BACKEND_ERROR_CODE_MAP），从不依赖消息文本；
  //   - Runner 月度额度用完同理走 `RUNNER_MONTHLY_LIMIT_EXCEEDED`；
  //   - 「exceeded」是英文错误消息里最常见的词之一，用它兜底等于随机说谎。
  // 认不出来就落到 UNKNOWN、显示 provider 原文——难看，但不指向错误的方向。
]

export interface ParseGenerationErrorCodeOptions {
  /**
   * Whether the request that produced this error actually carried a
   * reference image. `false` skips the five reference-image-specific
   * patterns so a generic provider complaint (about the output image, a
   * size/resolution param, or anything else containing those same English
   * words) can't be mislabeled as "your reference image is broken" for a
   * request that never had one. Omit when unknown — the patterns still
   * apply, matching prior behavior.
   */
  hasReferenceImage?: boolean
}

export function parseGenerationErrorCode(
  errorMessage: string,
  options?: ParseGenerationErrorCodeOptions,
): GenerationErrorCode {
  for (const { pattern, code, requiresReferenceImage } of ERROR_PATTERNS) {
    if (requiresReferenceImage && options?.hasReferenceImage === false) {
      continue
    }
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
  CALLBACK_TIMEOUT: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
  STORAGE_UPLOAD_FAILED: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
  PROVIDER_NO_OUTPUT: GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT,
  RUNNER_MONTHLY_LIMIT_EXCEEDED:
    GENERATION_ERROR_CODES.RUNNER_MONTHLY_LIMIT_EXCEEDED,
  RUNNER_LORA_UNAVAILABLE: GENERATION_ERROR_CODES.RUNNER_LORA_UNAVAILABLE,
  LORA_DOWNLOAD_DISABLED: GENERATION_ERROR_CODES.LORA_DOWNLOAD_DISABLED,
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

/**
 * Maps an already-resolved error code to its i18n key. Split out of
 * `getGenerationErrorI18nKey` so a caller that already has a trustworthy
 * `errorCode` (e.g. one computed with `parseGenerationErrorCode` plus
 * `hasReferenceImage` context) can resolve the matching i18n key without
 * re-parsing the raw message a second time through the context-blind
 * default patterns.
 */
export function getGenerationErrorI18nKeyForCode(
  errorCode: GenerationErrorCode,
  errorMessage: string,
): string | null {
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
  if (errorCode === GENERATION_ERROR_CODES.PROVIDER_ACCOUNT_LIMIT_REACHED) {
    return 'errors.provider.accountLimitReached'
  }
  if (errorCode === GENERATION_ERROR_CODES.LORA_INCOMPATIBLE_HOSTED) {
    return 'errors.provider.loraIncompatibleHosted'
  }
  if (errorCode === GENERATION_ERROR_CODES.LORA_DOWNLOAD_DISABLED) {
    return 'errors.provider.loraDownloadDisabled'
  }
  if (errorCode === GENERATION_ERROR_CODES.RUNNER_MONTHLY_LIMIT_EXCEEDED) {
    return 'errors.provider.runnerMonthlyLimitExceeded'
  }
  if (errorCode === GENERATION_ERROR_CODES.RUNNER_LORA_UNAVAILABLE) {
    return 'errors.provider.runnerLoraUnavailable'
  }
  if (errorCode === GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT) {
    return 'errors.provider.noOutput'
  }
  if (errorCode === GENERATION_ERROR_CODES.CALLBACK_TIMEOUT) {
    return 'errors.provider.callbackTimeout'
  }
  if (errorCode === GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED) {
    return 'errors.provider.storageUploadFailed'
  }

  return null
}

export function getGenerationErrorI18nKey(
  errorMessage: string,
  options?: ParseGenerationErrorCodeOptions,
): string | null {
  const errorCode = parseGenerationErrorCode(errorMessage, options)
  return getGenerationErrorI18nKeyForCode(errorCode, errorMessage)
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
