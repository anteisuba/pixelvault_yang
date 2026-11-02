import 'server-only'

/** Anthropic（Claude）：Messages 补全与流式。（o-llm 拆分，2026-11-01；见 docs/design/llm.md） */

import { z } from 'zod'
import {
  LLM_TEXT_DEFAULT_MAX_TOKENS,
  AI_PROVIDER_ENDPOINTS,
  ANTHROPIC_API,
} from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LLM_STRUCTURED_OUTPUT_MODELS } from '@/constants/llm-capability'
import {
  LLM_TEXT_MODELS,
  type LlmTextInput,
  type LlmTextUsage,
  checkTextFinishReason,
  compactUsage,
  fetchLlmTextBuffered,
  fetchLlmTextStreaming,
  getLlmImages,
  parseInlineImage,
  parseLlmStreamEvent,
  readLlmErrorBody,
  readLlmSseData,
  reportUsage,
  serializeLlmRequest,
  textResponseError,
  toLlmTextProviderError,
  toLlmTextRefusalError,
  withImageLabels,
} from '@/services/llm/llm-core'

const AnthropicUsageFieldsSchema = z.object({
  input_tokens: z.number().nullish(),
  output_tokens: z.number().nullish(),
  cache_read_input_tokens: z.number().nullish(),
  cache_creation_input_tokens: z.number().nullish(),
})

/** Claude 的 `input_tokens` 不含缓存读写，三段相加才是整个输入。 */
function toAnthropicUsage(
  usage: z.infer<typeof AnthropicUsageFieldsSchema>,
): LlmTextUsage | null {
  const inputParts = [
    usage.input_tokens,
    usage.cache_read_input_tokens,
    usage.cache_creation_input_tokens,
  ].filter((part): part is number => typeof part === 'number')
  return compactUsage({
    inputTokens:
      inputParts.length > 0
        ? inputParts.reduce((sum, part) => sum + part, 0)
        : null,
    outputTokens: usage.output_tokens,
    reasoningTokens: null,
    cachedInputTokens: usage.cache_read_input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens,
  })
}

const AnthropicResponseUsageSchema = z.object({
  usage: AnthropicUsageFieldsSchema,
})

/** 流式：`message_start` 带输入，`message_delta` 带累计输出。 */
const AnthropicStreamUsageSchema = z.object({
  message: z.object({ usage: AnthropicUsageFieldsSchema }).nullish(),
  usage: AnthropicUsageFieldsSchema.nullish(),
})

/**
 * Claude (Anthropic) text completion — the Messages API, NOT an
 * OpenAI-compatible drop-in. Models: Opus 5.5, Sonnet 5.5, and Fable 5.1.
 * Deliberate differences from the branches above
 * (docs/references/pages/assistant-shell.md):
 *  1. `max_tokens` is required on every request — `providerManagedOutput`
 *     can't mean "omit the field" the way it does for OpenAI/DeepSeek,
 *     so it maps to a wide ceiling. Adaptive thinking is on by default and `max_tokens`
 *     caps thinking + answer together, so that ceiling is also the floor
 *     for explicit caller budgets (`resolveAnthropicMaxTokens`).
 *  2. The system prompt is a top-level `system` field, not a `role:'system'`
 *     message.
 *  3. There is no `response_format` and assistant-turn prefill is a 400, so
 *     JSON mode is `output_config.format` when the caller passes a schema,
 *     and a system-prompt instruction otherwise (see the builder).
 *  4. No `thinking` configuration is sent: these models reject
 *     `{type:'disabled'}` and `budget_tokens` with a 400, and run adaptive
 *     thinking when the field is omitted. The stream parser only forwards
 *     `text_delta`, so thinking never leaks into the reply.
 *  5. Refusals: the safety classifiers can decline a request with HTTP 200
 *     and `stop_reason: 'refusal'` (empty or partial `content`). We opt into
 *     the server-side fallback chain (`fallbacks: 'default'` + beta header),
 *     which lets the provider select the fallback model; if the whole
 *     chain declines, both consumers throw `PROVIDER_REFUSED` instead of
 *     returning empty/partial text. Branch on `stop_reason` only —
 *     `stop_details` is informational and may be null.
 *  6. Images use native URL/base64 blocks. Web search uses the separate
 *     `anthropicNativeWebSearch` path; video input and inline grounding throw.
 *  7. Fable 5.1 requires 30-day data retention on the key's organization; a
 *     zero-data-retention org gets a 400 on every request, which surfaces
 *     through `toLlmTextProviderError` like any other 400.
 */
const AnthropicTextResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }),
  ),
  stop_reason: z.string().nullable().optional(),
  stop_details: z
    .object({ category: z.string().nullable().optional() })
    .nullable()
    .optional(),
})

/**
 * Claude's default adaptive thinking shares `max_tokens` with the answer,
 * so every explicit budget is raised to the Anthropic floor — it is a cap,
 * not spend, so the floor costs nothing on short replies.
 */
function resolveAnthropicMaxTokens(
  input: LlmTextInput,
  stream: boolean,
): number {
  if (input.providerManagedOutput)
    return stream
      ? LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC_STREAM
      : LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC
  return Math.max(
    input.maxTokens ?? LLM_TEXT_DEFAULT_MAX_TOKENS.DEFAULT,
    LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC,
  )
}

function buildAnthropicMessagesRequest(
  input: LlmTextInput,
  options: { stream?: boolean } = {},
): { endpoint: string; modelId: string; body: string } {
  if (input.videoData) {
    throw new Error('Claude text completion does not support video input.')
  }

  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.ANTHROPIC]
  const baseUrl =
    input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.ANTHROPIC

  const wantsJson = input.responseFormat === 'json_object'
  const jsonSchema = LLM_STRUCTURED_OUTPUT_MODELS[
    AI_ADAPTER_TYPES.ANTHROPIC
  ]?.includes(modelId)
    ? input.jsonSchema
    : undefined
  // ⚠ Anthropic has NO `response_format`, and **assistant-turn prefill returns
  // a 400 on Fable 5.1** (removed across the 4.6+ family) — so the usual
  // "prefill a `{`" trick is not available here; don't reintroduce it.
  // With a caller schema the API constrains the output (`output_config.format`).
  // Schemaless `'json_object'` callers still get the system-prompt
  // instruction and the fence-tolerant parse downstream.
  const systemPrompt =
    wantsJson && !jsonSchema
      ? `${input.systemPrompt}\n\nRespond with a single valid JSON object and nothing else — no prose, no markdown code fences.`
      : input.systemPrompt

  return {
    endpoint: `${baseUrl.replace(/\/$/, '')}${ANTHROPIC_API.MESSAGES_PATH}`,
    modelId,
    body: serializeLlmRequest(input, {
      model: modelId,
      ...(options.stream ? { stream: true } : {}),
      max_tokens: resolveAnthropicMaxTokens(input, options.stream === true),
      // Omission enables adaptive thinking; disabled and budget_tokens are
      // unsupported. No sampling parameters or forced tool choice are sent.
      // Effort stays at the model default (Opus: medium; Sonnet/Fable: high); tune via
      // `output_config.effort` only after re-measuring the assistant route.
      // Server-side refusal fallback — routes a classifier decline through the
      // provider's default chain in the same round trip (needs the beta below).
      fallbacks: 'default',
      ...(jsonSchema || input.reasoningEffort
        ? {
            output_config: {
              ...(jsonSchema
                ? { format: { type: 'json_schema', schema: jsonSchema } }
                : {}),
              ...(input.reasoningEffort
                ? { effort: input.reasoningEffort }
                : {}),
            },
          }
        : {}),
      // The operator re-sends the same system prompt on every step of a run;
      // the breakpoint lets steps 2..N read it from cache instead of paying
      // full input price each time.
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: toAnthropicUserContent(input) }],
    }),
  }
}

/**
 * Images go before the text, as the vision guide recommends. Data URLs become
 * `base64` sources; http(s) URLs become `url` sources that Anthropic fetches.
 */
function toAnthropicUserContent(
  input: LlmTextInput,
): string | Array<Record<string, unknown>> {
  if (!input.imageData) return input.userPrompt
  const images = getLlmImages(input)
  const content: Array<Record<string, unknown>> = withImageLabels<
    Record<string, unknown>
  >(
    input,
    images.map((image) => {
      const inline = parseInlineImage(image)
      return {
        type: 'image',
        source: inline
          ? { type: 'base64', media_type: inline.mimeType, data: inline.data }
          : { type: 'url', url: image },
      }
    }),
    (text) => ({ type: 'text', text }),
  )
  content.push({ type: 'text', text: input.userPrompt })
  return content
}

/** Anthropic 的鉴权头与那四家不同（`x-api-key` + 版本号），两个消费者共用。 */
export function anthropicRequestInit(
  apiKey: string,
  body: string,
  workspaceId?: string,
) {
  return {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API.VERSION,
      'anthropic-beta': ANTHROPIC_API.SERVER_SIDE_FALLBACK_BETA,
      ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
      'content-type': 'application/json',
    },
    body,
  }
}

export async function anthropicTextCompletion(
  input: LlmTextInput,
): Promise<string> {
  const { endpoint, modelId, body } = buildAnthropicMessagesRequest(input)

  const response = await fetchLlmTextBuffered(
    endpoint,
    anthropicRequestInit(
      input.apiKey,
      body,
      input.providerConfig.anthropicWorkspaceId,
    ),
    { adapterType: AI_ADAPTER_TYPES.ANTHROPIC, modelId },
    input.signal,
  )

  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, input.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId,
    })
  }

  const json: unknown = await response.json()
  const usage = AnthropicResponseUsageSchema.safeParse(json)
  if (usage.success) reportUsage(input, toAnthropicUsage(usage.data.usage))
  const data = AnthropicTextResponseSchema.parse(json)
  // Check `stop_reason` before touching `content`: a refusal is HTTP 200 with
  // an empty (pre-output) or partial (mid-output) content array.
  if (data.stop_reason === ANTHROPIC_API.REFUSAL_STOP_REASON) {
    throw toLlmTextRefusalError({
      modelId,
      category: data.stop_details?.category,
    })
  }
  checkTextFinishReason(data.stop_reason, modelId)
  const textBlock = data.content.find((block) => block.type === 'text')

  if (!textBlock?.text?.trim()) {
    throw textResponseError(modelId)
  }

  return textBlock.text.trim()
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
 * yield 出去，就是把模型的思考过程念给用户听。Fable 5.1 的 thinking 恒开（关不掉），
 * 默认 `display: "omitted"` 时 `thinking_delta` 为空串，但这道判据不能靠那个默认兜着。
 */
const AnthropicTextStreamSchema = z.object({
  type: z.string(),
  delta: z
    .object({
      type: z.string().optional(),
      text: z.string().nullable().optional(),
      stop_reason: z.string().nullable().optional(),
    })
    .optional(),
})

export async function* anthropicTextStream(
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
    input.signal,
  )

  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, input.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId,
    })
  }
  if (!response.body) throw textResponseError(modelId)
  let hasText = false
  let finished = false
  let usage: z.infer<typeof AnthropicUsageFieldsSchema> = {}
  for await (const data of readLlmSseData(response.body, modelId)) {
    if (!data) continue
    const parsed = parseLlmStreamEvent(data, {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId,
    })
    const usageEvent = AnthropicStreamUsageSchema.safeParse(parsed)
    const usageFields =
      usageEvent.success &&
      (usageEvent.data.message?.usage ?? usageEvent.data.usage)
    if (usageFields) {
      usage = {
        input_tokens: usageFields.input_tokens ?? usage.input_tokens,
        output_tokens: usageFields.output_tokens ?? usage.output_tokens,
        cache_read_input_tokens:
          usageFields.cache_read_input_tokens ?? usage.cache_read_input_tokens,
        cache_creation_input_tokens:
          usageFields.cache_creation_input_tokens ??
          usage.cache_creation_input_tokens,
      }
      reportUsage(input, toAnthropicUsage(usage))
    }
    const event = AnthropicTextStreamSchema.safeParse(parsed)
    if (!event.success) throw textResponseError(modelId, true)
    if (event.data.type === 'message_stop') {
      finished = true
      break
    }
    if (event.data.type === 'message_delta') {
      checkTextFinishReason(event.data.delta?.stop_reason, modelId)
    }
    const delta = event.data.delta
    if (
      event.data.type === 'content_block_delta' &&
      delta?.type === 'text_delta' &&
      delta.text
    ) {
      hasText ||= delta.text.trim().length > 0
      yield delta.text
    }
  }
  if (!hasText || !finished) throw textResponseError(modelId, hasText)
}
