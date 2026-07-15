import 'server-only'

import { z } from 'zod'

import {
  AI_PROVIDER_ENDPOINTS,
  LLM_TEXT_DEFAULT_MAX_TOKENS,
  LLM_TEXT_MODEL_IDS,
} from '@/constants/config'
import {
  GENERATION_ERROR_CODES,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { db } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { ApiRequestError } from '@/lib/errors'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { validatePrompt } from '@/services/kernel/prompt-guard'
import { fetchAsBuffer } from '@/services/storage/r2'

// ─── Types ───────────────────────────────────────────────────────

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
      }),
    )
    .optional(),
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
const LLM_TEXT_ADAPTERS = [
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.DEEPSEEK,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.DASHSCOPE,
] as const

type LlmTextAdapterType = (typeof LLM_TEXT_ADAPTERS)[number]

function isLlmTextAdapter(t: AI_ADAPTER_TYPES): t is LlmTextAdapterType {
  return (LLM_TEXT_ADAPTERS as readonly AI_ADAPTER_TYPES[]).includes(t)
}

const LLM_TEXT_MODELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: LLM_TEXT_MODEL_IDS.GEMINI_3_1_FLASH_LITE,
  [AI_ADAPTER_TYPES.DEEPSEEK]: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
  [AI_ADAPTER_TYPES.OPENAI]: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_5,
  [AI_ADAPTER_TYPES.DASHSCOPE]: LLM_TEXT_MODEL_IDS.QWEN_PLUS,
}

const LLM_TEXT_LABELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: 'Gemini',
  [AI_ADAPTER_TYPES.DEEPSEEK]: 'DeepSeek',
  [AI_ADAPTER_TYPES.OPENAI]: 'OpenAI',
  [AI_ADAPTER_TYPES.DASHSCOPE]: 'Qwen',
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
} as const

const LLM_TEXT_PROVIDER_ERROR_I18N_KEYS = {
  authFailed: 'errors.provider.invalidApiKey',
  insufficientBalance: 'errors.provider.insufficientBalance',
  rateLimited: 'errors.provider.rateLimited',
  temporarilyUnavailable: 'errors.provider.temporarilyUnavailable',
  failed: 'errors.provider.failed',
  outputBudgetExhausted: 'errors.provider.outputBudgetExhausted',
  contextLimitExceeded: 'errors.provider.contextLimitExceeded',
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
  context: { adapterType: AI_ADAPTER_TYPES; modelId: string },
): ApiRequestError {
  logger.warn('LLM provider request failed', {
    adapterType: context.adapterType,
    modelId: context.modelId,
    responseStatus,
    errorBodySnippet: errorBody.slice(0, 400),
  })
  const parsedCode = parseGenerationErrorCode(`${responseStatus} ${errorBody}`)

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

async function geminiTextCompletion(input: LlmTextInput): Promise<string> {
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.GEMINI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI
  const endpoint = `${baseUrl}/${modelId}:generateContent`

  const parts: Array<Record<string, unknown>> = []

  if (input.imageData) {
    const images = Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    const imageParts = await Promise.all(images.map(toGeminiInlinePart))
    parts.push(...imageParts)
  }

  parts.push({ text: input.userPrompt })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': input.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: input.systemPrompt }],
      },
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT'],
        ...(!input.providerManagedOutput && input.maxTokens
          ? { maxOutputTokens: input.maxTokens }
          : {}),
        ...(input.responseFormat === 'json_object'
          ? { responseMimeType: 'application/json' }
          : {}),
      },
      ...(input.useGrounding ? { tools: [{ google_search: {} }] } : {}),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      modelId,
    })
  }

  const data = GeminiTextResponseSchema.parse(await response.json())
  const textPart = data.candidates?.[0]?.content?.parts?.find((p) => p.text)

  if (!textPart?.text) {
    throw new Error('No text response from Gemini')
  }

  return textPart.text.trim()
}

async function openAiTextCompletion(input: LlmTextInput): Promise<string> {
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.OPENAI]
  const requestModelId = input.useGrounding
    ? LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_SEARCH_API
    : modelId
  const baseUrl = getOpenAiChatBaseUrl(input.providerConfig.baseUrl)
  const endpoint = `${baseUrl}/chat/completions`

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: requestModelId,
      messages,
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
  })

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

async function deepseekTextCompletion(input: LlmTextInput): Promise<string> {
  if (input.imageData) {
    throw new Error('DeepSeek text completion does not support image input.')
  }

  if (input.useGrounding) {
    throw new Error('DeepSeek text completion does not support grounding.')
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.DEEPSEEK]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.DEEPSEEK
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      ...(!input.providerManagedOutput
        ? {
            max_tokens: input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT,
          }
        : {}),
      ...(input.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
  })

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
async function dashscopeTextCompletion(input: LlmTextInput): Promise<string> {
  if (input.useGrounding) {
    throw new Error(
      'Qwen (DashScope) text completion does not support grounding.',
    )
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.DASHSCOPE]
  const baseUrl =
    input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.DASHSCOPE
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      ...(!input.providerManagedOutput
        ? {
            max_tokens: input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT,
          }
        : {}),
      ...(wantsJson
        ? { response_format: { type: 'json_object' }, enable_thinking: false }
        : {}),
    }),
  })

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
    default:
      throw new Error(
        `LLM text completion not supported for adapter: ${input.adapterType}`,
      )
  }
}
