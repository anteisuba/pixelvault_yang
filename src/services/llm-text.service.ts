import 'server-only'

import { z } from 'zod'

import { AI_PROVIDER_ENDPOINTS, LLM_TEXT_MODEL_IDS } from '@/constants/config'
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
  /** Optional per-call model override for specialized LLM tasks. */
  modelId?: string
  /** Optional per-call token budget. */
  maxTokens?: number
  /** Request strict JSON where the provider supports it. */
  responseFormat?: 'json_object'
  /**
   * Image input(s) for multimodal completion. Each entry may be either a
   * `data:` URL or an `http(s)` URL — the implementation normalizes per
   * provider:
   *  - Gemini: requires inline base64, so any http(s) URL is fetched
   *    server-side via `fetchAsBuffer` (which guards against SSRF).
   *  - OpenAI / VolcEngine: their chat APIs accept both forms in
   *    `image_url.url`, so the value is forwarded as-is.
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

const OpenAiChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    }),
  ),
})

// ─── LLM Text Models ────────────────────────────────────────────

/** Text-capable LLM adapter types */
const LLM_TEXT_ADAPTERS = [
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.DEEPSEEK,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
] as const

type LlmTextAdapterType = (typeof LLM_TEXT_ADAPTERS)[number]

function isLlmTextAdapter(t: AI_ADAPTER_TYPES): t is LlmTextAdapterType {
  return (LLM_TEXT_ADAPTERS as readonly AI_ADAPTER_TYPES[]).includes(t)
}

const LLM_TEXT_MODELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: LLM_TEXT_MODEL_IDS.GEMINI_3_1_FLASH_LITE,
  [AI_ADAPTER_TYPES.DEEPSEEK]: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
  [AI_ADAPTER_TYPES.OPENAI]: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_4_MINI,
  [AI_ADAPTER_TYPES.VOLCENGINE]:
    LLM_TEXT_MODEL_IDS.VOLCENGINE_DOUBAO_1_5_PRO_32K,
}

const LLM_TEXT_LABELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: 'Gemini',
  [AI_ADAPTER_TYPES.DEEPSEEK]: 'DeepSeek',
  [AI_ADAPTER_TYPES.OPENAI]: 'OpenAI',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'VolcEngine',
}

const LLM_TEXT_IMAGE_MAX_BYTES = 10 * 1024 * 1024

const LLM_TEXT_PROVIDER_HTTP_STATUS = {
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
} as const

const LLM_TEXT_PROVIDER_ERROR_I18N_KEYS = {
  authFailed: 'errors.provider.invalidApiKey',
  insufficientBalance: 'errors.provider.insufficientBalance',
  rateLimited: 'errors.provider.rateLimited',
  temporarilyUnavailable: 'errors.provider.temporarilyUnavailable',
  failed: 'errors.provider.failed',
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
} as const

function getBaseUrlForAdapter(adapterType: LlmTextAdapterType): string {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return AI_PROVIDER_ENDPOINTS.GEMINI
    case AI_ADAPTER_TYPES.OPENAI:
      return AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return AI_PROVIDER_ENDPOINTS.DEEPSEEK
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return AI_PROVIDER_ENDPOINTS.VOLCENGINE
  }
}

function getOpenAiChatBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
  return baseUrl.endsWith('/images')
    ? baseUrl.slice(0, -'/images'.length)
    : baseUrl
}

function getOpenAiTokenLimit(modelId: string, maxTokens: number) {
  if (/^(gpt-5|o[134])(?:[.-]|$)/i.test(modelId)) {
    return { max_completion_tokens: maxTokens }
  }

  return { max_tokens: maxTokens }
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
        ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
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
      model: modelId,
      messages,
      ...getOpenAiTokenLimit(modelId, input.maxTokens ?? 1024),
      ...(input.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(input.useGrounding
        ? { tools: [{ type: 'web_search_preview' }] }
        : {}),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId,
    })
  }

  const data = OpenAiChatResponseSchema.parse(await response.json())
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No text response from OpenAI')
  }

  return content.trim()
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
      max_tokens: input.maxTokens ?? 1024,
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
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No text response from DeepSeek')
  }

  return content.trim()
}

/**
 * VolcEngine (豆包) text completion — OpenAI-compatible chat API.
 * Supports vision (image_url in content) and web search via plugin.
 */
async function volcengineTextCompletion(input: LlmTextInput): Promise<string> {
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.VOLCENGINE]
  const baseUrl =
    input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.VOLCENGINE
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

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    max_tokens: input.maxTokens ?? 1024,
  }

  // VolcEngine web search: use built-in web_search plugin
  if (input.useGrounding) {
    body.tools = [
      {
        type: 'web_search',
        web_search: { enable: true, search_query: input.userPrompt },
      },
    ]
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
      modelId,
    })
  }

  const data = OpenAiChatResponseSchema.parse(await response.json())
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No text response from VolcEngine')
  }

  return content.trim()
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Reject prompts that match a known injection pattern (e.g. `[INST]`,
 * "ignore previous instructions"). System prompts are platform-controlled so
 * they're trusted; only user-supplied content is checked. Callers don't have
 * to remember to call `validatePrompt` themselves — this is the single
 * choke-point every LLM request flows through.
 */
function guardUserPrompt(prompt: string): void {
  if (!prompt) return
  const result = validatePrompt(prompt)
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
  guardUserPrompt(input.userPrompt)
  switch (input.adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return geminiTextCompletion(input)
    case AI_ADAPTER_TYPES.OPENAI:
      return openAiTextCompletion(input)
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return deepseekTextCompletion(input)
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return volcengineTextCompletion(input)
    default:
      throw new Error(
        `LLM text completion not supported for adapter: ${input.adapterType}`,
      )
  }
}
