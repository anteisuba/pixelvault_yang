import 'server-only'

/** xAI（Grok）：补全与流式。（o-llm 拆分，2026-11-01；见 docs/design/llm.md） */

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  AI_PROVIDER_ENDPOINTS,
  LLM_TEXT_DEFAULT_MAX_TOKENS,
} from '@/constants/config'
import {
  LLM_TEXT_LABELS,
  LLM_TEXT_MODELS,
  type LlmTextInput,
  checkTextFinishReason,
  fetchLlmTextBuffered,
  getLlmImages,
  readLlmErrorBody,
  readOpenAiCompatibleUsage,
  reportUsage,
  serializeLlmRequest,
  textResponseError,
  toLlmTextProviderError,
  withImageLabels,
} from '@/services/llm/llm-core'
import {
  OpenAiChatResponseSchema,
  getOpenAiChatText,
  streamOpenAiCompatibleChat,
} from '@/services/llm/llm-openai'

/**
 * xAI (Grok) `/chat/completions` request — OpenAI drop-in (xAI's docs state
 * "full compatibility with the OpenAI REST API"), shared by the buffered and
 * streaming consumers.
 *
 * ⚠ Deliberately NOT routed through `buildOpenAiChatRequest`, even though the
 * wire format matches. That helper resolves its base URL via
 * `getOpenAiChatBaseUrl()`, which falls back to **OpenAI's** host — a Grok
 * turn would be billed to OpenAI. Copying the DeepSeek shape keeps this
 * route's host its own; it also sidesteps
 * `isOpenAiReasoningModel`, whose `/^(gpt-[56]|o[134])/` regex never matches a
 * `grok-*` id. Token budget is `max_completion_tokens` (visible only) plus
 * `reasoning_effort: 'low'` — not the deprecated `max_tokens` total cap.
 *
 * Image input IS supported (grok-4.7 takes `text, image → text`; 20MiB max,
 * jpg/png only) using the same OpenAI multimodal content shape DeepSeek uses.
 * Video is not; xAI search lives on the Responses API (`xaiNativeWebSearch`).
 */
function buildXaiChatRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): { endpoint: string; modelId: string; body: string } {
  if (input.videoData) {
    throw new Error('Grok (xAI) text completion does not support video input.')
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.XAI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.XAI

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: input.systemPrompt },
  ]

  if (input.imageData) {
    const images = getLlmImages(input)
    const content: Array<Record<string, unknown>> = withImageLabels<
      Record<string, unknown>
    >(
      input,
      images.map((img) => ({ type: 'image_url', image_url: { url: img } })),
      (text) => ({ type: 'text', text }),
    )
    content.push({ type: 'text', text: input.userPrompt })
    messages.push({ role: 'user', content })
  } else {
    messages.push({ role: 'user', content: input.userPrompt })
  }

  return {
    endpoint: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    modelId,
    body: serializeLlmRequest(input, {
      model: modelId,
      messages,
      ...(options.stream ? { stream: true } : {}),
      ...xaiVisibleOutputBudget(input),
      // grok-4.7 reasoning cannot be turned off and defaults to high.
      // Official "low" is the latency-sensitive agentic / tool-calling tier
      // the assistant operator needs; high burns the first-byte window
      // and the client sees a dropped connection.
      reasoning_effort: input.reasoningEffort ?? 'low',
      ...(input.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
  }
}

/**
 * Visible-output budget for grok-4.7. Official Chat Completions field is
 * `max_completion_tokens` (visible tokens only; default 128k when omitted).
 * `max_tokens` is deprecated and must not be sent — a leftover 1024-sized
 * total cap is spent on reasoning before any JSON lands.
 *
 * `providerManagedOutput` omits the field so the 128k default applies,
 * same shape as OpenAI reasoning. Explicit caller budgets are raised to
 * the XAI floor; it is a cap, not spend.
 */
function xaiVisibleOutputBudget(input: LlmTextInput): {
  max_completion_tokens?: number
} {
  if (input.providerManagedOutput) return {}
  const requested = input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.XAI
  return {
    max_completion_tokens: Math.max(requested, LLM_TEXT_DEFAULT_MAX_TOKENS.XAI),
  }
}

export async function xaiTextCompletion(input: LlmTextInput): Promise<string> {
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
    input.signal,
  )

  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, input.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.XAI,
      modelId,
    })
  }

  const json: unknown = await response.json()
  reportUsage(input, readOpenAiCompatibleUsage(json))
  const data = OpenAiChatResponseSchema.parse(json)
  const content = getOpenAiChatText(data)

  checkTextFinishReason(
    data.choices[0]?.finish_reason,
    modelId,
    data.choices[0]?.message.refusal,
  )
  if (!content) throw textResponseError(modelId)

  return content
}

export async function* xaiTextStream(
  input: LlmTextInput,
): AsyncIterable<string> {
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
    signal: input.signal,
    onUsage: input.onUsage,
  })
}
