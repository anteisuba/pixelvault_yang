/**
 * 五家厂商的线上格式：认请求（哪一家、哪个型号、哪把 key、这一跳是主步还是辅助、带了几张图），
 * 把录好的回复编成那一家真会发回来的样子（流式 SSE / 一次性 JSON）。
 *
 * ⭐ 编出来的帧过的是 AI SDK 自己的 chunk schema —— 编错了 SDK 直接报，回放不会「假绿」。
 * ⚠ 只编回放用得到的那几种事件，⛔ 不是厂商协议的完整实现。
 */
import { z } from 'zod'

import { ASSISTANT_V3_TOOLS } from '@/constants/assistant-v3'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { ReplayProvider, ReplayReply, ReplaySearch } from './fixture'

export const PROVIDER_HOSTS: Record<string, ReplayProvider> = {
  'generativelanguage.googleapis.com': AI_ADAPTER_TYPES.GEMINI,
  'api.openai.com': AI_ADAPTER_TYPES.OPENAI,
  'api.anthropic.com': AI_ADAPTER_TYPES.ANTHROPIC,
  'api.deepseek.com': AI_ADAPTER_TYPES.DEEPSEEK,
  'api.x.ai': AI_ADAPTER_TYPES.XAI,
}

/** 这一跳的协议：Gemini 原生 / OpenAI Responses / 兼容 OpenAI 的对话接口 / Claude Messages。 */
export type WireProtocol = 'gemini' | 'responses' | 'chat' | 'anthropic'

/**
 * 这一跳是干什么的：主步（工具环，带 v3 那八个工具）、联网查（厂商自带搜索工具）、
 * 其余文本调用（结账、改写……）。
 */
export type CallPurpose = 'step' | 'search' | 'text'

export interface ProviderRequest {
  readonly adapterType: ReplayProvider
  readonly protocol: WireProtocol
  readonly purpose: CallPurpose
  readonly modelId: string | null
  readonly apiKey: string | null
  readonly stream: boolean
  readonly images: number
  readonly videos: number
  readonly body: unknown
}

const V3_TOOL_NAMES = new Set<string>(ASSISTANT_V3_TOOLS)

const ToolsSchema = z.object({ tools: z.array(z.unknown()).optional() })
const NamedSchema = z.object({ name: z.string() })
const TypedSchema = z.object({ type: z.string() })
const FunctionToolSchema = z.object({ function: NamedSchema })
const GeminiToolSchema = z.object({
  functionDeclarations: z.array(NamedSchema).optional(),
  googleSearch: z.unknown().optional(),
  google_search: z.unknown().optional(),
})
const MimeSchema = z.object({
  mimeType: z.string().optional(),
  mime_type: z.string().optional(),
})

function toolNames(
  protocol: WireProtocol,
  tools: readonly unknown[],
): string[] {
  return tools.flatMap((tool) => {
    if (protocol === 'gemini') {
      const parsed = GeminiToolSchema.safeParse(tool)
      return parsed.success
        ? (parsed.data.functionDeclarations ?? []).map((fn) => fn.name)
        : []
    }
    const fn = FunctionToolSchema.safeParse(tool)
    if (fn.success) return [fn.data.function.name]
    const named = NamedSchema.safeParse(tool)
    return named.success ? [named.data.name] : []
  })
}

function hasSearchTool(protocol: WireProtocol, tools: readonly unknown[]) {
  return tools.some((tool) => {
    if (protocol === 'gemini') {
      const parsed = GeminiToolSchema.safeParse(tool)
      return (
        parsed.success &&
        (parsed.data.googleSearch !== undefined ||
          parsed.data.google_search !== undefined)
      )
    }
    const typed = TypedSchema.safeParse(tool)
    return (
      typed.success &&
      (typed.data.type.startsWith('web_search') ||
        typed.data.type === 'x_search')
    )
  })
}

/** 请求体里的图 / 片子数（四种协议各有各的写法，一并数）。 */
function countMedia(body: unknown): { images: number; videos: number } {
  let images = 0
  let videos = 0
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    const inline =
      record.inlineData ??
      record.inline_data ??
      record.fileData ??
      record.file_data
    if (inline !== undefined) {
      const mime = MimeSchema.safeParse(inline)
      const type = mime.success
        ? (mime.data.mimeType ?? mime.data.mime_type ?? '')
        : ''
      if (type.startsWith('image/')) images += 1
      if (type.startsWith('video/')) videos += 1
    }
    if (
      record.type === 'input_image' ||
      record.type === 'image_url' ||
      record.type === 'image'
    )
      images += 1
    Object.values(record).forEach(visit)
  }
  visit(body)
  return { images, videos }
}

function bearer(headers: Headers): string | null {
  const value = headers.get('authorization')
  return value?.startsWith('Bearer ') ? value.slice(7) : null
}

export function readProviderRequest(
  adapterType: ReplayProvider,
  url: URL,
  headers: Headers,
  body: unknown,
): ProviderRequest {
  const protocol: WireProtocol =
    adapterType === AI_ADAPTER_TYPES.GEMINI
      ? 'gemini'
      : adapterType === AI_ADAPTER_TYPES.ANTHROPIC
        ? 'anthropic'
        : url.pathname.endsWith('/responses')
          ? 'responses'
          : 'chat'
  const tools = ToolsSchema.safeParse(body)
  const declared = tools.success ? (tools.data.tools ?? []) : []
  const purpose: CallPurpose = toolNames(protocol, declared).some((name) =>
    V3_TOOL_NAMES.has(name),
  )
    ? 'step'
    : hasSearchTool(protocol, declared)
      ? 'search'
      : 'text'
  const record = (body ?? {}) as Record<string, unknown>
  const modelId =
    protocol === 'gemini'
      ? (/\/models\/([^:/]+):/.exec(url.pathname)?.[1] ?? null)
      : typeof record.model === 'string'
        ? record.model
        : null
  const apiKey =
    protocol === 'gemini'
      ? (headers.get('x-goog-api-key') ?? url.searchParams.get('key'))
      : protocol === 'anthropic'
        ? headers.get('x-api-key')
        : bearer(headers)
  const stream =
    protocol === 'gemini'
      ? url.pathname.endsWith(':streamGenerateContent')
      : record.stream === true
  return {
    adapterType,
    protocol,
    purpose,
    modelId,
    apiKey,
    stream,
    ...countMedia(body),
    body,
  }
}

// ─── 回复编码 ─────────────────────────────────────────────────────

export interface EncodedToolCall {
  readonly id: string
  readonly name: string
  readonly args: string
}

const USAGE = { input: 1200, output: 80 }

function sse(frames: readonly unknown[], named = false): string {
  return frames
    .map((frame) => {
      const data = `data: ${JSON.stringify(frame)}\n\n`
      const type = (frame as { type?: unknown }).type
      return named && typeof type === 'string'
        ? `event: ${type}\n${data}`
        : data
    })
    .join('')
}

function geminiStream(text: string, calls: readonly EncodedToolCall[]) {
  const frames: unknown[] = []
  if (text)
    frames.push({
      candidates: [{ content: { role: 'model', parts: [{ text }] } }],
    })
  for (const call of calls)
    frames.push({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                functionCall: { name: call.name, args: JSON.parse(call.args) },
              },
            ],
          },
        },
      ],
    })
  frames.push({
    candidates: [
      { content: { role: 'model', parts: [] }, finishReason: 'STOP' },
    ],
    usageMetadata: {
      promptTokenCount: USAGE.input,
      candidatesTokenCount: USAGE.output,
      totalTokenCount: USAGE.input + USAGE.output,
    },
  })
  return sse(frames)
}

function responsesStream(
  modelId: string,
  text: string,
  calls: readonly EncodedToolCall[],
) {
  const frames: unknown[] = [
    {
      type: 'response.created',
      response: {
        id: 'resp_replay',
        created_at: 1_760_000_000,
        model: modelId,
      },
    },
  ]
  let index = 0
  if (text) {
    const item = { type: 'message', id: 'msg_replay' }
    frames.push(
      { type: 'response.output_item.added', output_index: index, item },
      { type: 'response.output_text.delta', item_id: item.id, delta: text },
      { type: 'response.output_item.done', output_index: index, item },
    )
    index += 1
  }
  for (const call of calls) {
    const id = `fc_${call.id}`
    frames.push(
      {
        type: 'response.output_item.added',
        output_index: index,
        item: {
          type: 'function_call',
          id,
          call_id: call.id,
          name: call.name,
          arguments: '',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: id,
        output_index: index,
        delta: call.args,
      },
      {
        type: 'response.output_item.done',
        output_index: index,
        item: {
          type: 'function_call',
          id,
          call_id: call.id,
          name: call.name,
          arguments: call.args,
          status: 'completed',
        },
      },
    )
    index += 1
  }
  frames.push({
    type: 'response.completed',
    response: {
      usage: { input_tokens: USAGE.input, output_tokens: USAGE.output },
    },
  })
  return sse(frames)
}

function chatStream(
  modelId: string,
  text: string,
  calls: readonly EncodedToolCall[],
) {
  const base = { id: 'chatcmpl_replay', created: 1_760_000_000, model: modelId }
  const frames: unknown[] = []
  if (text)
    frames.push({
      ...base,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: text },
          finish_reason: null,
        },
      ],
    })
  calls.forEach((call, index) =>
    frames.push({
      ...base,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index,
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.args },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    }),
  )
  frames.push({
    ...base,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: calls.length ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: USAGE.input,
      completion_tokens: USAGE.output,
      total_tokens: USAGE.input + USAGE.output,
    },
  })
  return `${sse(frames)}data: [DONE]\n\n`
}

function anthropicStream(
  modelId: string,
  text: string,
  calls: readonly EncodedToolCall[],
) {
  const frames: unknown[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_replay',
        type: 'message',
        role: 'assistant',
        model: modelId,
        content: [],
        stop_reason: null,
        usage: { input_tokens: USAGE.input, output_tokens: 1 },
      },
    },
  ]
  let index = 0
  if (text) {
    frames.push(
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text },
      },
      { type: 'content_block_stop', index },
    )
    index += 1
  }
  for (const call of calls) {
    frames.push(
      {
        type: 'content_block_start',
        index,
        content_block: {
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: {},
        },
      },
      {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: call.args },
      },
      { type: 'content_block_stop', index },
    )
    index += 1
  }
  frames.push(
    {
      type: 'message_delta',
      delta: {
        stop_reason: calls.length ? 'tool_use' : 'end_turn',
        stop_sequence: null,
      },
      usage: { output_tokens: USAGE.output },
    },
    { type: 'message_stop' },
  )
  return sse(frames, true)
}

/** 主步那一跳（或流式文本调用）的 SSE 正文。 */
export function encodeStream(
  request: ProviderRequest,
  reply: ReplayReply,
  callIdPrefix: string,
): string {
  const modelId = request.modelId ?? 'unknown'
  const calls: EncodedToolCall[] = reply.calls.map((call, index) => ({
    id: `${request.protocol === 'anthropic' ? 'toolu' : 'call'}_${callIdPrefix}_${index}`,
    name: call.tool,
    args: JSON.stringify(call.input),
  }))
  switch (request.protocol) {
    case 'gemini':
      return geminiStream(reply.text, calls)
    case 'responses':
      return responsesStream(modelId, reply.text, calls)
    case 'chat':
      return chatStream(modelId, reply.text, calls)
    case 'anthropic':
      return anthropicStream(modelId, reply.text, calls)
  }
}

/** 一次性文本调用（结账、改写……）的 JSON 正文。 */
export function encodeText(request: ProviderRequest, text: string): unknown {
  switch (request.protocol) {
    case 'gemini':
      return {
        candidates: [
          {
            content: { role: 'model', parts: [{ text }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: USAGE.input,
          candidatesTokenCount: USAGE.output,
        },
      }
    case 'anthropic':
      return {
        id: 'msg_replay',
        type: 'message',
        role: 'assistant',
        model: request.modelId,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: USAGE.input, output_tokens: USAGE.output },
      }
    case 'responses':
      return {
        id: 'resp_replay',
        object: 'response',
        created_at: 1_760_000_000,
        model: request.modelId,
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'msg_replay',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text, annotations: [] }],
          },
        ],
        usage: { input_tokens: USAGE.input, output_tokens: USAGE.output },
      }
    case 'chat':
      return {
        id: 'chatcmpl_replay',
        object: 'chat.completion',
        created: 1_760_000_000,
        model: request.modelId,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: USAGE.input,
          completion_tokens: USAGE.output,
          total_tokens: USAGE.input + USAGE.output,
        },
      }
  }
}

/** 联网查那一跳（厂商自带搜索）的 JSON 正文 —— 目前只编 Gemini 的 grounding。 */
export function encodeSearch(
  request: ProviderRequest,
  search: ReplaySearch,
): unknown {
  if (request.protocol !== 'gemini')
    throw new Error(
      `replay: native search for ${request.adapterType} is not encoded yet`,
    )
  return {
    candidates: [
      {
        content: { role: 'model', parts: [{ text: search.text }] },
        finishReason: 'STOP',
        groundingMetadata: {
          webSearchQueries: search.queries,
          groundingChunks: search.sources.map((source) => ({
            web: { uri: source.url, title: source.title },
          })),
          groundingSupports: [],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: USAGE.input,
      candidatesTokenCount: USAGE.output,
    },
  }
}
