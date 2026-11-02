import 'server-only'

/** DeepSeek：补全与流式。（o-llm 拆分，2026-11-01；见 docs/design/llm.md） */

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  AI_PROVIDER_ENDPOINTS,
  LLM_TEXT_MODEL_IDS,
  LLM_TEXT_DEFAULT_MAX_TOKENS,
} from '@/constants/config'
import { ASSISTANT_DEEPSEEK_EFFORTS } from '@/constants/assistant-persona'
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
 * DeepSeek `/chat/completions` 的请求，缓冲与流式共用一份 —— 同
 * `buildOpenAiChatRequest` 的理由：两条各建各的 body 迟早漂移，而漂移的表现是
 * 「流式的回答和缓冲的不一样」。
 */
function buildDeepseekChatRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): { endpoint: string; modelId: string; body: string } {
  if (input.videoData) {
    throw new Error('DeepSeek text completion does not support video input.')
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.DEEPSEEK]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.DEEPSEEK

  if (input.imageData && modelId !== LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH) {
    throw new Error(`DeepSeek model ${modelId} does not support image input.`)
  }

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: input.systemPrompt },
  ]
  if (input.imageData) {
    const images = getLlmImages(input)
    const content: Array<Record<string, unknown>> = withImageLabels<
      Record<string, unknown>
    >(
      input,
      images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
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
      ...(!input.providerManagedOutput
        ? {
            max_tokens: input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT,
          }
        : {}),
      ...(input.reasoningEffort
        ? {
            reasoning_effort: ASSISTANT_DEEPSEEK_EFFORTS[input.reasoningEffort],
          }
        : {}),
      ...(input.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
  }
}

export async function deepseekTextCompletion(
  input: LlmTextInput,
): Promise<string> {
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
    input.signal,
  )

  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, input.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
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

export async function* deepseekTextStream(
  input: LlmTextInput,
): AsyncIterable<string> {
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
    signal: input.signal,
    onUsage: input.onUsage,
  })
}
