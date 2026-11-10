import 'server-only'

/** 共用底座：类型、响应 schema、用量、错误归类、传输（fetch / SSE）、路由解析、图片预处理。⛔ 不 import 任何一家 provider 文件。（o-llm 拆分，2026-11-01；见 docs/design/llm.md） */

import { type AssistantReasoningEffort } from '@/constants/assistant-persona'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { z } from 'zod'
import {
  ASSISTANT_PROVIDER_ORDER,
  ASSISTANT_IMAGE_LIMITS,
} from '@/constants/assistant'
import {
  LLM_TEXT_MODEL_IDS,
  AI_PROVIDER_ENDPOINTS,
  LLM_TEXT_TIMEOUTS_MS,
} from '@/constants/config'
import { ApiRequestError } from '@/lib/errors'
import { isGifImageUrl, isGifMimeType } from '@/lib/gif-image'
import { logger } from '@/lib/logger'
import { getRequestTimeLeftMs } from '@/lib/request-deadline'
import { isSvgImageUrl, isSvgMimeType } from '@/lib/svg-image'
import {
  parseGenerationErrorCode,
  GENERATION_ERROR_CODES,
} from '@/constants/generation-errors'
import { VIDEO_ANALYSIS_UNREACHABLE_ERROR } from '@/constants/video-analysis'
import { routeThroughAiGateway } from '@/lib/ai-gateway'
import { db } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { fetchAsBuffer } from '@/services/storage/r2'
import { validatePrompt } from '@/services/kernel/prompt-guard'

// ─── Types ───────────────────────────────────────────────────────

/**
 * 视频输入的两个便宜旋钮（§4.3.1，🔬 实测：裁 1 分钟 = 全片的 5%，
 * `fps: 0.2` = 42%）。偏移量单位是**秒**，序列化成 Gemini 要的 `"60s"`。
 *
 * v1 不拧（默认全片默认帧率），但通道现在就是通的 —— 「先降级再问」接上去时
 * 不需要再改一次管线。
 */
export interface VideoAnalysisWindow {
  /** 采样帧率。省略 = provider 默认。 */
  fps?: number
  /** 裁剪窗起点（秒）。 */
  startOffset?: number
  /** 裁剪窗终点（秒）。 */
  endOffset?: number
}

export interface LlmTextInput {
  systemPrompt: string
  userPrompt: string
  signal?: AbortSignal
  /**
   * Optional bounded override for callers that compose structured context
   * around user messages. Injection checks still run; only the length ceiling
   * changes from the generic prompt default.
   */
  promptGuardMaxLength?: number | null
  /** Optional per-call model override for specialized LLM tasks. */
  modelId?: string
  /** Optional per-call token budget. */
  maxTokens?: number
  /** Omit app-level output caps and let the selected model apply its own limit. */
  providerManagedOutput?: boolean
  /** Request strict JSON where the provider supports it. */
  responseFormat?: 'json_object'
  /**
   * JSON Schema for adapters with native structured outputs (Anthropic
   * `output_config.format`). It must already fit that API's subset: every
   * object `additionalProperties: false`, no `minLength` / `maxLength` /
   * `minimum` / `maximum`, no recursion. Other adapters ignore it.
   */
  jsonSchema?: Record<string, unknown>
  /**
   * Image input(s) for multimodal completion. Each entry may be either a
   * `data:` URL or an `http(s)` URL — the implementation normalizes per
   * provider:
   *  - Gemini: requires inline base64, so any http(s) URL is fetched
   *    server-side via `fetchAsBuffer` (which guards against SSRF).
   *  - OpenAI: fetches remote images server-side and sends inline data URLs.
   *  - DeepSeek vision and Grok forward either form in `image_url.url`.
   */
  imageData?: string | string[]
  /**
   * One short label per `imageData` entry, sent as a text part right before
   * that image. Without labels several images arrive as an unnamed row and a
   * model can read a reference as the result it was asked to judge
   * (2026-10-09: a black-robe result was faulted for the green uniform in its
   * reference).
   */
  imageLabels?: string[]
  /**
   * OpenAI `detail` for every image part. The assistant's critique asks for
   * `high`: a 3×3 storyboard at the default size leaves each face a few pixels
   * wide, and "who looks into the camera" goes unseen (2026-10-09 T20).
   */
  imageDetail?: 'high'
  /**
   * 助手的思考档位（输入区「思考」chip）。只有助手主循环传；缺席 = 各家照旧。
   * OpenAI 官方 / Grok 的 `reasoning_effort`、Claude 的 `output_config.effort`、
   * Gemini 的 `thinkingLevel` 都是同名三档；DeepSeek 按 `ASSISTANT_DEEPSEEK_EFFORTS` 换。
   */
  reasoningEffort?: AssistantReasoningEffort
  /**
   * Groups requests that share a long prefix (the same system prompt and
   * conversation) so the provider routes them to the same prompt cache —
   * OpenAI `prompt_cache_key`. A day of assistant calls hit the cache on only
   * 15% of input tokens (2026-10-09).
   */
  cacheKey?: string
  /**
   * Native video inputs. Currently supported only by the Gemini branch.
   *
   * Entries may be a `data:` URL, an `http(s)` URL to a video file, or a
   * **YouTube page URL** — the classifier in `lib/video-link.ts` decides which
   * of those it is; see `toGeminiVideoPart`.
   */
  videoData?: string | string[]
  audioData?: string[]
  /**
   * Per-call cost lever for video input (§4.3.1). Omit for v1 default =
   * whole video at the provider's default frame rate.
   */
  videoAnalysis?: VideoAnalysisWindow
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
  /**
   * provider 每报一次 usage 就回调一次（流式可能多次，以最后一次为准）。
   * ⚠ 只给日志用：回调里不许抛、不许影响这次调用。
   */
  onUsage?: (usage: LlmTextUsage) => void
  /**
   * 这次调用是干什么的（进 `llm call` 那行日志，按它汇总各功能的 token 花费）。
   * 缺席记 `unspecified` —— 新调用方请带上，例：`'prompt-enhance'`、`'character-tidy'`。
   */
  purpose?: string
}

export interface ResolvedLlmTextRoute {
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
}

// ─── Usage（只进日志，不参与任何判断） ────────────────────────────

/**
 * provider 自报的单次调用 token 数（助手花费排查，2026-10-08）。
 *
 * - `inputTokens`：整个输入，含命中缓存的那部分（Claude 的三段相加，与另外几家同口径）；
 *   `cachedInputTokens` 是其中命中缓存的数，`cacheWriteTokens` 是这一次新写进缓存的数（只有
 *   Claude 这类显式断点的厂商报；查「断点打对了没有」看它与下一次的 `cachedInputTokens`）。
 * - `outputTokens` / `reasoningTokens` 照各家原字段抄，⛔ 不换算：Gemini 的
 *   `candidatesTokenCount` 不含思考，思考另在 `thoughtsTokenCount`；OpenAI 兼容三家的
 *   `reasoning_tokens` 是否已含在 `completion_tokens` 里，以各家文档为准。
 * - 字段缺 = 这家这次没报，⛔ 不当 0。OpenAI 流式只在官方端点开了 `include_usage`；自填代理报不出来。
 */
export interface LlmTextUsage {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  cacheWriteTokens?: number
}

/** 解析失败 / 没有 usage 一律返回 null —— usage 的形状再怪也不能弄坏正文。 */
export function compactUsage(
  usage: Record<keyof LlmTextUsage, number | null | undefined>,
): LlmTextUsage | null {
  const entries = Object.entries(usage).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  )
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

const OpenAiCompatibleUsageSchema = z.object({
  usage: z.object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    /** DeepSeek 的缓存命中数。 */
    prompt_cache_hit_tokens: z.number().nullish(),
    prompt_tokens_details: z
      .object({ cached_tokens: z.number().nullish() })
      .nullish(),
    completion_tokens_details: z
      .object({ reasoning_tokens: z.number().nullish() })
      .nullish(),
  }),
})

export function readOpenAiCompatibleUsage(value: unknown): LlmTextUsage | null {
  const parsed = OpenAiCompatibleUsageSchema.safeParse(value)
  if (!parsed.success) return null
  const { usage } = parsed.data
  return compactUsage({
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
    cachedInputTokens:
      usage.prompt_tokens_details?.cached_tokens ??
      usage.prompt_cache_hit_tokens,
    cacheWriteTokens: null,
  })
}

export function reportUsage(
  input: LlmTextInput,
  usage: LlmTextUsage | null,
): void {
  if (usage) input.onUsage?.(usage)
}

// ─── LLM Text Models ────────────────────────────────────────────

/**
 * Text-capable LLM adapter types —— **就是 `ASSISTANT_PROVIDER_ORDER`**（owner 2026-10-15：
 * 一份顺序）。这里只用来判「这把 key 能不能做文本」；挑哪一家归 `resolveAssistantRoute`。
 */
export const LLM_TEXT_ADAPTERS = ASSISTANT_PROVIDER_ORDER

export type LlmTextAdapterType = (typeof LLM_TEXT_ADAPTERS)[number]

export function isLlmTextAdapter(t: AI_ADAPTER_TYPES): t is LlmTextAdapterType {
  return (LLM_TEXT_ADAPTERS as readonly AI_ADAPTER_TYPES[]).includes(t)
}

export const LLM_TEXT_MODELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: LLM_TEXT_MODEL_IDS.GEMINI_3_5_FLASH_LITE,
  [AI_ADAPTER_TYPES.DEEPSEEK]: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
  [AI_ADAPTER_TYPES.OPENAI]: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
  [AI_ADAPTER_TYPES.ANTHROPIC]: LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5,
  [AI_ADAPTER_TYPES.XAI]: LLM_TEXT_MODEL_IDS.XAI_GROK_4_7,
}

export const LLM_TEXT_LABELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: 'Gemini',
  [AI_ADAPTER_TYPES.DEEPSEEK]: 'DeepSeek',
  [AI_ADAPTER_TYPES.OPENAI]: 'OpenAI',
  [AI_ADAPTER_TYPES.ANTHROPIC]: 'Claude',
  [AI_ADAPTER_TYPES.XAI]: 'Grok',
}

/** "Gemini, DeepSeek, …, or Grok" — derived so route errors can't drift from the list. */
const LLM_TEXT_PROVIDER_NAMES = new Intl.ListFormat('en', {
  type: 'disjunction',
}).format(LLM_TEXT_ADAPTERS.map((adapterType) => LLM_TEXT_LABELS[adapterType]))

export const LLM_TEXT_PROVIDER_HTTP_STATUS = {
  invalidRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  paymentRequired: 402,
  rateLimited: 429,
  temporarilyUnavailable: 503,
  upstreamFailure: 502,
  gatewayTimeout: 504,
  requestTooLarge: 413,
} as const

export const LLM_TEXT_PROVIDER_ERROR_CODES = {
  authFailed: 'PROVIDER_AUTH_FAILED',
  insufficientBalance: 'PROVIDER_INSUFFICIENT_BALANCE',
  rateLimited: 'PROVIDER_RATE_LIMITED',
  temporarilyUnavailable: 'PROVIDER_TRANSIENT',
  failed: 'PROVIDER_ERROR',
  /** Completion budget used up (often by reasoning) before any visible text. */
  outputBudgetExhausted: 'PROVIDER_OUTPUT_BUDGET_EXHAUSTED',
  /** The provider rejected the request because its input context was too long. */
  contextLimitExceeded: 'PROVIDER_CONTEXT_LIMIT_EXCEEDED',
  requestTooLarge: 'PROVIDER_REQUEST_TOO_LARGE',
  /**
   * **我们自己**等到这次请求的时间上限先停下（`getLlmTextCompletionTimeoutMs`，赶在平台杀函数之前）。
   * ⚠ 码名沿用历史值，但它不是厂商超时：文案说「等了多久没回完」，⛔ 别说成「提供商超时」。
   */
  timeout: 'PROVIDER_TIMEOUT',
  /** 厂商 / 网关**自己**报的超时（HTTP 408 / 504 / 524，或原话写着 timed out）。 */
  upstreamTimeout: 'PROVIDER_UPSTREAM_TIMEOUT',
  /** 连不上厂商，或连接中途断了（fetch failed / ECONNRESET / 连接被关）。不是 key 的问题。 */
  unreachable: 'PROVIDER_UNREACHABLE',
  /**
   * The provider's safety classifiers declined the request (Claude Fable 5.1:
   * HTTP 200 + `stop_reason: 'refusal'`, even after the server-side fallback
   * chain). Retrying the same prompt won't help.
   */
  refused: 'PROVIDER_REFUSED',
} as const

export const LLM_TEXT_PROVIDER_ERROR_I18N_KEYS = {
  authFailed: 'errors.provider.invalidApiKey',
  insufficientBalance: 'errors.provider.insufficientBalance',
  rateLimited: 'errors.provider.rateLimited',
  temporarilyUnavailable: 'errors.provider.temporarilyUnavailable',
  failed: 'errors.provider.failed',
  outputBudgetExhausted: 'errors.provider.outputBudgetExhausted',
  contextLimitExceeded: 'errors.provider.contextLimitExceeded',
  requestTooLarge: 'errors.provider.requestTooLarge',
  timeout: 'errors.provider.waitLimitReached',
  upstreamTimeout: 'errors.provider.upstreamTimeout',
  unreachable: 'errors.provider.unreachable',
  refused: 'errors.provider.refused',
} as const

export const LLM_TEXT_PROVIDER_ERROR_MESSAGES = {
  authFailed:
    'The selected Agent Key is invalid or no longer authorized. Reconfigure it or choose another Agent Key.',
  insufficientBalance:
    'The selected Agent Key has insufficient provider balance. Recharge it or choose another Agent Key.',
  rateLimited:
    'The selected planner route is rate limited. Wait a moment or choose another Agent Key.',
  temporarilyUnavailable:
    'The selected planner model is temporarily unavailable. Try again in a moment or choose another Agent Key.',
  failed:
    'The selected planner provider rejected the request. Try another Agent Key.',
  outputBudgetExhausted:
    'This reasoning model used up its output budget before writing a reply. Retry, switch to a non-reasoning model (e.g. Gemini or DeepSeek), or shorten the prompt.',
  contextLimitExceeded:
    'The selected model rejected the input because its context window was exceeded. ANTEI already compacted older history and retried once; start a new conversation or remove large references.',
  requestTooLarge:
    "The request exceeds this provider's size limit. Reduce the number or size of attachments, or shorten the text.",
  timeout:
    'The model did not finish within the time limit of this request, so we stopped it. Retry with a lower reasoning effort, shorter input, or a faster model.',
  upstreamTimeout:
    'The provider timed out on its own side (it did not finish within its own limit). This is not a key or settings problem; retry later or switch models.',
  unreachable:
    'Could not reach the provider, or the connection dropped mid-way. This is not a key problem; retry in a moment.',
  refused:
    'The selected model declined this request under its content policy. Rephrase the request or choose another Agent Key.',
} as const

const LLM_TEXT_CONTEXT_LIMIT_PATTERNS = [
  /maximum context length/i,
  /context (?:length|window).*(?:exceed|too (?:large|long)|maximum)/i,
  /(?:exceed|too (?:large|long)|maximum).*context (?:length|window)/i,
  /input token count.*(?:exceed|maximum|too (?:large|long))/i,
  /too many input tokens/i,
  /prompt (?:is )?too long/i,
  /maximum input (?:length|tokens?)/i,
  /range of input length/i,
] as const

function containsContextLimitMessage(value: string): boolean {
  return LLM_TEXT_CONTEXT_LIMIT_PATTERNS.some((pattern) => pattern.test(value))
}

function stringifyClassificationData(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function getErrorClassificationText(error: unknown): string {
  if (error instanceof Error) {
    const errorRecord = error as Error & {
      cause?: unknown
      responseBody?: unknown
      data?: unknown
    }
    const cause = errorRecord.cause
    const responseBody =
      typeof errorRecord.responseBody === 'string'
        ? errorRecord.responseBody
        : ''
    const data = stringifyClassificationData(errorRecord.data)
    return `${error.name} ${error.message} ${responseBody} ${data} ${
      cause && cause !== error ? getErrorClassificationText(cause) : ''
    }`
  }
  if (error && typeof error === 'object') {
    const record = error as { responseBody?: unknown; message?: unknown }
    return [record.message, record.responseBody]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
  }
  return typeof error === 'string' ? error : ''
}

export function isLlmTextContextLimitError(error: unknown): boolean {
  if (
    error instanceof ApiRequestError &&
    error.errorCode === LLM_TEXT_PROVIDER_ERROR_CODES.contextLimitExceeded
  ) {
    return true
  }

  return containsContextLimitMessage(getErrorClassificationText(error))
}

const LLM_TEXT_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
])

/** 厂商 / 网关自己报超时的状态码：408 请求超时 · 504 网关超时 · 524 Cloudflare 源站超时。 */
const LLM_TEXT_UPSTREAM_TIMEOUT_STATUSES: ReadonlySet<number> = new Set([
  408, 504, 524,
])

/**
 * 连接层断了（fetch failed / ECONNRESET / 流读到一半 `terminated`…）—— 没拿到 provider 的
 * 完整答复。AI SDK 把连不上包成 `APICallError('Cannot connect to API: …')`、不带状态码。
 */
export function isLlmTextNetworkError(error: unknown): boolean {
  if (!(error instanceof Error) || error instanceof ApiRequestError)
    return false
  if (isAbortError(error)) return false
  const cause = (error as Error & { cause?: unknown }).cause
  const code =
    (error as Error & { code?: unknown }).code ??
    (cause && typeof cause === 'object'
      ? (cause as { code?: unknown }).code
      : undefined)
  if (typeof code === 'string' && LLM_TEXT_NETWORK_ERROR_CODES.has(code)) {
    return true
  }
  if (/^Cannot connect to API\b/.test(error.message)) return true
  return (
    error.name === 'TypeError' &&
    /fetch failed|^terminated$/i.test(error.message)
  )
}

/**
 * 不带状态码、但厂商原话写着超时（流里的 error 事件、网关回的说明）：同 408 / 504 归一类。
 * ⚠ 调用方先排除自己的 abort 与连接层错误（`isAbortError` / `isLlmTextNetworkError`），
 *   剩下的「timeout」字样才是厂商说的。
 */
export function isLlmTextUpstreamTimeoutMessage(message: string): boolean {
  return /\btime(?:d)?[\s_-]?out\b|\btimeout\b|deadline[\s_-]?exceeded/i.test(
    message,
  )
}

export function toLlmTextUpstreamTimeoutError(context: {
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  detail: string
}): ApiRequestError {
  logger.warn('LLM provider reported a timeout', context)
  return new ApiRequestError(
    LLM_TEXT_PROVIDER_ERROR_CODES.upstreamTimeout,
    LLM_TEXT_PROVIDER_HTTP_STATUS.gatewayTimeout,
    LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.upstreamTimeout,
    `${LLM_TEXT_PROVIDER_ERROR_MESSAGES.upstreamTimeout} (model=${context.modelId}, detail=${context.detail.slice(0, 200)})`,
  )
}

/** 连不上 / 连接中途断：点名「不是 key 的问题」。 */
export function toLlmTextUnreachableError(context: {
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  cause: string
}): ApiRequestError {
  logger.warn('LLM provider unreachable', context)
  return new ApiRequestError(
    LLM_TEXT_PROVIDER_ERROR_CODES.unreachable,
    LLM_TEXT_PROVIDER_HTTP_STATUS.upstreamFailure,
    LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.unreachable,
    `${LLM_TEXT_PROVIDER_ERROR_MESSAGES.unreachable} (model=${context.modelId}, cause=${context.cause.slice(0, 200)})`,
  )
}

export type LlmTextRetryReason = 'transient' | 'rate-limited' | 'network'

/**
 * 值得在**同一家、同一型号**上原样重发一次的失败（docs/design/llm.md §4）。
 * 其余（key 失效、余额、超限、拒答、超时、输出不合规…）重发无益，返回 null。
 */
export function getLlmTextRetryReason(
  error: unknown,
): LlmTextRetryReason | null {
  if (error instanceof ApiRequestError) {
    if (
      error.errorCode ===
        LLM_TEXT_PROVIDER_ERROR_CODES.temporarilyUnavailable ||
      error.errorCode === LLM_TEXT_PROVIDER_ERROR_CODES.upstreamTimeout
    )
      return 'transient'
    if (error.errorCode === LLM_TEXT_PROVIDER_ERROR_CODES.rateLimited)
      return 'rate-limited'
    return null
  }
  return isLlmTextNetworkError(error) ? 'network' : null
}

function getBaseUrlForAdapter(adapterType: LlmTextAdapterType): string {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return AI_PROVIDER_ENDPOINTS.GEMINI
    case AI_ADAPTER_TYPES.OPENAI:
      return AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return AI_PROVIDER_ENDPOINTS.DEEPSEEK
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return AI_PROVIDER_ENDPOINTS.ANTHROPIC
    case AI_ADAPTER_TYPES.XAI:
      return AI_PROVIDER_ENDPOINTS.XAI
  }
}

export function textResponseError(
  modelId: string,
  truncated = false,
): ApiRequestError {
  return new ApiRequestError(
    truncated ? 'ASSISTANT_OUTPUT_TRUNCATED' : 'ASSISTANT_NO_TEXT_RESPONSE',
    502,
    truncated
      ? 'errors.assistant.outputTruncated'
      : 'errors.assistant.noTextResponse',
    `The model returned ${truncated ? 'an incomplete response' : 'no text'} (model=${modelId}).`,
  )
}

export function checkTextFinishReason(
  reason: string | null | undefined,
  modelId: string,
  refusal?: string | null,
): void {
  if (refusal || reason === 'content_filter' || reason === 'refusal') {
    throw toLlmTextRefusalError({ modelId })
  }
  if (reason === 'length' || reason === 'max_tokens') {
    throw textResponseError(modelId, true)
  }
  if (reason === 'insufficient_system_resource') {
    throw new ApiRequestError(
      LLM_TEXT_PROVIDER_ERROR_CODES.temporarilyUnavailable,
      LLM_TEXT_PROVIDER_HTTP_STATUS.temporarilyUnavailable,
      LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.temporarilyUnavailable,
      LLM_TEXT_PROVIDER_ERROR_MESSAGES.temporarilyUnavailable,
    )
  }
  if (reason && !['stop', 'end_turn', 'stop_sequence'].includes(reason)) {
    throw textResponseError(modelId, true)
  }
}

export function toLlmTextProviderError(
  responseStatus: number,
  errorBody: string,
  context: {
    adapterType: AI_ADAPTER_TYPES
    modelId: string
    /** 这次请求里带了外链视频（YouTube 直传）。见下面的 403 分支。 */
    hasLinkedVideo?: boolean
  },
): ApiRequestError {
  logger.warn('LLM provider request failed', {
    adapterType: context.adapterType,
    modelId: context.modelId,
    responseStatus,
    hasLinkedVideo: context.hasLinkedVideo === true,
    errorBodySnippet: errorBody.slice(0, 400),
  })
  const parsedCode = parseGenerationErrorCode(`${responseStatus} ${errorBody}`)

  // ⚠ **坑 2（§4.3.2，实测踩过）**：`fileUri` 指向的视频取不到时 Gemini 回的是
  // **403 PERMISSION_DENIED**，不是 404。落到下面那条通用 403 分支就会变成
  // 「API key 认证失败」，把用户引去查一把好好的 key。
  //
  // 收窄条件有两道，避免把真的 key 问题也吃掉：① 这一轮确实带了外链视频；
  // ② 错误正文没有被分类成 key 失效。
  if (
    context.hasLinkedVideo &&
    responseStatus === LLM_TEXT_PROVIDER_HTTP_STATUS.forbidden &&
    parsedCode !== GENERATION_ERROR_CODES.INVALID_API_KEY
  ) {
    return new ApiRequestError(
      VIDEO_ANALYSIS_UNREACHABLE_ERROR.code,
      VIDEO_ANALYSIS_UNREACHABLE_ERROR.httpStatus,
      VIDEO_ANALYSIS_UNREACHABLE_ERROR.i18nKey,
      `${VIDEO_ANALYSIS_UNREACHABLE_ERROR.message} (provider status ${responseStatus}, model=${context.modelId})`,
    )
  }

  // ⚠ 排在 403 那条之前：xAI 额度用完回的是 403 + 「used all available credits」，
  // 落到 403 就成了「key 失效」，把人引去换一把好好的 key。
  if (
    (parsedCode === GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE &&
      responseStatus !== LLM_TEXT_PROVIDER_HTTP_STATUS.unauthorized) ||
    responseStatus === LLM_TEXT_PROVIDER_HTTP_STATUS.paymentRequired
  ) {
    return new ApiRequestError(
      LLM_TEXT_PROVIDER_ERROR_CODES.insufficientBalance,
      LLM_TEXT_PROVIDER_HTTP_STATUS.paymentRequired,
      LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.insufficientBalance,
      LLM_TEXT_PROVIDER_ERROR_MESSAGES.insufficientBalance,
    )
  }

  if (
    parsedCode === GENERATION_ERROR_CODES.INVALID_API_KEY ||
    responseStatus === LLM_TEXT_PROVIDER_HTTP_STATUS.unauthorized ||
    responseStatus === LLM_TEXT_PROVIDER_HTTP_STATUS.forbidden
  ) {
    return new ApiRequestError(
      LLM_TEXT_PROVIDER_ERROR_CODES.authFailed,
      responseStatus,
      LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.authFailed,
      LLM_TEXT_PROVIDER_ERROR_MESSAGES.authFailed,
    )
  }

  if (
    responseStatus === LLM_TEXT_PROVIDER_HTTP_STATUS.requestTooLarge ||
    (!containsContextLimitMessage(errorBody) &&
      /\b(?:request(?:[_ ](?:body|payload|size))?|payload|body)(?:[_ ](?:is|was))?[_ ](?:too[_ ]large|exceed(?:s|ed)?\b[^"\n]{0,60}\b(?:size|bytes?|[kmgt]i?b)\b|size.{0,20}(?:limit|maximum))/i.test(
        errorBody,
      ))
  ) {
    return llmRequestTooLargeError()
  }

  if (
    parsedCode === GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT ||
    parsedCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE ||
    parsedCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE ||
    parsedCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_LIMIT_EXCEEDED ||
    parsedCode === GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS
  ) {
    return new ApiRequestError(
      parsedCode,
      LLM_TEXT_PROVIDER_HTTP_STATUS.invalidRequest,
      `errors.generation.${parsedCode}`,
      parsedCode,
    )
  }

  if (
    parsedCode === GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT ||
    responseStatus === LLM_TEXT_PROVIDER_HTTP_STATUS.rateLimited
  ) {
    return new ApiRequestError(
      LLM_TEXT_PROVIDER_ERROR_CODES.rateLimited,
      LLM_TEXT_PROVIDER_HTTP_STATUS.rateLimited,
      LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.rateLimited,
      LLM_TEXT_PROVIDER_ERROR_MESSAGES.rateLimited,
    )
  }

  if (containsContextLimitMessage(errorBody)) {
    return new ApiRequestError(
      LLM_TEXT_PROVIDER_ERROR_CODES.contextLimitExceeded,
      LLM_TEXT_PROVIDER_HTTP_STATUS.invalidRequest,
      LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.contextLimitExceeded,
      LLM_TEXT_PROVIDER_ERROR_MESSAGES.contextLimitExceeded,
    )
  }

  // 厂商 / 网关自己说超时（408 请求超时 · 504 网关超时 · 524 Cloudflare 源站超时）：
  // 单独一类，文案说清「是它那边没在自己的时限内回完」，⛔ 别和我们自己的等待上限
  // （`timeout`）或「暂时不可用」混成一句。重试策略与 5xx 相同（见 `getLlmTextRetryReason`）。
  if (LLM_TEXT_UPSTREAM_TIMEOUT_STATUSES.has(responseStatus)) {
    return new ApiRequestError(
      LLM_TEXT_PROVIDER_ERROR_CODES.upstreamTimeout,
      LLM_TEXT_PROVIDER_HTTP_STATUS.gatewayTimeout,
      LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.upstreamTimeout,
      `${LLM_TEXT_PROVIDER_ERROR_MESSAGES.upstreamTimeout} (provider status ${responseStatus}, model=${context.modelId})`,
    )
  }

  // 5xx 一律算「暂时不可用」（o-llm 重试）：500 / 502 / 529 是 provider 那头
  // 出事，同一请求稍后重发常常就好；原先落到下面的 `failed` 会叫人「换一把 key」。
  // 501（不支持）除外 —— 重发无益。
  if (
    parsedCode === GENERATION_ERROR_CODES.PROVIDER_OVERLOADED ||
    (responseStatus >= 500 && responseStatus !== 501)
  ) {
    return new ApiRequestError(
      LLM_TEXT_PROVIDER_ERROR_CODES.temporarilyUnavailable,
      LLM_TEXT_PROVIDER_HTTP_STATUS.temporarilyUnavailable,
      LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.temporarilyUnavailable,
      LLM_TEXT_PROVIDER_ERROR_MESSAGES.temporarilyUnavailable,
    )
  }

  return new ApiRequestError(
    LLM_TEXT_PROVIDER_ERROR_CODES.failed,
    LLM_TEXT_PROVIDER_HTTP_STATUS.upstreamFailure,
    LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.failed,
    LLM_TEXT_PROVIDER_ERROR_MESSAGES.failed,
  )
}

/**
 * 超时 —— **不是** provider 给的状态码，是我们主动放弃等待。
 *
 * 用 504 而不是 502，是为了让上层能区分「上游拒绝了这次请求」（重试无益）
 * 和「上游没在时限内答话」（值得再试）。
 */
export function toLlmTextTimeoutError(context: {
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  timeoutMs: number
}): ApiRequestError {
  logger.warn('LLM provider request timed out', context)
  return new ApiRequestError(
    LLM_TEXT_PROVIDER_ERROR_CODES.timeout,
    LLM_TEXT_PROVIDER_HTTP_STATUS.gatewayTimeout,
    LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.timeout,
    `${LLM_TEXT_PROVIDER_ERROR_MESSAGES.timeout} (model=${context.modelId}, waited ${context.timeoutMs}ms)`,
  )
}

/**
 * signal 触发时 fetch 抛的是 `DOMException`，名字随触发方式变
 * （手动 `controller.abort()` → `AbortError`；`AbortSignal.timeout()` → `TimeoutError`）。
 *
 * ⚠ 只认 `name` 不用 `instanceof Error`：`DOMException` 在 Node 里虽然继承自
 * `Error`，但跨 realm（undici / 测试替身）时那个判断会漏。
 */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: unknown }).name
  return name === 'AbortError' || name === 'TimeoutError'
}

/**
 * 这一次补全最多等多久（owner 11-05：能避免的超时尽量避免）：
 * - 在路由里 = 这次请求在平台杀函数前还剩的时间，减去收尾余量（`lib/request-deadline.ts`）——
 *   30 秒的路由不会再被平台无声杀掉，800 秒的路由也不会被固定 120 秒提前掐断；
 * - 路由外（脚本 / 测试 / 工作流）= `COMPLETION`。
 */
export function getLlmTextCompletionTimeoutMs(): number {
  const left = getRequestTimeLeftMs()
  if (left === null) return LLM_TEXT_TIMEOUTS_MS.COMPLETION
  return Math.max(left - LLM_TEXT_TIMEOUTS_MS.DEADLINE_MARGIN, 0)
}

/**
 * 整次请求（连读完正文）一个总时限（`getLlmTextCompletionTimeoutMs`）。只剩这一条通道：
 * 旧的逐块流式通道（按「多久没分片」掐）11-05 已删 —— 它会在推理模型想的时候误杀，
 * 助手主对话早已走 `features/assistant/kernel.ts` 的 AI SDK。
 */
export async function fetchLlmTextBuffered(
  endpoint: string,
  init: Omit<RequestInit, 'signal'>,
  context: { adapterType: AI_ADAPTER_TYPES; modelId: string },
  signal?: AbortSignal,
): Promise<Response> {
  signal?.throwIfAborted()
  const timeoutMs = getLlmTextCompletionTimeoutMs()
  // 剩的时间连发一次都不够：发出去也会被平台杀掉、只剩无信息的 504 —— 现在就说清。
  if (timeoutMs < LLM_TEXT_TIMEOUTS_MS.MIN_ATTEMPT)
    throw toLlmTextTimeoutError({ ...context, timeoutMs })
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const clearTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const armTimer = () => {
    clearTimer()
    timer = setTimeout(
      () => controller.abort(toLlmTextTimeoutError({ ...context, timeoutMs })),
      timeoutMs,
    )
  }
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  let abortBody: (() => void) | undefined
  const cleanup = () => {
    clearTimer()
    signal?.removeEventListener('abort', abort)
    if (abortBody) controller.signal.removeEventListener('abort', abortBody)
  }
  const failure = (error: unknown): unknown => {
    if (signal?.aborted) return signal.reason
    if (controller.signal.aborted) return controller.signal.reason
    return isAbortError(error)
      ? toLlmTextTimeoutError({ ...context, timeoutMs })
      : error
  }
  armTimer()
  let response: Response
  try {
    const routed = routeThroughAiGateway(endpoint, init.headers)
    response = await fetch(routed.endpoint, {
      ...init,
      headers: routed.headers,
      signal: controller.signal,
    })
    controller.signal.throwIfAborted()
  } catch (error) {
    cleanup()
    throw failure(error)
  }
  if (!response.body) {
    cleanup()
    return response
  }
  const reader = response.body.getReader()
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    cleanup()
    reader.releaseLock()
  }
  const cancelReader = async (reason: unknown) => {
    try {
      await reader.cancel(reason)
    } finally {
      finish()
    }
  }
  const body = new ReadableStream<Uint8Array>(
    {
      start(output) {
        abortBody = () => {
          output.error(failure(controller.signal.reason))
          void cancelReader(controller.signal.reason).catch(() => undefined)
        }
        controller.signal.addEventListener('abort', abortBody, { once: true })
        if (controller.signal.aborted) abortBody()
      },
      async pull(output) {
        if (controller.signal.aborted) return
        try {
          const { done, value } = await reader.read()
          if (controller.signal.aborted) return
          if (done) {
            output.close()
            finish()
          } else {
            output.enqueue(value)
          }
        } catch (error) {
          if (controller.signal.aborted) return
          output.error(failure(error))
          await cancelReader(error)
        }
      },
      async cancel(reason) {
        cleanup()
        controller.abort(
          reason ?? new DOMException('Response reading stopped', 'AbortError'),
        )
        await cancelReader(controller.signal.reason)
      },
    },
    { highWaterMark: 0 },
  )
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export async function readLlmErrorBody(
  response: Response,
  signal?: AbortSignal,
): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiRequestError || isAbortError(error)) throw error
    return 'Unknown error'
  }
}

// ─── Route Resolution ────────────────────────────────────────────

/**
 * 一把**点名的** key → 它那一家的文本线路（解不开照实抛）。
 *
 * ⛔ 没有「不点名就按顺序挑第一家有 key 的」那一圈了（owner 2026-10-15「全跟助手」·
 * 「会自动扣其他模型的token，用户还不知道」）：创作者没点名 key 时，调用方走
 * `resolveAssistantRoute` / `resolveKeyOrAssistantRoute`（助手那一家、那个型号），由它们
 * 挑出 key 再递到这里。
 * ⚠ No platform fallback (owner 2026-10-07): every user brings their own key.
 */
export async function resolveLlmTextRoute(
  userId: string,
  apiKeyId: string,
): Promise<ResolvedLlmTextRoute> {
  const specificKey = await db.userApiKey.findFirst({
    where: { id: apiKeyId, userId, isActive: true },
  })

  if (!specificKey) {
    throw new Error(
      'The selected API key is unavailable. Please choose a different key in Settings > API Keys.',
    )
  }

  return toLlmTextRoute(specificKey)
}

/**
 * 已经读出来的那一行 key → 文本线路（不再查库）。手上已经有 key 行的调用方
 * （`resolveAssistantRoute` 挑 key 时一并读了密文）直接用它，省一次按 id 重查。
 */
export function toLlmTextRoute(key: {
  adapterType: string
  encryptedKey: string
}): ResolvedLlmTextRoute {
  const adapterType = key.adapterType as AI_ADAPTER_TYPES
  if (!isLlmTextAdapter(adapterType)) {
    throw new Error(
      `The selected API key does not support text completion (requires ${LLM_TEXT_PROVIDER_NAMES}). Please bind a compatible key.`,
    )
  }

  return {
    adapterType,
    providerConfig: {
      label: LLM_TEXT_LABELS[adapterType],
      baseUrl: getBaseUrlForAdapter(adapterType),
    },
    apiKey: decryptApiKey(key.encryptedKey),
  }
}

// ─── Provider Implementations ────────────────────────────────────

function llmRequestTooLargeError(): ApiRequestError {
  return new ApiRequestError(
    LLM_TEXT_PROVIDER_ERROR_CODES.requestTooLarge,
    LLM_TEXT_PROVIDER_HTTP_STATUS.requestTooLarge,
    LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.requestTooLarge,
    LLM_TEXT_PROVIDER_ERROR_MESSAGES.requestTooLarge,
  )
}

export function parseInlineImage(image: string) {
  const comma = image.indexOf(',')
  const header = image.slice(0, comma).match(/^data:([^;]+);base64$/i)
  return header ? { mimeType: header[1], data: image.slice(comma + 1) } : null
}

/** Each image part, preceded by its label's text part when one is given. */
export function withImageLabels<Part>(
  input: LlmTextInput,
  images: readonly Part[],
  toText: (text: string) => Part,
): Part[] {
  return images.flatMap((image, index) => {
    const label = input.imageLabels?.[index]?.trim()
    return label ? [toText(label), image] : [image]
  })
}

/** 看图模型只吃位图；SVG 与读不了的格式同一个码（前端按码先弹「转 PNG」）。 */
function svgImageInputError(): ApiRequestError {
  const code = GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT
  return new ApiRequestError(
    code,
    400,
    `errors.generation.${code}`,
    "SVG images can't be used as input. Convert it to PNG first.",
  )
}

/** GIF 动图同一个码、另一句文案（前端按 GIF 弹「用首帧继续？」）。 */
function gifImageInputError(): ApiRequestError {
  const code = GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT
  return new ApiRequestError(
    code,
    400,
    `errors.generation.${code}`,
    "GIF images can't be used as input. Extract its first frame as a PNG to continue.",
  )
}

export function getLlmImages(input: LlmTextInput): string[] {
  const images = input.imageData
    ? Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    : []
  // 每一家都先过这里：`.svg` 地址 / `data:image/svg+xml` 在这儿就拦，⛔ 别转给模型。
  if (images.some((image) => isSvgImageUrl(image))) throw svgImageInputError()
  if (images.some((image) => isGifImageUrl(image))) throw gifImageInputError()
  if (!isLlmTextAdapter(input.adapterType)) return images
  const limits = ASSISTANT_IMAGE_LIMITS[input.adapterType]
  let totalImageBytes = 0
  let totalBase64Bytes = 0

  for (const image of images) {
    const inline = parseInlineImage(image)
    if (!inline) continue
    const imageBytes = Buffer.byteLength(inline.data, 'base64')
    const base64Bytes = Buffer.byteLength(inline.data, 'utf8')
    if (
      (limits.maxImageBytes !== null && imageBytes > limits.maxImageBytes) ||
      (limits.maxBase64ImageBytes !== null &&
        base64Bytes > limits.maxBase64ImageBytes)
    ) {
      const code = GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE
      throw new ApiRequestError(code, 400, `errors.generation.${code}`, code)
    }
    totalImageBytes += imageBytes
    totalBase64Bytes += base64Bytes
  }
  if (
    (limits.maxTotalImageBytes !== null &&
      totalImageBytes > limits.maxTotalImageBytes) ||
    (limits.maxRequestBytes !== null &&
      totalBase64Bytes > limits.maxRequestBytes)
  ) {
    throw llmRequestTooLargeError()
  }
  return images
}

export function serializeLlmRequest(
  input: LlmTextInput,
  payload: Record<string, unknown>,
): string {
  const body = JSON.stringify(payload)
  if (input.imageData?.length && isLlmTextAdapter(input.adapterType)) {
    const { maxRequestBytes } = ASSISTANT_IMAGE_LIMITS[input.adapterType]
    if (
      maxRequestBytes !== null &&
      Buffer.byteLength(body, 'utf8') > maxRequestBytes
    ) {
      throw llmRequestTooLargeError()
    }
  }
  return body
}

export async function prepareInlineImages(
  images: string[],
  adapterType: AI_ADAPTER_TYPES.GEMINI | AI_ADAPTER_TYPES.OPENAI,
  signal?: AbortSignal,
): Promise<Array<{ mimeType: string; data: string }>> {
  let remainingBytes: number =
    ASSISTANT_IMAGE_LIMITS[adapterType].maxRequestBytes
  const parts: Array<{ mimeType: string; data: string }> = []
  for (const image of images) {
    signal?.throwIfAborted()
    let part = parseInlineImage(image)
    if (!part) {
      try {
        const { buffer, mimeType } = await fetchAsBuffer(image, {
          maxBytes: Math.floor(remainingBytes / 4) * 3,
          signal: mediaRequestSignal(signal),
        })
        part = { mimeType, data: buffer.toString('base64') }
      } catch (error) {
        signal?.throwIfAborted()
        if (isAbortError(error)) throw error
        const message = error instanceof Error ? error.message : String(error)
        const parsedCode = parseGenerationErrorCode(message)
        logger.warn('LLM reference image preparation failed', {
          adapterType,
          errorCode: parsedCode,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        if (parsedCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE) {
          throw llmRequestTooLargeError()
        }
        const code = GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE
        throw new ApiRequestError(code, 400, `errors.generation.${code}`, code)
      }
    }
    // 地址不带 `.svg` 但实际回的是 SVG：按下载到的 MIME 再拦一次。
    if (isSvgMimeType(part.mimeType)) throw svgImageInputError()
    if (isGifMimeType(part.mimeType)) throw gifImageInputError()
    remainingBytes -= Buffer.byteLength(part.data, 'utf8')
    if (remainingBytes < 0) throw llmRequestTooLargeError()
    parts.push(part)
  }
  return parts
}

export function mediaRequestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(LLM_TEXT_TIMEOUTS_MS.COMPLETION)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export function toLlmTextRefusalError(context: {
  modelId: string
  category?: string | null
}): ApiRequestError {
  logger.warn('LLM provider declined the request', {
    adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    modelId: context.modelId,
    category: context.category ?? null,
  })
  return new ApiRequestError(
    LLM_TEXT_PROVIDER_ERROR_CODES.refused,
    LLM_TEXT_PROVIDER_HTTP_STATUS.invalidRequest,
    LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.refused,
    `${LLM_TEXT_PROVIDER_ERROR_MESSAGES.refused} (model=${context.modelId}, category=${context.category ?? 'unknown'})`,
  )
}

/**
 * VolcEngine (豆包) text completion — OpenAI-compatible chat API.
 * Supports vision (image_url in content) and web search via plugin.
 */
// ─── Public API ──────────────────────────────────────────────────

/**
 * Reject prompts that match a known injection pattern (e.g. `[INST]`,
 * "ignore previous instructions"). System prompts are platform-controlled so
 * they're trusted; only user-supplied content is checked. Callers don't have
 * to remember to call `validatePrompt` themselves — this is the single
 * choke-point every LLM request flows through.
 */
export function guardUserPrompt(
  prompt: string,
  maxLength?: number | null,
): void {
  if (!prompt) return
  const result = validatePrompt(prompt, maxLength)
  if (!result.valid) {
    throw new Error(`Prompt rejected by guard: ${result.reason}`)
  }
  if (result.warnings.length > 0) {
    logger.warn('Prompt guard warnings', { warnings: result.warnings })
  }
}
