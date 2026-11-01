import 'server-only'

/** OpenAI：Chat Completions 补全与流式（DeepSeek / xAI 复用其中的流式读法）。（o-llm 拆分，2026-11-01；见 docs/design/llm.md） */

import { z } from 'zod'
import {
  AI_PROVIDER_ENDPOINTS,
  LLM_TEXT_DEFAULT_MAX_TOKENS,
} from '@/constants/config'
import { logger } from '@/lib/logger'
import { ApiRequestError } from '@/lib/errors'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LLM_STRUCTURED_OUTPUT_MODELS } from '@/constants/llm-capability'
import {
  LLM_TEXT_LABELS,
  LLM_TEXT_MODELS,
  LLM_TEXT_PROVIDER_ERROR_CODES,
  LLM_TEXT_PROVIDER_ERROR_I18N_KEYS,
  LLM_TEXT_PROVIDER_ERROR_MESSAGES,
  LLM_TEXT_PROVIDER_HTTP_STATUS,
  type LlmTextInput,
  checkTextFinishReason,
  fetchLlmTextBuffered,
  fetchLlmTextStreaming,
  getLlmImages,
  parseLlmStreamEvent,
  prepareInlineImages,
  readLlmErrorBody,
  readLlmSseData,
  readOpenAiCompatibleUsage,
  reportUsage,
  serializeLlmRequest,
  textResponseError,
  toLlmTextProviderError,
  withImageLabels,
} from '@/services/llm/llm-core'

const OpenAiChatTextPartSchema = z.object({
  text: z.string().optional(),
  type: z.string().optional(),
})

export const OpenAiChatResponseSchema = z.object({
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

export function getOpenAiChatBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
  return baseUrl.endsWith('/images')
    ? baseUrl.slice(0, -'/images'.length)
    : baseUrl
}

function isOpenAiReasoningModel(modelId: string): boolean {
  return /^(gpt-[56]|o[134])(?:[.-]|$)/i.test(modelId)
}

/**
 * Resolve completion token budget for OpenAI chat.
 * Reasoning models (gpt-5/6*, o1/o3/o4) bill hidden reasoning against
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

export function getOpenAiChatText(
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

  checkTextFinishReason(finishReason, modelId, choice?.message.refusal)
  throw textResponseError(modelId)
}

/**
 * OpenAI `/chat/completions` 的请求，缓冲与流式共用一份 —— 同 Gemini 那条的理由：
 * 两条各建各的 body 迟早漂移，而漂移的表现是「流式的回答和缓冲的不一样」。
 */
async function buildOpenAiChatRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): Promise<{ endpoint: string; requestModelId: string; body: string }> {
  if (input.videoData) {
    throw new Error('OpenAI assistant route does not support video input.')
  }
  const requestModelId =
    input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.OPENAI]
  const baseUrl = getOpenAiChatBaseUrl(input.providerConfig.baseUrl)

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: input.systemPrompt },
  ]

  if (input.imageData) {
    const inlineImages = await prepareInlineImages(
      getLlmImages(input),
      AI_ADAPTER_TYPES.OPENAI,
      input.signal,
    )
    const content: Array<Record<string, unknown>> = withImageLabels<
      Record<string, unknown>
    >(
      input,
      inlineImages.map((img) => ({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${img.data}`,
          ...(input.imageDetail ? { detail: input.imageDetail } : {}),
        },
      })),
      (text) => ({ type: 'text', text }),
    )
    content.push({ type: 'text', text: input.userPrompt })
    messages.push({ role: 'user', content })
  } else {
    messages.push({ role: 'user', content: input.userPrompt })
  }

  return {
    endpoint: `${baseUrl}/chat/completions`,
    requestModelId,
    body: serializeLlmRequest(input, {
      model: requestModelId,
      messages,
      ...(options.stream ? { stream: true } : {}),
      /**
       * 流式默认不报 usage，要显式要（花费计量，2026-10-08）。⚠ 只对官方端点开：
       * 用户自填的兼容代理未必认这个字段，⛔ 不为计量多出一种报错。
       */
      ...(options.stream && baseUrl === AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
        ? { stream_options: { include_usage: true } }
        : {}),
      // 同上：只对官方端点开，⛔ 不为缓存路由在自填代理上多一种报错。
      ...(input.cacheKey && baseUrl === AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
        ? { prompt_cache_key: input.cacheKey }
        : {}),
      ...(input.reasoningEffort && baseUrl === AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
        ? { reasoning_effort: input.reasoningEffort }
        : {}),
      ...(!input.providerManagedOutput
        ? getOpenAiTokenLimit(
            requestModelId,
            resolveOpenAiCompletionBudget(requestModelId, input.maxTokens),
          )
        : {}),
      ...(input.responseFormat === 'json_object'
        ? {
            response_format:
              input.jsonSchema &&
              LLM_STRUCTURED_OUTPUT_MODELS[AI_ADAPTER_TYPES.OPENAI]?.includes(
                requestModelId,
              )
                ? {
                    type: 'json_schema',
                    json_schema: {
                      name: 'assistant_output',
                      strict: true,
                      schema: input.jsonSchema,
                    },
                  }
                : { type: 'json_object' },
          }
        : {}),
    }),
  }
}

export async function openAiTextCompletion(
  input: LlmTextInput,
): Promise<string> {
  const { endpoint, requestModelId, body } = await buildOpenAiChatRequest(input)

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
    input.signal,
  )

  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, input.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: requestModelId,
    })
  }

  const json: unknown = await response.json()
  reportUsage(input, readOpenAiCompatibleUsage(json))
  const data = OpenAiChatResponseSchema.parse(json)
  const content = getOpenAiChatText(data)

  if (!content) {
    throwNoOpenAiTextResponse(data, requestModelId)
  }

  checkTextFinishReason(
    data.choices[0]?.finish_reason,
    requestModelId,
    data.choices[0]?.message.refusal,
  )
  return content
}

/**
 * OpenAI 兼容 `/chat/completions` 的 SSE 消费 —— **四家共用一份**。
 *
 * OpenAI / DeepSeek / Grok 的事件格式完全一致
 * （`data: {choices:[{delta:{content}}]}`，以字面量 `[DONE]` 收尾），所以解析
 * 只写一遍。各家的差异全在请求那一侧（host / model id / 能力闸 / JSON 模式的
 * 特殊要求），由各自的 `build*ChatRequest` 负责——这条边界的意义是：接第五家
 * OpenAI 兼容 provider 时只用写它的 request builder。
 */
const OpenAiChatStreamSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullable().optional(),
            refusal: z.string().nullable().optional(),
          })
          .optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
})

export async function* streamOpenAiCompatibleChat(options: {
  endpoint: string
  body: string
  apiKey: string
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  label: string
  signal?: AbortSignal
  onUsage?: LlmTextInput['onUsage']
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
    options.signal,
  )

  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, options.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: options.adapterType,
      modelId: options.modelId,
    })
  }
  if (!response.body) throw textResponseError(options.modelId)
  let hasText = false
  let finished = false
  for await (const data of readLlmSseData(response.body, options.modelId)) {
    if (!data) continue
    if (data === '[DONE]') {
      finished = true
      break
    }
    const parsed = parseLlmStreamEvent(data, options)
    const usage = readOpenAiCompatibleUsage(parsed)
    if (usage) options.onUsage?.(usage)
    const chunk = OpenAiChatStreamSchema.safeParse(parsed)
    if (!chunk.success) throw textResponseError(options.modelId, true)
    const choice = chunk.data.choices?.[0]
    checkTextFinishReason(
      choice?.finish_reason,
      options.modelId,
      choice?.delta?.refusal,
    )
    const delta = choice?.delta?.content
    if (delta) {
      hasText ||= delta.trim().length > 0
      yield delta
    }
  }
  if (!hasText || !finished) throw textResponseError(options.modelId, hasText)
}

export async function* openAiTextStream(
  input: LlmTextInput,
): AsyncIterable<string> {
  const { endpoint, requestModelId, body } = await buildOpenAiChatRequest(
    input,
    {
      stream: true,
    },
  )

  yield* streamOpenAiCompatibleChat({
    endpoint,
    body,
    apiKey: input.apiKey,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: requestModelId,
    label: LLM_TEXT_LABELS[AI_ADAPTER_TYPES.OPENAI],
    signal: input.signal,
    onUsage: input.onUsage,
  })
}
