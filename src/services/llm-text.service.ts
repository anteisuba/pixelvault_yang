import 'server-only'

import { z } from 'zod'

import {
  AI_PROVIDER_ENDPOINTS,
  ANTHROPIC_API,
  LLM_TEXT_DEFAULT_MAX_TOKENS,
  LLM_TEXT_MODEL_IDS,
  LLM_TEXT_TIMEOUTS_MS,
} from '@/constants/config'
import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import {
  GENERATION_ERROR_CODES,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import {
  VIDEO_ANALYSIS,
  VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS,
  VIDEO_ANALYSIS_UNREACHABLE_ERROR,
} from '@/constants/video-analysis'
import { VIDEO_LINK_KINDS } from '@/constants/video-link'
import { db } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { ApiRequestError } from '@/lib/errors'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { buildYoutubeWatchUrl, classifyVideoLink } from '@/lib/video-link'
import { readSseData } from '@/lib/sse'
import { validatePrompt } from '@/services/kernel/prompt-guard'
import { fetchAsBuffer } from '@/services/storage/r2'

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
   * Image input(s) for multimodal completion. Each entry may be either a
   * `data:` URL or an `http(s)` URL — the implementation normalizes per
   * provider:
   *  - Gemini: requires inline base64, so any http(s) URL is fetched
   *    server-side via `fetchAsBuffer` (which guards against SSRF).
   *  - OpenAI: its chat API accepts both forms in `image_url.url`, so the
   *    value is forwarded as-is.
   */
  imageData?: string | string[]
  /**
   * Native video inputs. Currently supported only by the Gemini branch.
   *
   * Entries may be a `data:` URL, an `http(s)` URL to a video file, or a
   * **YouTube page URL** — the classifier in `lib/video-link.ts` decides which
   * of those it is; see `toGeminiVideoPart`.
   */
  videoData?: string | string[]
  /**
   * Per-call cost lever for video input (§4.3.1). Omit for v1 default =
   * whole video at the provider's default frame rate.
   */
  videoAnalysis?: VideoAnalysisWindow
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
  /** Enable web search grounding (Gemini google_search / OpenAI web_search) */
  useGrounding?: boolean
}

export interface ResolvedLlmTextRoute {
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
}

// ─── Response Schemas ────────────────────────────────────────────

const GeminiTextResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
              }),
            ),
          })
          .optional(),
        /**
         * ⚠ 这两个字段**必须留着**：Gemini 会用 HTTP 200 + 空 parts 表达「被安全策略
         * 拦了」「输出被截断了」，真正的原因只在这里。以前 schema 把它们丢掉，错误
         * 就只剩一句「No text response from Gemini」——生产上撞到时无法归因
         * （2026-08-19 真实事故）。**大声报错 ≠ 可归因。**
         */
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
})

const GeminiFileUploadResponseSchema = z.object({
  file: z.object({
    name: z.string(),
    uri: z.string(),
    mimeType: z.string().optional(),
    state: z.string().optional(),
  }),
})

const GeminiFileStatusSchema = z.object({
  name: z.string(),
  uri: z.string().optional(),
  mimeType: z.string().optional(),
  state: z.string().optional(),
})

const OpenAiChatTextPartSchema = z.object({
  text: z.string().optional(),
  type: z.string().optional(),
})

const OpenAiChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullable().optional(),
      message: z.object({
        content: z
          .union([z.string(), z.array(OpenAiChatTextPartSchema)])
          .nullable()
          .optional(),
        content_parts: z.array(OpenAiChatTextPartSchema).nullable().optional(),
        refusal: z.string().nullable().optional(),
      }),
    }),
  ),
  usage: z
    .object({
      completion_tokens_details: z
        .object({
          reasoning_tokens: z.number().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
})

// ─── LLM Text Models ────────────────────────────────────────────

/** Text-capable LLM adapter types */
export const LLM_TEXT_ADAPTERS = [
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.DEEPSEEK,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.DASHSCOPE,
  // Appended last: lowest priority in the no-apiKeyId auto-fallback loop
  // below, and the newest/narrowest-scope BYOK route (see
  // docs/references/pages/assistant-shell.md). Still
  // required here — the node-assistant's explicit-apiKeyId path resolves
  // through `isLlmTextAdapter`, so a saved Claude key can't complete without
  // this membership.
  AI_ADAPTER_TYPES.ANTHROPIC,
  // Same reasoning as Claude above: last in the auto-fallback order (newest,
  // narrowest scope), but membership here is what lets a saved Grok key
  // resolve through the explicit-apiKeyId path.
  AI_ADAPTER_TYPES.XAI,
] as const

type LlmTextAdapterType = (typeof LLM_TEXT_ADAPTERS)[number]

function isLlmTextAdapter(t: AI_ADAPTER_TYPES): t is LlmTextAdapterType {
  return (LLM_TEXT_ADAPTERS as readonly AI_ADAPTER_TYPES[]).includes(t)
}

const LLM_TEXT_MODELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: LLM_TEXT_MODEL_IDS.GEMINI_3_5_FLASH_LITE,
  [AI_ADAPTER_TYPES.DEEPSEEK]: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
  [AI_ADAPTER_TYPES.OPENAI]: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_TERRA,
  [AI_ADAPTER_TYPES.DASHSCOPE]: LLM_TEXT_MODEL_IDS.QWEN_PLUS,
  [AI_ADAPTER_TYPES.ANTHROPIC]: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5,
  [AI_ADAPTER_TYPES.XAI]: LLM_TEXT_MODEL_IDS.XAI_GROK_4_6,
}

const LLM_TEXT_LABELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: 'Gemini',
  [AI_ADAPTER_TYPES.DEEPSEEK]: 'DeepSeek',
  [AI_ADAPTER_TYPES.OPENAI]: 'OpenAI',
  [AI_ADAPTER_TYPES.DASHSCOPE]: 'Qwen',
  [AI_ADAPTER_TYPES.ANTHROPIC]: 'Claude',
  [AI_ADAPTER_TYPES.XAI]: 'Grok',
}

const LLM_TEXT_IMAGE_MAX_BYTES = 10 * 1024 * 1024

const LLM_TEXT_PROVIDER_HTTP_STATUS = {
  invalidRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  paymentRequired: 402,
  rateLimited: 429,
  temporarilyUnavailable: 503,
  upstreamFailure: 502,
  gatewayTimeout: 504,
} as const

const LLM_TEXT_PROVIDER_ERROR_CODES = {
  authFailed: 'PROVIDER_AUTH_FAILED',
  insufficientBalance: 'PROVIDER_INSUFFICIENT_BALANCE',
  rateLimited: 'PROVIDER_RATE_LIMITED',
  temporarilyUnavailable: 'PROVIDER_TRANSIENT',
  failed: 'PROVIDER_ERROR',
  /** Completion budget used up (often by reasoning) before any visible text. */
  outputBudgetExhausted: 'PROVIDER_OUTPUT_BUDGET_EXHAUSTED',
  /** The provider rejected the request because its input context was too long. */
  contextLimitExceeded: 'PROVIDER_CONTEXT_LIMIT_EXCEEDED',
  /** We gave up waiting on the provider before the platform killed the function. */
  timeout: 'PROVIDER_TIMEOUT',
} as const

const LLM_TEXT_PROVIDER_ERROR_I18N_KEYS = {
  authFailed: 'errors.provider.invalidApiKey',
  insufficientBalance: 'errors.provider.insufficientBalance',
  rateLimited: 'errors.provider.rateLimited',
  temporarilyUnavailable: 'errors.provider.temporarilyUnavailable',
  failed: 'errors.provider.failed',
  outputBudgetExhausted: 'errors.provider.outputBudgetExhausted',
  contextLimitExceeded: 'errors.provider.contextLimitExceeded',
  timeout: 'errors.provider.timeout',
} as const

const LLM_TEXT_PROVIDER_ERROR_MESSAGES = {
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
    'This reasoning model used up its output budget before writing a reply. Retry, switch to a non-reasoning model (e.g. Gemini or Qwen), or shorten the prompt.',
  contextLimitExceeded:
    'The selected model rejected the input because its context window was exceeded. PixelVault already compacted older history and retried once; start a new conversation or remove large references.',
  timeout:
    'The selected provider did not answer in time. Retry, shorten the conversation, or choose another Agent Key.',
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

function getBaseUrlForAdapter(adapterType: LlmTextAdapterType): string {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return AI_PROVIDER_ENDPOINTS.GEMINI
    case AI_ADAPTER_TYPES.OPENAI:
      return AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return AI_PROVIDER_ENDPOINTS.DEEPSEEK
    case AI_ADAPTER_TYPES.DASHSCOPE:
      return AI_PROVIDER_ENDPOINTS.DASHSCOPE
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return AI_PROVIDER_ENDPOINTS.ANTHROPIC
    case AI_ADAPTER_TYPES.XAI:
      return AI_PROVIDER_ENDPOINTS.XAI
  }
}

function getOpenAiChatBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
  return baseUrl.endsWith('/images')
    ? baseUrl.slice(0, -'/images'.length)
    : baseUrl
}

function isOpenAiReasoningModel(modelId: string): boolean {
  return /^(gpt-5|o[134])(?:[.-]|$)/i.test(modelId)
}

/**
 * Resolve completion token budget for OpenAI chat.
 * Reasoning models (gpt-5*, o1/o3/o4) bill hidden reasoning against
 * max_completion_tokens; callers that pass a small maxTokens often get
 * empty content with finish_reason=length. Floor those models at
 * OPENAI_REASONING so assistant / planner routes stay reliable.
 */
function resolveOpenAiCompletionBudget(
  modelId: string,
  maxTokens?: number,
): number {
  if (isOpenAiReasoningModel(modelId)) {
    const requested = maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.OPENAI_REASONING
    return Math.max(requested, LLM_TEXT_DEFAULT_MAX_TOKENS.OPENAI_REASONING)
  }

  return maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT
}

function getOpenAiTokenLimit(modelId: string, maxTokens: number) {
  if (isOpenAiReasoningModel(modelId)) {
    return { max_completion_tokens: maxTokens }
  }

  return { max_tokens: maxTokens }
}

function extractOpenAiText(
  content:
    | string
    | Array<z.infer<typeof OpenAiChatTextPartSchema>>
    | null
    | undefined,
): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => part.text?.trim())
      .filter((part): part is string => Boolean(part))
      .join('\n')
      .trim()

    return text.length > 0 ? text : null
  }

  return null
}

function getOpenAiChatText(
  data: z.infer<typeof OpenAiChatResponseSchema>,
): string | null {
  const message = data.choices[0]?.message
  return (
    extractOpenAiText(message?.content) ??
    extractOpenAiText(message?.content_parts)
  )
}

function throwNoOpenAiTextResponse(
  data: z.infer<typeof OpenAiChatResponseSchema>,
  modelId: string,
): never {
  const choice = data.choices[0]
  const finishReason = choice?.finish_reason
  const reasoningTokens =
    data.usage?.completion_tokens_details?.reasoning_tokens
  logger.warn('OpenAI text completion returned no text', {
    modelId,
    finishReason,
    hasContent: choice?.message.content != null,
    contentPartsCount: choice?.message.content_parts?.length ?? 0,
    hasRefusal: Boolean(choice?.message.refusal),
    reasoningTokens,
  })

  // finish_reason=length with reasoning-only usage means the model never
  // reached visible text — not an invalid API key. Surface a specific code
  // so the UI does not tell users to "try another Agent Key".
  const budgetExhausted =
    finishReason === 'length' &&
    (typeof reasoningTokens === 'number'
      ? reasoningTokens > 0
      : isOpenAiReasoningModel(modelId))

  if (budgetExhausted) {
    throw new ApiRequestError(
      LLM_TEXT_PROVIDER_ERROR_CODES.outputBudgetExhausted,
      LLM_TEXT_PROVIDER_HTTP_STATUS.upstreamFailure,
      LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.outputBudgetExhausted,
      LLM_TEXT_PROVIDER_ERROR_MESSAGES.outputBudgetExhausted,
    )
  }

  throw new ApiRequestError(
    LLM_TEXT_PROVIDER_ERROR_CODES.failed,
    LLM_TEXT_PROVIDER_HTTP_STATUS.upstreamFailure,
    LLM_TEXT_PROVIDER_ERROR_I18N_KEYS.failed,
    LLM_TEXT_PROVIDER_ERROR_MESSAGES.failed,
  )
}

function toLlmTextProviderError(
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
    parsedCode === GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE ||
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

  if (
    parsedCode === GENERATION_ERROR_CODES.PROVIDER_OVERLOADED ||
    responseStatus === LLM_TEXT_PROVIDER_HTTP_STATUS.temporarilyUnavailable
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
function toLlmTextTimeoutError(context: {
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
function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: unknown }).name
  return name === 'AbortError' || name === 'TimeoutError'
}

/**
 * 缓冲补全的 fetch —— 计时盖住**整次请求**，包括调用方后面 `.json()` 读响应体
 * 那一段（`AbortSignal` 一直有效到 body 读完）。
 *
 * 每个 provider 分支都必须走它而不是裸 `fetch`：没有超时时上游挂住只能等平台
 * 杀函数，那条路径回给客户端的是一个不带任何信息的 504。
 */
async function fetchLlmTextBuffered(
  endpoint: string,
  init: Omit<RequestInit, 'signal'>,
  context: { adapterType: AI_ADAPTER_TYPES; modelId: string },
): Promise<Response> {
  try {
    return await fetch(endpoint, {
      ...init,
      signal: AbortSignal.timeout(LLM_TEXT_TIMEOUTS_MS.COMPLETION),
    })
  } catch (error) {
    if (!isAbortError(error)) throw error
    throw toLlmTextTimeoutError({
      ...context,
      timeoutMs: LLM_TEXT_TIMEOUTS_MS.COMPLETION,
    })
  }
}

/**
 * 流式的 fetch —— 计时**只跑到响应头到手为止**。
 *
 * ⛔ 这里不能用 `AbortSignal.timeout()`：那个 signal 会一直活到响应体读完，
 * 于是一条正常但写得久的回答会被自己的超时掐断——正是流式要解决的问题。
 * 要保护的只有「连不上 / 不回头」这一段，所以自己管 controller，
 * `finally` 里撤掉计时器，之后这条流爱读多久读多久。
 */
async function fetchLlmTextStreaming(
  endpoint: string,
  init: Omit<RequestInit, 'signal'>,
  context: { adapterType: AI_ADAPTER_TYPES; modelId: string },
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    LLM_TEXT_TIMEOUTS_MS.STREAM_HEADERS,
  )
  try {
    return await fetch(endpoint, { ...init, signal: controller.signal })
  } catch (error) {
    if (!isAbortError(error)) throw error
    throw toLlmTextTimeoutError({
      ...context,
      timeoutMs: LLM_TEXT_TIMEOUTS_MS.STREAM_HEADERS,
    })
  } finally {
    clearTimeout(timer)
  }
}

// ─── Route Resolution ────────────────────────────────────────────

/**
 * Resolves which LLM provider + API key to use for text completion.
 * Priority: specified apiKeyId → user Gemini key → user DeepSeek key → user OpenAI key → user VolcEngine key
 */
export async function resolveLlmTextRoute(
  userId: string,
  apiKeyId?: string,
): Promise<ResolvedLlmTextRoute> {
  // If a specific key is requested, use it directly
  if (apiKeyId) {
    const specificKey = await db.userApiKey.findFirst({
      where: { id: apiKeyId, userId, isActive: true },
    })

    if (!specificKey) {
      throw new Error(
        'The selected API key is unavailable. Please choose a different key in Settings > API Keys.',
      )
    }

    const adapterType = specificKey.adapterType as AI_ADAPTER_TYPES
    if (!isLlmTextAdapter(adapterType)) {
      throw new Error(
        'The selected API key does not support text completion (requires Gemini, DeepSeek, OpenAI, or VolcEngine). Please bind a compatible key.',
      )
    }

    const keyValue = decryptApiKey(specificKey.encryptedKey)
    return {
      adapterType,
      providerConfig: {
        label: LLM_TEXT_LABELS[adapterType],
        baseUrl: getBaseUrlForAdapter(adapterType),
      },
      apiKey: keyValue,
    }
  }

  const triedProviders: string[] = []

  for (const adapterType of LLM_TEXT_ADAPTERS) {
    const label = LLM_TEXT_LABELS[adapterType]

    const userKey = await db.userApiKey.findFirst({
      where: {
        userId,
        adapterType,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!userKey) {
      triedProviders.push(`${label} (no key bound)`)
      continue
    }

    try {
      const keyValue = decryptApiKey(userKey.encryptedKey)
      return {
        adapterType,
        providerConfig: {
          label,
          baseUrl: getBaseUrlForAdapter(adapterType),
        },
        apiKey: keyValue,
      }
    } catch {
      triedProviders.push(`${label} (key decryption failed)`)
    }
  }

  // Platform fallback: use system Gemini key for users without their own keys
  const platformKey = getSystemApiKey(AI_ADAPTER_TYPES.GEMINI)
  if (platformKey) {
    return {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: LLM_TEXT_LABELS[AI_ADAPTER_TYPES.GEMINI],
        baseUrl: getBaseUrlForAdapter(AI_ADAPTER_TYPES.GEMINI),
      },
      apiKey: platformKey,
    }
  }

  const tried = triedProviders.join(', ')
  throw new Error(
    `No API key available. Tried: ${tried}. Please add a Gemini, DeepSeek, OpenAI, or VolcEngine API key in Settings > API Keys.`,
  )
}

// ─── Provider Implementations ────────────────────────────────────

/**
 * Resolve an image input (data URL or http(s) URL) to the Gemini-required
 * `inlineData` shape. Http(s) URLs are fetched server-side — `fetchAsBuffer`
 * applies the SSRF guard, so we don't need a separate check here.
 */
async function toGeminiInlinePart(
  image: string,
): Promise<{ inlineData: { mimeType: string; data: string } }> {
  const dataUrlMatch = image.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return {
      inlineData: { mimeType: dataUrlMatch[1], data: dataUrlMatch[2] },
    }
  }
  const { buffer, mimeType } = await fetchAsBuffer(image, {
    maxBytes: LLM_TEXT_IMAGE_MAX_BYTES,
  })
  return {
    inlineData: { mimeType, data: buffer.toString('base64') },
  }
}

interface GeminiVideoPartResult {
  part: Record<string, unknown>
  uploadedFileName?: string
  /**
   * 这一部分是**指向外部链接**的 fileUri（YouTube 直传），不是我们上传的文件。
   * 403 的语义因此完全不同 —— 见 `toLlmTextProviderError` 的视频分支。
   */
  linkedVideo?: boolean
}

/**
 * `videoMetadata` 的线上形状：偏移量是 Duration 字符串（`"60s"`），fps 是数字。
 * 全省 = 不发这个字段（全片 + provider 默认帧率）。
 */
function toGeminiVideoMetadata(
  analysisWindow: VideoAnalysisWindow | undefined,
): Record<string, unknown> | null {
  const fps = analysisWindow?.fps ?? VIDEO_ANALYSIS.defaultFps
  const startOffset =
    analysisWindow?.startOffset ?? VIDEO_ANALYSIS.defaultStartOffsetSeconds
  const endOffset =
    analysisWindow?.endOffset ?? VIDEO_ANALYSIS.defaultEndOffsetSeconds

  const metadata = {
    ...(typeof fps === 'number' ? { fps } : {}),
    ...(typeof startOffset === 'number'
      ? { startOffset: `${startOffset}s` }
      : {}),
    ...(typeof endOffset === 'number' ? { endOffset: `${endOffset}s` } : {}),
  }
  return Object.keys(metadata).length > 0 ? metadata : null
}

function waitForGeminiFilePoll(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ASSISTANT_MEDIA_LIMITS.geminiFilePollIntervalMs)
  })
}

async function uploadGeminiVideoFile(
  buffer: Buffer,
  mimeType: string,
  apiKey: string,
): Promise<{ name: string; uri: string; mimeType: string }> {
  const startResponse = await fetch(AI_PROVIDER_ENDPOINTS.GEMINI_FILES_UPLOAD, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.byteLength),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'assistant-reference' } }),
  })
  if (!startResponse.ok) {
    const detail = await startResponse.text().catch(() => '')
    throw new Error(
      `Gemini video upload could not start (${startResponse.status}): ${detail.slice(0, 200)}`,
    )
  }

  const uploadUrl = startResponse.headers.get('x-goog-upload-url')
  if (!uploadUrl) {
    throw new Error('Gemini video upload did not return an upload URL.')
  }

  const uploadBody = new Uint8Array(buffer.byteLength)
  uploadBody.set(buffer)
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: uploadBody,
  })
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '')
    throw new Error(
      `Gemini video upload failed (${uploadResponse.status}): ${detail.slice(0, 200)}`,
    )
  }

  const uploaded = GeminiFileUploadResponseSchema.parse(
    await uploadResponse.json(),
  ).file
  const deadline = Date.now() + ASSISTANT_MEDIA_LIMITS.geminiFilePollTimeoutMs
  let current: z.infer<typeof GeminiFileStatusSchema> = uploaded

  while (current.state === 'PROCESSING') {
    if (Date.now() >= deadline) {
      throw new Error('Gemini video processing timed out.')
    }
    await waitForGeminiFilePoll()
    const fileId = current.name.replace(/^files\//, '')
    const statusResponse = await fetch(
      `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/${fileId}`,
      { headers: { 'x-goog-api-key': apiKey } },
    )
    if (!statusResponse.ok) {
      throw new Error(
        `Gemini video processing status failed (${statusResponse.status}).`,
      )
    }
    current = GeminiFileStatusSchema.parse(await statusResponse.json())
  }

  if (current.state === 'FAILED' || !current.uri) {
    throw new Error('Gemini could not process the attached video.')
  }

  return {
    name: current.name,
    uri: current.uri,
    mimeType: current.mimeType ?? mimeType,
  }
}

async function toGeminiVideoPart(
  videoUrl: string,
  apiKey: string,
  videoAnalysis?: VideoAnalysisWindow,
): Promise<GeminiVideoPartResult> {
  const videoMetadata = toGeminiVideoMetadata(videoAnalysis)
  const withMetadata = (part: Record<string, unknown>) =>
    videoMetadata ? { ...part, videoMetadata } : part

  // ⚠ **YouTube 分支必须在 fetch 之前**（§4.2 点名的实现陷阱）：YouTube 页面是
  // `text/html`，先抓再验 content-type 的话下面那道 `video/` 校验会把它拒掉，
  // 而 Gemini 根本不需要我们去抓 —— `fileData.fileUri` 直接吃页面 URL
  // （🔬 切片 0 实测：18m41s 直传 HTTP 200；1 小时 326k token 也没撞上限）。
  // 免下载、零存储、不占我们 50MB 的帽。
  const classification = classifyVideoLink(videoUrl)
  if (classification.kind === VIDEO_LINK_KINDS.youtube) {
    return {
      part: withMetadata({
        fileData: { fileUri: buildYoutubeWatchUrl(classification.videoId) },
      }),
      linkedVideo: true,
    }
  }

  const { buffer, mimeType } = await fetchAsBuffer(videoUrl, {
    maxBytes: ASSISTANT_MEDIA_LIMITS.maxVideoBytes,
  })
  if (!mimeType.startsWith('video/')) {
    throw new Error('Assistant video reference did not resolve to a video.')
  }

  if (buffer.byteLength < ASSISTANT_MEDIA_LIMITS.geminiInlineMaxBytes) {
    return {
      part: withMetadata({
        inlineData: { mimeType, data: buffer.toString('base64') },
      }),
    }
  }

  const uploaded = await uploadGeminiVideoFile(buffer, mimeType, apiKey)
  return {
    part: withMetadata({
      fileData: {
        mimeType: uploaded.mimeType,
        fileUri: uploaded.uri,
      },
    }),
    uploadedFileName: uploaded.name,
  }
}

async function deleteGeminiUploadedFile(
  name: string,
  apiKey: string,
): Promise<void> {
  const fileId = name.replace(/^files\//, '')
  const response = await fetch(
    `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/${fileId}`,
    { method: 'DELETE', headers: { 'x-goog-api-key': apiKey } },
  )
  if (!response.ok) {
    logger.warn('Gemini assistant video cleanup failed', {
      fileId,
      status: response.status,
    })
  }
}

/**
 * Build the Gemini request once so the buffered and streaming branches can't
 * drift apart. Uploaded video files are returned rather than deleted here —
 * the streaming branch must keep them alive until the body is fully consumed,
 * not just until `fetch` resolves (headers arrive long before the last chunk).
 */
/**
 * ⚠ **坑 1（§4.3.2）**：thinking token 从 `maxOutputTokens` 里扣，给 800 实测只
 * 剩 31 字正文 + `finishReason=MAX_TOKENS`。带视频的一轮**只抬不降**到
 * `VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS`。
 *
 * `providerManagedOutput` 那条路本来就不发这个字段（模型自身上限远高于 3000），
 * 助手线走的正是它 —— 这道闸是给**显式指定预算**的调用方兜底的。
 */
function resolveGeminiMaxOutputTokens(
  input: LlmTextInput,
  hasVideoPart: boolean,
): number | null {
  if (input.providerManagedOutput || !input.maxTokens) return null
  return hasVideoPart
    ? Math.max(input.maxTokens, VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS)
    : input.maxTokens
}

async function buildGeminiRequest(input: LlmTextInput): Promise<{
  modelId: string
  baseUrl: string
  body: string
  uploadedVideoNames: string[]
  /** 请求里带了指向外部链接的视频（YouTube 直传）—— 403 的翻译要换一套。 */
  hasLinkedVideo: boolean
}> {
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.GEMINI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI

  const parts: Array<Record<string, unknown>> = []

  if (input.imageData) {
    const images = Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    const imageParts = await Promise.all(images.map(toGeminiInlinePart))
    parts.push(...imageParts)
  }

  const uploadedVideoNames: string[] = []
  let hasVideoPart = false
  let hasLinkedVideo = false
  if (input.videoData) {
    const videos = Array.isArray(input.videoData)
      ? input.videoData
      : [input.videoData]
    const videoParts = await Promise.all(
      videos.map((video) =>
        toGeminiVideoPart(video, input.apiKey, input.videoAnalysis),
      ),
    )
    parts.push(...videoParts.map((entry) => entry.part))
    hasVideoPart = videoParts.length > 0
    hasLinkedVideo = videoParts.some((entry) => entry.linkedVideo === true)
    uploadedVideoNames.push(
      ...videoParts.flatMap((entry) =>
        entry.uploadedFileName ? [entry.uploadedFileName] : [],
      ),
    )
  }

  parts.push({ text: input.userPrompt })

  const maxOutputTokens = resolveGeminiMaxOutputTokens(input, hasVideoPart)

  return {
    modelId,
    baseUrl,
    uploadedVideoNames,
    hasLinkedVideo,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: input.systemPrompt }],
      },
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT'],
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(input.responseFormat === 'json_object'
          ? { responseMimeType: 'application/json' }
          : {}),
      },
      ...(input.useGrounding ? { tools: [{ google_search: {} }] } : {}),
    }),
  }
}

/**
 * Gemini 用 **HTTP 200 + 空 parts** 表达好几种失败，真因只在 `finishReason` /
 * `promptFeedback.blockReason` 里。把它们翻成可归因的错误，别再丢。
 *
 * 2026-08-19 生产事故：这里原本抛裸 `Error('No text response from Gemini')`，
 * 被 `api-route-factory` 兜成 500 INTERNAL_ERROR，用户只看到「发生了意外错误」，
 * 排查时完全分不清是内容被拦、输出被截断，还是真的挂了。
 */
function buildGeminiNoTextError(
  data: z.infer<typeof GeminiTextResponseSchema>,
  modelId: string,
): ApiRequestError {
  const blockReason = data.promptFeedback?.blockReason
  const finishReason = data.candidates?.[0]?.finishReason

  if (blockReason) {
    return new ApiRequestError(
      'ASSISTANT_CONTENT_BLOCKED',
      422,
      'errors.assistant.contentBlocked',
      `Gemini blocked the request (blockReason=${blockReason}, model=${modelId}).`,
    )
  }
  if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
    return new ApiRequestError(
      'ASSISTANT_CONTENT_BLOCKED',
      422,
      'errors.assistant.contentBlocked',
      `Gemini stopped on safety (finishReason=${finishReason}, model=${modelId}).`,
    )
  }
  if (finishReason === 'MAX_TOKENS') {
    // thinking token 也从输出预算里扣 —— 预算紧时会出现「思考完了没剩下正文」。
    return new ApiRequestError(
      'ASSISTANT_OUTPUT_TRUNCATED',
      502,
      'errors.assistant.outputTruncated',
      `Gemini hit the output cap before emitting text (model=${modelId}).`,
    )
  }
  return new ApiRequestError(
    'ASSISTANT_NO_TEXT_RESPONSE',
    502,
    'errors.assistant.noTextResponse',
    `Gemini returned no text (finishReason=${finishReason ?? 'unknown'}, model=${modelId}).`,
  )
}

async function geminiTextCompletion(input: LlmTextInput): Promise<string> {
  const { modelId, baseUrl, body, uploadedVideoNames, hasLinkedVideo } =
    await buildGeminiRequest(input)
  const endpoint = `${baseUrl}/${modelId}:generateContent`

  let response: Response
  try {
    response = await fetchLlmTextBuffered(
      endpoint,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': input.apiKey,
          'Content-Type': 'application/json',
        },
        body,
      },
      { adapterType: AI_ADAPTER_TYPES.GEMINI, modelId },
    )
  } finally {
    await Promise.allSettled(
      uploadedVideoNames.map((name) =>
        deleteGeminiUploadedFile(name, input.apiKey),
      ),
    )
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      modelId,
      hasLinkedVideo,
    })
  }

  const data = GeminiTextResponseSchema.parse(await response.json())
  const textPart = data.candidates?.[0]?.content?.parts?.find((p) => p.text)

  if (!textPart?.text) {
    throw buildGeminiNoTextError(data, modelId)
  }

  return textPart.text.trim()
}

/**
 * OpenAI `/chat/completions` 的请求，缓冲与流式共用一份 —— 同 Gemini 那条的理由：
 * 两条各建各的 body 迟早漂移，而漂移的表现是「流式的回答和缓冲的不一样」。
 */
function buildOpenAiChatRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): { endpoint: string; requestModelId: string; body: string } {
  if (input.videoData) {
    throw new Error('OpenAI assistant route does not support video input.')
  }
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.OPENAI]
  const requestModelId = input.useGrounding
    ? LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_SEARCH_API
    : modelId
  const baseUrl = getOpenAiChatBaseUrl(input.providerConfig.baseUrl)

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: input.systemPrompt },
  ]

  if (input.imageData) {
    const images = Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    const content: Array<Record<string, unknown>> = images.map((img) => ({
      type: 'image_url',
      image_url: { url: img },
    }))
    content.push({ type: 'text', text: input.userPrompt })
    messages.push({ role: 'user', content })
  } else {
    messages.push({ role: 'user', content: input.userPrompt })
  }

  return {
    endpoint: `${baseUrl}/chat/completions`,
    requestModelId,
    body: JSON.stringify({
      model: requestModelId,
      messages,
      ...(options.stream ? { stream: true } : {}),
      ...(!input.providerManagedOutput
        ? getOpenAiTokenLimit(
            requestModelId,
            resolveOpenAiCompletionBudget(requestModelId, input.maxTokens),
          )
        : {}),
      ...(input.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(input.useGrounding ? { web_search_options: {} } : {}),
    }),
  }
}

async function openAiTextCompletion(input: LlmTextInput): Promise<string> {
  const { endpoint, requestModelId, body } = buildOpenAiChatRequest(input)

  const response = await fetchLlmTextBuffered(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    },
    { adapterType: AI_ADAPTER_TYPES.OPENAI, modelId: requestModelId },
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: requestModelId,
    })
  }

  const data = OpenAiChatResponseSchema.parse(await response.json())
  const content = getOpenAiChatText(data)

  if (!content) {
    throwNoOpenAiTextResponse(data, requestModelId)
  }

  return content
}

/**
 * DeepSeek `/chat/completions` 的请求，缓冲与流式共用一份 —— 同
 * `buildOpenAiChatRequest` 的理由：两条各建各的 body 迟早漂移，而漂移的表现是
 * 「流式的回答和缓冲的不一样」。
 */
function buildDeepseekChatRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): { endpoint: string; modelId: string; body: string } {
  if (input.imageData) {
    throw new Error('DeepSeek text completion does not support image input.')
  }
  if (input.videoData) {
    throw new Error('DeepSeek text completion does not support video input.')
  }

  if (input.useGrounding) {
    throw new Error('DeepSeek text completion does not support grounding.')
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.DEEPSEEK]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.DEEPSEEK

  return {
    endpoint: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    modelId,
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      ...(options.stream ? { stream: true } : {}),
      ...(!input.providerManagedOutput
        ? {
            max_tokens: input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT,
          }
        : {}),
      ...(input.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
  }
}

async function deepseekTextCompletion(input: LlmTextInput): Promise<string> {
  const { endpoint, modelId, body } = buildDeepseekChatRequest(input)

  const response = await fetchLlmTextBuffered(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    },
    { adapterType: AI_ADAPTER_TYPES.DEEPSEEK, modelId },
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      modelId,
    })
  }

  const data = OpenAiChatResponseSchema.parse(await response.json())
  const content = getOpenAiChatText(data)

  if (!content) {
    throw new Error('No text response from DeepSeek')
  }

  return content
}

/**
 * DashScope (Qwen) text completion — OpenAI `/chat/completions` drop-in
 * compatible. Generalized from `deepseekTextCompletion` with three differences:
 *  1. Image input is supported — VL models (e.g. qwen3-vl-plus) take images as
 *     `{ type: 'image_url', image_url: { url } }` content (OpenAI multimodal
 *     shape), so we do NOT hard-throw on `imageData`.
 *  2. For structured JSON output, Qwen requires the prompt to literally contain
 *     the word "json" and `enable_thinking: false` — both handled here.
 *  3. No grounding / web_search support (compatible-mode has no such tool).
 */
function buildDashscopeChatRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): { endpoint: string; modelId: string; body: string } {
  if (input.videoData) {
    throw new Error('Qwen text completion does not support video input.')
  }
  if (input.useGrounding) {
    throw new Error(
      'Qwen (DashScope) text completion does not support grounding.',
    )
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.DASHSCOPE]
  const baseUrl =
    input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.DASHSCOPE

  const wantsJson = input.responseFormat === 'json_object'
  // Qwen's JSON mode requires the literal token "json" somewhere in the
  // messages. If the caller's prompt doesn't already mention it, append a
  // minimal instruction so structured output doesn't 400.
  const systemPrompt =
    wantsJson && !/json/i.test(`${input.systemPrompt} ${input.userPrompt}`)
      ? `${input.systemPrompt}\n\nRespond with valid JSON.`
      : input.systemPrompt

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
  ]

  if (input.imageData) {
    const images = Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    const content: Array<Record<string, unknown>> = images.map((img) => ({
      type: 'image_url',
      image_url: { url: img },
    }))
    content.push({ type: 'text', text: input.userPrompt })
    messages.push({ role: 'user', content })
  } else {
    messages.push({ role: 'user', content: input.userPrompt })
  }

  return {
    endpoint: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    modelId,
    body: JSON.stringify({
      model: modelId,
      messages,
      ...(options.stream ? { stream: true } : {}),
      ...(!input.providerManagedOutput
        ? {
            max_tokens: input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT,
          }
        : {}),
      ...(wantsJson
        ? { response_format: { type: 'json_object' }, enable_thinking: false }
        : {}),
    }),
  }
}

async function dashscopeTextCompletion(input: LlmTextInput): Promise<string> {
  const { endpoint, modelId, body } = buildDashscopeChatRequest(input)

  const response = await fetchLlmTextBuffered(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    },
    { adapterType: AI_ADAPTER_TYPES.DASHSCOPE, modelId },
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
      modelId,
    })
  }

  const data = OpenAiChatResponseSchema.parse(await response.json())
  const content = getOpenAiChatText(data)

  if (!content) {
    throw new Error('No text response from Qwen')
  }

  return content
}

/**
 * xAI (Grok) `/chat/completions` request — OpenAI drop-in (xAI's docs state
 * "full compatibility with the OpenAI REST API"), shared by the buffered and
 * streaming consumers.
 *
 * ⚠ Deliberately NOT routed through `buildOpenAiChatRequest`, even though the
 * wire format matches. That helper is OpenAI-specific in two ways that would
 * silently break this route: it resolves its base URL via
 * `getOpenAiChatBaseUrl()` (which falls back to **OpenAI's** host), and on
 * `useGrounding` it swaps `modelId` for `OPENAI_GPT_5_SEARCH_API` — i.e. a
 * grounded Grok turn would be billed to OpenAI. Copying the DeepSeek/DashScope
 * shape keeps this route's host and model ids its own; it also sidesteps
 * `isOpenAiReasoningModel`, whose `/^(gpt-5|o[134])/` regex never matches a
 * `grok-*` id and would hand Grok a too-small token budget.
 *
 * Image input IS supported (grok-4.6 takes `text, image → text`; 20MiB max,
 * jpg/png only) using the same OpenAI multimodal content shape Qwen uses.
 * Video and grounding are not — xAI's Live Search is a separate API surface,
 * so we fail loudly rather than silently dropping the request.
 */
function buildXaiChatRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): { endpoint: string; modelId: string; body: string } {
  if (input.videoData) {
    throw new Error('Grok (xAI) text completion does not support video input.')
  }
  if (input.useGrounding) {
    throw new Error('Grok (xAI) text completion does not support grounding.')
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.XAI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.XAI

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: input.systemPrompt },
  ]

  if (input.imageData) {
    const images = Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    const content: Array<Record<string, unknown>> = images.map((img) => ({
      type: 'image_url',
      image_url: { url: img },
    }))
    content.push({ type: 'text', text: input.userPrompt })
    messages.push({ role: 'user', content })
  } else {
    messages.push({ role: 'user', content: input.userPrompt })
  }

  return {
    endpoint: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    modelId,
    body: JSON.stringify({
      model: modelId,
      messages,
      ...(options.stream ? { stream: true } : {}),
      ...(!input.providerManagedOutput
        ? {
            max_tokens: input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT,
          }
        : {}),
      ...(input.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
  }
}

async function xaiTextCompletion(input: LlmTextInput): Promise<string> {
  const { endpoint, modelId, body } = buildXaiChatRequest(input)

  const response = await fetchLlmTextBuffered(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    },
    { adapterType: AI_ADAPTER_TYPES.XAI, modelId },
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.XAI,
      modelId,
    })
  }

  const data = OpenAiChatResponseSchema.parse(await response.json())
  const content = getOpenAiChatText(data)

  if (!content) {
    throw new Error('No text response from Grok')
  }

  return content
}

/**
 * Claude (Anthropic) text completion — the Messages API, NOT an
 * OpenAI-compatible drop-in. Four deliberate differences from the branches
 * above (docs/references/pages/assistant-shell.md):
 *  1. `max_tokens` is required on every request — `providerManagedOutput`
 *     can't mean "omit the field" the way it does for OpenAI/DeepSeek/Qwen,
 *     so it maps to a wide managed ceiling instead.
 *  2. The system prompt is a top-level `system` field, not a `role:'system'`
 *     message.
 *  3. There is no `response_format`. JSON mode is forced via an assistant
 *     prefill: append `{role:'assistant', content:'{'}`, then stitch the
 *     leading `'{'` back onto the model's continuation. This is required,
 *     not optional — node-script-doc.service.ts always requests
 *     `responseFormat: 'json_object'`, so ScriptDoc drafting breaks on the
 *     Claude route without it.
 *     ⚠ UNVERIFIED AGAINST THE LIVE API: current Anthropic docs describe
 *     last-assistant-turn prefill as rejected with a 400 on the Claude 4.6+
 *     model family, Claude Sonnet 5 included — see the model-migration notes
 *     for Claude Sonnet 5 ("assistant-turn prefills still return a 400 …
 *     unchanged from Sonnet 4.6"). Implemented exactly as specified in the
 *     plan doc above; if the live API does reject this, the fix is
 *     `output_config.format` (structured outputs — needs a real JSON schema
 *     threaded through `LlmTextInput`, not just the `'json_object'` flag) or
 *     a system-prompt instruction instead of the prefill. Flagged, not
 *     changed — see canvas-assistant-anthropic-route implementation report.
 *  4. No vision, no grounding — both hard-throw, same guard style as
 *     `deepseekTextCompletion` above.
 */
const AnthropicTextResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }),
  ),
})

function buildAnthropicMessagesRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): { endpoint: string; modelId: string; body: string } {
  if (input.imageData) {
    throw new Error('Claude text completion does not support image input.')
  }
  if (input.videoData) {
    throw new Error('Claude text completion does not support video input.')
  }

  if (input.useGrounding) {
    throw new Error('Claude text completion does not support grounding.')
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.ANTHROPIC]
  const baseUrl =
    input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.ANTHROPIC

  const wantsJson = input.responseFormat === 'json_object'
  // ⚠ Anthropic has NO `response_format`, and **assistant-turn prefill returns
  // a 400 on Sonnet 5** (removed across the 4.6+ family) — so the usual
  // "prefill a `{`" trick is not available here; don't reintroduce it.
  // The real structured-output surface is `output_config.format` with a
  // *json_schema*, but `LlmTextInput.responseFormat` only carries the
  // schemaless `'json_object'` flag, so there's no schema to hand it at this
  // layer. Until a schema is threaded through, we do what the DashScope branch
  // does — instruct in the system prompt — and lean on the existing
  // fence-tolerant parse + `validateLlmStructuredOutput` downstream.
  const systemPrompt = wantsJson
    ? `${input.systemPrompt}\n\nRespond with a single valid JSON object and nothing else — no prose, no markdown code fences.`
    : input.systemPrompt

  return {
    endpoint: `${baseUrl.replace(/\/$/, '')}${ANTHROPIC_API.MESSAGES_PATH}`,
    modelId,
    body: JSON.stringify({
      model: modelId,
      ...(options.stream ? { stream: true } : {}),
      max_tokens: input.providerManagedOutput
        ? LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC_MANAGED
        : (input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT),
      // ⚠ Sonnet 5 runs **adaptive thinking when `thinking` is omitted**, and
      // `max_tokens` caps thinking + answer *together* — a 1024-token default
      // could be spent entirely on thinking and truncate the reply. The other
      // four adapters here don't think, and every caller's token budget was
      // sized against that, so keep parity and turn it off. (Accepted only at
      // effort `high` or below; we never set `effort`, and its default is
      // `high` — pairing disabled thinking with `xhigh`/`max` would 400.)
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
    }),
  }
}

/** Anthropic 的鉴权头与那四家不同（`x-api-key` + 版本号），两个消费者共用。 */
function anthropicRequestInit(
  apiKey: string,
  body: string,
  workspaceId?: string,
) {
  return {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API.VERSION,
      ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
      'content-type': 'application/json',
    },
    body,
  }
}

async function anthropicTextCompletion(input: LlmTextInput): Promise<string> {
  const { endpoint, modelId, body } = buildAnthropicMessagesRequest(input)

  const response = await fetchLlmTextBuffered(
    endpoint,
    anthropicRequestInit(
      input.apiKey,
      body,
      input.providerConfig.anthropicWorkspaceId,
    ),
    { adapterType: AI_ADAPTER_TYPES.ANTHROPIC, modelId },
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId,
    })
  }

  const data = AnthropicTextResponseSchema.parse(await response.json())
  const textBlock = data.content.find((block) => block.type === 'text')

  if (!textBlock?.text) {
    throw new Error('No text response from Claude')
  }

  return textBlock.text.trim()
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
function guardUserPrompt(prompt: string, maxLength?: number | null): void {
  if (!prompt) return
  const result = validatePrompt(prompt, maxLength)
  if (!result.valid) {
    throw new Error(`Prompt rejected by guard: ${result.reason}`)
  }
  if (result.warnings.length > 0) {
    logger.warn('Prompt guard warnings', { warnings: result.warnings })
  }
}

async function* geminiTextStream(input: LlmTextInput): AsyncIterable<string> {
  const { modelId, baseUrl, body, uploadedVideoNames, hasLinkedVideo } =
    await buildGeminiRequest(input)
  const endpoint = `${baseUrl}/${modelId}:streamGenerateContent?alt=sse`

  try {
    const response = await fetchLlmTextStreaming(
      endpoint,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': input.apiKey,
          'Content-Type': 'application/json',
        },
        body,
      },
      { adapterType: AI_ADAPTER_TYPES.GEMINI, modelId },
    )

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw toLlmTextProviderError(response.status, errorBody, {
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        modelId,
        hasLinkedVideo,
      })
    }
    if (!response.body) {
      throw new Error('No text response from Gemini')
    }

    for await (const data of readSseData(response.body)) {
      if (!data || data === '[DONE]') continue
      let parsed: unknown
      try {
        parsed = JSON.parse(data)
      } catch {
        // 半个事件不该炸掉整条流；下一个事件照常处理。
        continue
      }
      const chunk = GeminiTextResponseSchema.safeParse(parsed)
      if (!chunk.success) continue
      for (const part of chunk.data.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) yield part.text
      }
    }
  } finally {
    // 删上传的视频文件必须等流真读完 —— `fetch` resolve 时只到了响应头，
    // 这时候删会把还没读完的那条流打断。
    await Promise.allSettled(
      uploadedVideoNames.map((name) =>
        deleteGeminiUploadedFile(name, input.apiKey),
      ),
    )
  }
}

/**
 * OpenAI 兼容 `/chat/completions` 的 SSE 消费 —— **四家共用一份**。
 *
 * OpenAI / DeepSeek / Qwen / Grok 的事件格式完全一致
 * （`data: {choices:[{delta:{content}}]}`，以字面量 `[DONE]` 收尾），所以解析
 * 只写一遍。各家的差异全在请求那一侧（host / model id / 能力闸 / JSON 模式的
 * 特殊要求），由各自的 `build*ChatRequest` 负责——这条边界的意义是：接第五家
 * OpenAI 兼容 provider 时只用写它的 request builder。
 */
async function* streamOpenAiCompatibleChat(options: {
  endpoint: string
  body: string
  apiKey: string
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  label: string
}): AsyncIterable<string> {
  const response = await fetchLlmTextStreaming(
    options.endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: options.body,
    },
    { adapterType: options.adapterType, modelId: options.modelId },
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: options.adapterType,
      modelId: options.modelId,
    })
  }
  if (!response.body) {
    // 流式没有可诊断的响应体可交给 `throwNoOpenAiTextResponse` —— 那个函数是用来
    // 从解析好的 completion 里挖 refusal / finish_reason 的，这里根本没有。
    throw new Error(`No text stream from ${options.label} (${options.modelId})`)
  }

  for await (const data of readSseData(response.body)) {
    // OpenAI 兼容的流以字面量 `[DONE]` 收尾，它不是 JSON。
    if (!data || data === '[DONE]') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      // 半个事件不该炸掉整条流；下一个事件照常处理。
      continue
    }
    const delta = (
      parsed as {
        choices?: { delta?: { content?: string | null } }[]
      }
    ).choices?.[0]?.delta?.content
    if (delta) yield delta
  }
}

export async function* openAiTextStream(
  input: LlmTextInput,
): AsyncIterable<string> {
  const { endpoint, requestModelId, body } = buildOpenAiChatRequest(input, {
    stream: true,
  })

  yield* streamOpenAiCompatibleChat({
    endpoint,
    body,
    apiKey: input.apiKey,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: requestModelId,
    label: LLM_TEXT_LABELS[AI_ADAPTER_TYPES.OPENAI],
  })
}

async function* deepseekTextStream(input: LlmTextInput): AsyncIterable<string> {
  const { endpoint, modelId, body } = buildDeepseekChatRequest(input, {
    stream: true,
  })

  yield* streamOpenAiCompatibleChat({
    endpoint,
    body,
    apiKey: input.apiKey,
    adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    modelId,
    label: LLM_TEXT_LABELS[AI_ADAPTER_TYPES.DEEPSEEK],
  })
}

async function* dashscopeTextStream(
  input: LlmTextInput,
): AsyncIterable<string> {
  const { endpoint, modelId, body } = buildDashscopeChatRequest(input, {
    stream: true,
  })

  yield* streamOpenAiCompatibleChat({
    endpoint,
    body,
    apiKey: input.apiKey,
    adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
    modelId,
    label: LLM_TEXT_LABELS[AI_ADAPTER_TYPES.DASHSCOPE],
  })
}

/**
 * Claude 的 SSE —— **不与那四家共用解析**，它是 Anthropic 自己的事件格式
 * （官方文档 `platform.claude.com/docs/en/build-with-claude/streaming`，
 * 2026-08-25 查证）：
 *
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"…"}}
 *
 * 以 `message_stop` 收尾，没有 `[DONE]` 哨兵。
 *
 * ⚠ 只取 `text_delta`。同一个 `content_block_delta` 还会驮 `thinking_delta` /
 * `signature_delta`（扩展思考）与 `input_json_delta`（工具调用）—— 把它们当正文
 * yield 出去，就是把模型的思考过程念给用户听。本仓的 Claude 分支恒
 * `thinking: {type:'disabled'}`，但这道判据不能靠那个配置兜着：配置是能改的。
 */
async function* anthropicTextStream(
  input: LlmTextInput,
): AsyncIterable<string> {
  const { endpoint, modelId, body } = buildAnthropicMessagesRequest(input, {
    stream: true,
  })

  const response = await fetchLlmTextStreaming(
    endpoint,
    anthropicRequestInit(
      input.apiKey,
      body,
      input.providerConfig.anthropicWorkspaceId,
    ),
    { adapterType: AI_ADAPTER_TYPES.ANTHROPIC, modelId },
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId,
    })
  }
  if (!response.body) {
    throw new Error(`No text stream from Claude (${modelId})`)
  }

  for await (const data of readSseData(response.body)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      continue
    }
    const delta = (
      parsed as { delta?: { type?: string; text?: string | null } }
    ).delta
    if (delta?.type === 'text_delta' && delta.text) yield delta.text
  }
}

async function* xaiTextStream(input: LlmTextInput): AsyncIterable<string> {
  const { endpoint, modelId, body } = buildXaiChatRequest(input, {
    stream: true,
  })

  yield* streamOpenAiCompatibleChat({
    endpoint,
    body,
    apiKey: input.apiKey,
    adapterType: AI_ADAPTER_TYPES.XAI,
    modelId,
    label: LLM_TEXT_LABELS[AI_ADAPTER_TYPES.XAI],
  })
}

/**
 * 每一家的 SSE 实现 —— **穷举 Record，没有兜底分支**。
 *
 * ⭐ 这张表取代了原先的 `LLM_TEXT_STREAMING_ADAPTERS: Set` + 「不在集合里就缓冲」
 *    降级。那条降级是 2026-08-24 生产 504 能活下来的原因：08-23 接 Grok 时只写了
 *    缓冲那一半，`llmTextStream` 于是静默地 `yield await llmTextCompletion()`，
 *    形态一模一样、行为天差地别（一个逐字、一个等完再一坨），**编译器和测试都不
 *    会说话**，直到线上一条长对话把 60 秒跑穿。
 *
 *    原来的注释写着「调用方要区分就查 `supportsLlmTextStreaming()`」——
 *    实际上没有任何调用方去查过。这正是 Engineering Principles 1 禁的那种
 *    fallback：它让缺陷可以静默存在。
 *
 * ⛔ **不许加 `default` / 索引签名 / `Partial`**。这张表的全部价值就是：接第七家
 *    LLM 文本 provider 时漏写 stream 实现，`tsc` 当场报
 *    「Property '<家>' is missing」，而不是等生产给你一个 504。
 */
export const LLM_TEXT_STREAMS: Record<
  LlmTextAdapterType,
  (input: LlmTextInput) => AsyncIterable<string>
> = {
  [AI_ADAPTER_TYPES.GEMINI]: geminiTextStream,
  [AI_ADAPTER_TYPES.OPENAI]: openAiTextStream,
  [AI_ADAPTER_TYPES.DEEPSEEK]: deepseekTextStream,
  [AI_ADAPTER_TYPES.DASHSCOPE]: dashscopeTextStream,
  [AI_ADAPTER_TYPES.ANTHROPIC]: anthropicTextStream,
  [AI_ADAPTER_TYPES.XAI]: xaiTextStream,
}

export async function* llmTextStream(
  input: LlmTextInput,
): AsyncIterable<string> {
  if (!isLlmTextAdapter(input.adapterType)) {
    // 与 `llmTextCompletion` 的 default 同一条：大声失败，不静默降级。
    throw new Error(
      `LLM text streaming not supported for adapter: ${input.adapterType}`,
    )
  }

  guardUserPrompt(input.userPrompt, input.promptGuardMaxLength)
  yield* LLM_TEXT_STREAMS[input.adapterType](input)
}

/**
 * Complete a text prompt using the specified LLM provider.
 * Supports pure text and multimodal (image + text) input.
 */
export async function llmTextCompletion(input: LlmTextInput): Promise<string> {
  guardUserPrompt(input.userPrompt, input.promptGuardMaxLength)
  switch (input.adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return geminiTextCompletion(input)
    case AI_ADAPTER_TYPES.OPENAI:
      return openAiTextCompletion(input)
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return deepseekTextCompletion(input)
    case AI_ADAPTER_TYPES.DASHSCOPE:
      return dashscopeTextCompletion(input)
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return anthropicTextCompletion(input)
    case AI_ADAPTER_TYPES.XAI:
      return xaiTextCompletion(input)
    default:
      throw new Error(
        `LLM text completion not supported for adapter: ${input.adapterType}`,
      )
  }
}
