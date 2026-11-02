import 'server-only'

/** 各家自带联网搜索（native web search）。（o-llm 拆分，2026-11-01；见 docs/design/llm.md） */

import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import {
  type LlmNativeSearchDomains,
  type LlmNativeXSearch,
  nativeSearchRulesOutX,
} from '@/services/research/native-search-filters'
import { z } from 'zod'
import {
  AI_PROVIDER_ENDPOINTS,
  ANTHROPIC_API,
  DEEPSEEK_ANTHROPIC_API,
  LLM_TEXT_DEFAULT_MAX_TOKENS,
} from '@/constants/config'
import {
  LLM_TEXT_MODELS,
  isLlmTextAdapter,
  fetchLlmTextBuffered,
  readLlmErrorBody,
  toLlmTextProviderError,
  toLlmTextRefusalError,
} from '@/services/llm/llm-core'
import { getOpenAiChatBaseUrl } from '@/services/llm/llm-openai'
import { anthropicRequestInit } from '@/services/llm/llm-anthropic'
import {
  recordLlmUsage,
  type LlmUsageMeter,
} from '@/services/llm-usage.service'

// ─── Native web search ───────────────────────────────────────────

/**
 * 各家**自带联网**（owner 2026-09-30：像 Claude 那样由模型自己写查询、自己读结果）。
 *
 * ⭐ 一次调用出「回答 + 来源」：查询词由模型在服务商那一侧自己写，⛔ 不再由我们
 * 先烧一次 LLM 改写、查完再烧一次 LLM 归纳。
 * ⚠ DeepSeek 的 chat 那条路没有联网，走它的 Anthropic 兼容入口（2026-10-14 接上，
 *   官方字段表标了支持；搜不成时扇出层回落到 Serper，见 `research-fanout`）。
 */
export interface LlmNativeSearchSource {
  url: string
  title: string
  /** 回答片段或服务商给出的来源摘录；来源列表项可能为空。 */
  excerpt: string
  excerptKind: 'answer_fragment' | 'source_excerpt' | 'none'
}

export type LlmNativeSearchStatus =
  | 'searched'
  | 'empty'
  | 'failed'
  | 'not_invoked'
  | 'paused'
  | 'partial'

export interface LlmNativeSearchResult {
  status: LlmNativeSearchStatus
  answer: string
  sources: LlmNativeSearchSource[]
  queries: string[]
  error?: string
  /**
   * Grok 这一次真的看了几段 X 上的视频（输出里 `view_x_video` 那几下）。只在
   * `xVideos` 开着时有；缺席 = 没开看视频。
   */
  xVideosWatched?: number
}

export interface LlmNativeSearchInput {
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
  /** 同 `LlmTextInput.meter`：原样递 `route.meter`。各家联网搜不回报 token，只记一次调用。 */
  meter?: LlmUsageMeter | null
  modelId?: string
  systemPrompt: string
  query: string
  signal?: AbortSignal
  /** 一次调用里最多搜几次。缺省 `NATIVE_SEARCH_MAX_USES`；深搜给得多一些。 */
  maxUses?: number
  /** 来源名单换成的域名参数（`planNativeSearchDomains` 算出来的）。 */
  domains?: LlmNativeSearchDomains
  /** 创作者浏览器的 IANA 时区：Claude / GPT 据此偏向当地的结果。 */
  timeZone?: string
  /**
   * 这一问冲着 X 上的帖子去（只 Grok 有 X 搜索）：按账号 / 日期收窄，并让 Grok 看帖子里
   * 的图。缺席 = 照常（网页与 X 都开着，由 Grok 自己挑）。
   */
  x?: LlmNativeXSearch
  /**
   * 创作者明说「看看视频」（`creatorAsksToWatchXVideos`，owner 2026-10-15）：Grok 的 X 搜索
   * 这一次开 `enable_video_understanding`。缺席 = 只看封面。⚠ 只对 Grok 有意义。
   */
  xVideos?: boolean
}

const NATIVE_SEARCH_MAX_USES = 3

/** Grok X 搜索看视频那一下的工具名（`enable_video_understanding` 开着时才会出现）。 */
const XAI_VIEW_X_VIDEO_TOOL = 'view_x_video'

export function supportsNativeWebSearch(
  adapterType: AI_ADAPTER_TYPES,
): boolean {
  return (
    adapterType === AI_ADAPTER_TYPES.GEMINI ||
    adapterType === AI_ADAPTER_TYPES.OPENAI ||
    adapterType === AI_ADAPTER_TYPES.ANTHROPIC ||
    adapterType === AI_ADAPTER_TYPES.XAI ||
    adapterType === AI_ADAPTER_TYPES.DEEPSEEK
  )
}

function nativeSearchUserLocation(timeZone: string | undefined) {
  return timeZone
    ? { user_location: { type: 'approximate', timezone: timeZone } }
    : {}
}

/** 同一个地址在回答里被引用多次时并成一条，摘录拼在一起。 */
function collectNativeSources(
  entries: readonly LlmNativeSearchSource[],
): LlmNativeSearchSource[] {
  const byUrl = new Map<string, LlmNativeSearchSource>()
  for (const entry of entries) {
    if (!entry.url) continue
    const seen = byUrl.get(entry.url)
    if (!seen) {
      byUrl.set(entry.url, { ...entry, excerpt: entry.excerpt.trim() })
      continue
    }
    const excerpt = entry.excerpt.trim()
    if (excerpt && !seen.excerpt.includes(excerpt)) {
      seen.excerpt = seen.excerpt ? `${seen.excerpt} ${excerpt}` : excerpt
      if (seen.excerptKind === 'none') seen.excerptKind = entry.excerptKind
    }
    if (!seen.title && entry.title) seen.title = entry.title
  }
  return [...byUrl.values()]
}

const GeminiGroundedResponseSchema = z.object({
  error: z
    .object({ message: z.string().optional(), status: z.string().optional() })
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional() }))
              .optional(),
          })
          .optional(),
        groundingMetadata: z
          .object({
            webSearchQueries: z.array(z.string()).optional(),
            groundingChunks: z
              .array(
                z.object({
                  web: z
                    .object({
                      uri: z.string().optional(),
                      title: z.string().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
            groundingSupports: z
              .array(
                z.object({
                  segment: z.object({ text: z.string().optional() }).optional(),
                  groundingChunkIndices: z.array(z.number()).optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
})

const URL_IN_TEXT = /https?:\/\/\S/i

/**
 * Gemini：`google_search` 工具。⚠ 来源地址是 Google 的跳转链接，真正的站点只在
 * `title` 里（一个域名）—— 所以标题同时当出处用。
 * ⭐ 问题里带了链接就同开 `url_context`（2026-10-14）：Gemini 直接读那一页（≤20 个，
 *   含 PDF 与图片；要登录的页面读不了），⛔ 不靠搜索去碰运气。
 */
async function geminiNativeWebSearch(
  input: LlmNativeSearchInput,
): Promise<LlmNativeSearchResult> {
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.GEMINI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI
  const response = await fetchLlmTextBuffered(
    `${baseUrl}/${modelId}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': input.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ parts: [{ text: input.query }] }],
        tools: [
          { google_search: {} },
          ...(URL_IN_TEXT.test(input.query) ? [{ url_context: {} }] : []),
        ],
      }),
    },
    { adapterType: AI_ADAPTER_TYPES.GEMINI, modelId },
    input.signal,
  )
  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, input.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      modelId,
    })
  }
  const data = GeminiGroundedResponseSchema.parse(await response.json())
  const candidate = data.candidates?.[0]
  const answer = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim()
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? []
  const queries = candidate?.groundingMetadata?.webSearchQueries ?? []
  const invoked = queries.length > 0 || chunks.some((chunk) => chunk.web?.uri)
  const excerpts = new Map<number, string[]>()
  for (const support of candidate?.groundingMetadata?.groundingSupports ?? []) {
    const text = support.segment?.text?.trim()
    if (!text) continue
    for (const index of support.groundingChunkIndices ?? []) {
      excerpts.set(index, [...(excerpts.get(index) ?? []), text])
    }
  }
  const urls = await Promise.all(
    chunks.map((chunk) =>
      resolveGroundingRedirect(chunk.web?.uri ?? '', input.signal),
    ),
  )
  const sources = collectNativeSources(
    chunks.map((chunk, index) => ({
      url: urls[index] ?? '',
      title: chunk.web?.title ?? '',
      excerpt: (excerpts.get(index) ?? []).join(' '),
      excerptKind: excerpts.has(index) ? 'answer_fragment' : 'none',
    })),
  )
  const error =
    data.error?.message ??
    data.error?.status ??
    data.promptFeedback?.blockReason ??
    (!candidate
      ? 'native_search_missing_candidate'
      : candidate.finishReason && candidate.finishReason !== 'STOP'
        ? `native_search_${candidate.finishReason}`
        : undefined)
  return {
    status: error
      ? invoked && sources.length > 0
        ? 'partial'
        : 'failed'
      : !invoked
        ? 'not_invoked'
        : sources.length > 0
          ? 'searched'
          : 'empty',
    answer,
    sources,
    queries,
    ...(error ? { error } : {}),
  }
}

const GROUNDING_REDIRECT_TIMEOUT_MS = 3_000

/**
 * Gemini 的来源地址是 Google 的跳转链接 —— 来源卡上会显示成一排
 * `vertexaisearch.cloud.google.com`，来源名单也按这个域名判。只读跳转头换成真地址，
 * ⛔ 不跟过去取正文；解不开就留原链接（点开照样能到）。
 */
async function resolveGroundingRedirect(
  uri: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted()
  if (!uri.includes('vertexaisearch.cloud.google.com')) return uri
  try {
    const response = await fetch(uri, {
      method: 'HEAD',
      redirect: 'manual',
      signal: signal
        ? AbortSignal.any([
            signal,
            AbortSignal.timeout(GROUNDING_REDIRECT_TIMEOUT_MS),
          ])
        : AbortSignal.timeout(GROUNDING_REDIRECT_TIMEOUT_MS),
    })
    return response.headers.get('location') || uri
  } catch {
    signal?.throwIfAborted()
    return uri
  }
}

const ResponsesSearchSchema = z.object({
  status: z.string().optional(),
  error: z
    .object({ message: z.string().optional(), code: z.string().optional() })
    .nullable()
    .optional(),
  incomplete_details: z
    .object({ reason: z.string().optional() })
    .nullable()
    .optional(),
  output: z
    .array(
      z.object({
        type: z.string(),
        status: z.string().optional(),
        /** xAI 的 X 搜索是 `custom_tool_call`：`name` 是 `x_*`，`input` 是 JSON 串。 */
        name: z.string().optional(),
        input: z.string().optional(),
        action: z
          .object({
            type: z.string(),
            query: z.string().optional(),
            queries: z.array(z.string()).optional(),
            sources: z
              .array(z.object({ type: z.string(), url: z.string() }))
              .optional(),
          })
          .optional(),
        content: z
          .array(
            z.object({
              type: z.string(),
              text: z.string().optional(),
              annotations: z
                .array(
                  z.object({
                    type: z.string(),
                    url: z.string().optional(),
                    title: z.string().optional(),
                    start_index: z.number().optional(),
                    end_index: z.number().optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
})

/** 引用标记前面那一句 —— OpenAI 的标注只给位置，不给原文。 */
function sentenceBefore(text: string, index: number): string {
  // ⚠ 标注通常紧跟在句号后面 —— 先跳过句尾标点，否则找到的「上一句」是空的。
  const core = text.slice(0, index).replace(/[。．.！!？?\s]+$/u, '')
  const start = Math.max(
    core.lastIndexOf('。'),
    core.lastIndexOf('. '),
    core.lastIndexOf('\n'),
  )
  return text.slice(start + 1, index).trim()
}

/**
 * OpenAI：Responses API 的 `web_search` 工具 —— 用的是**所选的那个模型**。
 * ⭐ 来源白名单走 `filters.allowed_domains`（≤100，没有黑名单），时区走
 *   `user_location`（2026-10-14）。
 */
async function openAiNativeWebSearch(
  input: LlmNativeSearchInput,
): Promise<LlmNativeSearchResult> {
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.OPENAI]
  const baseUrl = getOpenAiChatBaseUrl(input.providerConfig.baseUrl)
  const response = await fetchLlmTextBuffered(
    `${baseUrl}/responses`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        instructions: input.systemPrompt,
        input: input.query,
        tools: [
          {
            type: 'web_search',
            ...(input.domains?.mode === 'allow'
              ? { filters: { allowed_domains: input.domains.domains } }
              : {}),
            ...nativeSearchUserLocation(input.timeZone),
          },
        ],
        include: ['web_search_call.action.sources'],
      }),
    },
    { adapterType: AI_ADAPTER_TYPES.OPENAI, modelId },
    input.signal,
  )
  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, input.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId,
    })
  }
  const data = ResponsesSearchSchema.parse(await response.json())
  return responsesNativeSearchResult(
    data,
    (data.output ?? [])
      .filter((item) => item.type === 'web_search_call')
      .map(webSearchCallOf),
  )
}

type ResponsesSearchData = z.infer<typeof ResponsesSearchSchema>
type ResponsesSearchItem = NonNullable<ResponsesSearchData['output']>[number]

/** Responses API 里的一次搜索调用（OpenAI 只有网搜；xAI 另有 X 搜索）。 */
interface ResponsesSearchCall {
  status?: string
  queries: string[]
  sourceUrls: string[]
}

function webSearchCallOf(item: ResponsesSearchItem): ResponsesSearchCall {
  return {
    status: item.status,
    queries:
      item.action?.queries ?? (item.action?.query ? [item.action.query] : []),
    sourceUrls: (item.action?.sources ?? [])
      .filter((source) => source.type === 'url')
      .map((source) => source.url),
  }
}

/** OpenAI 与 xAI 共用：搜索调用 + 回答里的 `url_citation` 标注 → 回执。 */
function responsesNativeSearchResult(
  data: ResponsesSearchData,
  calls: readonly ResponsesSearchCall[],
): LlmNativeSearchResult {
  const completed = calls.filter((call) => call.status === 'completed')
  const texts = (data.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
  const sources =
    completed.length > 0
      ? collectNativeSources([
          ...texts.flatMap((part) =>
            (part.annotations ?? [])
              .filter((note) => note.type === 'url_citation' && note.url)
              .map((note): LlmNativeSearchSource => {
                const excerpt = sentenceBefore(
                  part.text ?? '',
                  note.start_index ?? 0,
                )
                return {
                  url: note.url ?? '',
                  // ⚠ xAI 的标题是引用序号或地址本身，不是页面标题。
                  title:
                    note.title &&
                    note.title !== note.url &&
                    !/^\d+$/.test(note.title)
                      ? note.title
                      : '',
                  excerpt,
                  excerptKind: excerpt ? 'answer_fragment' : 'none',
                }
              }),
          ),
          ...completed.flatMap((call) =>
            call.sourceUrls.map(
              (url): LlmNativeSearchSource => ({
                url,
                title: '',
                excerpt: '',
                excerptKind: 'none',
              }),
            ),
          ),
        ])
      : []
  const queries = [...new Set(calls.flatMap((call) => call.queries))]
  const unfinished = calls.find((call) => call.status !== 'completed')
  const error =
    data.error?.message ??
    data.error?.code ??
    data.incomplete_details?.reason ??
    (data.status && data.status !== 'completed'
      ? `native_search_response_${data.status}`
      : unfinished
        ? `native_search_call_${unfinished.status ?? 'unknown'}`
        : undefined)
  return {
    status: error
      ? completed.length > 0
        ? 'partial'
        : 'failed'
      : calls.length === 0
        ? 'not_invoked'
        : sources.length > 0
          ? 'searched'
          : 'empty',
    answer: texts
      .map((part) => part.text ?? '')
      .join('')
      .trim(),
    sources,
    queries,
    ...(error ? { error } : {}),
  }
}

const XaiXSearchInputSchema = z.object({ query: z.string().optional() })

/** X 搜索调用的查询词在 `input` 那个 JSON 串里；读不出来就当没有。 */
function xSearchQueryOf(input: string | undefined): string[] {
  if (!input) return []
  try {
    const parsed = XaiXSearchInputSchema.safeParse(JSON.parse(input))
    return parsed.success && parsed.data.query ? [parsed.data.query] : []
  } catch {
    return []
  }
}

/**
 * Grok：Responses API 的 `web_search` + `x_search`（owner 2026-10-10）。X 上的帖子、
 * 用户与串只有 Grok 搜得到 —— 别家自带联网只看得到网页。
 * ⚠ X 搜索在输出里是 `custom_tool_call`（`x_keyword_search` / `x_semantic_search` /
 *   `x_user_search` / `x_thread_fetch`），不是 `*_search_call`。
 * ⚠ `max_turns` 限的是**轮数**不是次数 —— 一轮里会并行打好几次；X 搜索按拉到的
 *   帖子计费，2026-10-10 实测一问 X 舆情约 $0.4、30 秒，普通事实题约 $0.06、8 秒。
 * ⚠ 推理档同 chat 那条路压到 `low`：默认 high 时同一题要 56 秒。
 * ⭐ 2026-10-14 补齐参数：冲着 X 去的那一问按账号（≤20）/ 日期收窄，并开
 *   `enable_image_understanding` 看帖子里的图（视频只看封面；按图片 token 计费）；
 * ⭐ 2026-10-15：创作者明说「看看视频」（`input.xVideos`）才开
 *   `enable_video_understanding` —— 视频按图片 token 计费、比封面贵得多，⛔ 不自动开；
 *   来源名单走网页搜索的 `allowed_domains` / `excluded_domains`（各 ≤5），名单挡掉
 *   X 时整个 X 搜索不带。
 */
function xaiSearchTools(input: LlmNativeSearchInput) {
  const domains = input.domains
  const webSearch = {
    type: 'web_search',
    ...(domains
      ? domains.mode === 'allow'
        ? { allowed_domains: domains.domains }
        : { excluded_domains: domains.domains }
      : {}),
  }
  if (nativeSearchRulesOutX(domains)) return [webSearch]
  const x = input.x
  return [
    webSearch,
    {
      type: 'x_search',
      ...(x
        ? {
            ...(x.handles.length ? { allowed_x_handles: x.handles } : {}),
            ...(x.fromDate ? { from_date: x.fromDate } : {}),
            ...(x.toDate ? { to_date: x.toDate } : {}),
            enable_image_understanding: true,
          }
        : {}),
      ...(input.xVideos
        ? { enable_image_understanding: true, enable_video_understanding: true }
        : {}),
    },
  ]
}

async function xaiNativeWebSearch(
  input: LlmNativeSearchInput,
): Promise<LlmNativeSearchResult> {
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.XAI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.XAI
  const response = await fetchLlmTextBuffered(
    `${baseUrl.replace(/\/$/, '')}/responses`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        instructions: input.systemPrompt,
        input: input.query,
        tools: xaiSearchTools(input),
        max_turns: input.maxUses ?? NATIVE_SEARCH_MAX_USES,
        reasoning: { effort: 'low' },
      }),
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
  const data = ResponsesSearchSchema.parse(await response.json())
  const result = responsesNativeSearchResult(
    data,
    (data.output ?? []).flatMap((item): ResponsesSearchCall[] => {
      if (item.type === 'web_search_call') return [webSearchCallOf(item)]
      if (item.type === 'custom_tool_call' && item.name?.startsWith('x_'))
        return [
          {
            status: item.status,
            queries: xSearchQueryOf(item.input),
            sourceUrls: [],
          },
        ]
      return []
    }),
  )
  if (!input.xVideos) return result
  /** 看视频那一下在输出里是 `custom_tool_call` · `view_x_video`（一段一下）。 */
  const xVideosWatched = (data.output ?? []).filter(
    (item) =>
      item.type === 'custom_tool_call' && item.name === XAI_VIEW_X_VIDEO_TOOL,
  ).length
  return { ...result, xVideosWatched }
}

const AnthropicSearchResponseSchema = z.object({
  error: z
    .object({ message: z.string().optional(), type: z.string().optional() })
    .optional(),
  content: z
    .array(
      z.object({
        type: z.string(),
        id: z.string().optional(),
        name: z.string().optional(),
        tool_use_id: z.string().optional(),
        input: z.object({ query: z.string().optional() }).optional(),
        text: z.string().optional(),
        citations: z
          .array(
            z.object({
              type: z.string(),
              url: z.string().optional(),
              title: z.string().nullable().optional(),
              cited_text: z.string().optional(),
            }),
          )
          .nullable()
          .optional(),
        content: z.unknown().optional(),
      }),
    )
    .optional(),
  stop_reason: z.string().nullable().optional(),
  stop_details: z
    .object({ category: z.string().nullable().optional() })
    .nullable()
    .optional(),
})

const AnthropicSearchResultsSchema = z.array(
  z.object({
    type: z.string(),
    url: z.string().optional(),
    title: z.string().optional(),
  }),
)

const AnthropicSearchErrorSchema = z.object({
  type: z.literal('web_search_tool_result_error'),
  error_code: z.string(),
})

/** Messages 形状的一次联网请求：Claude 自己，或 DeepSeek 的 Anthropic 兼容入口。 */
interface MessagesSearchTarget {
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  endpoint: string
  init: (body: string) => Omit<RequestInit, 'signal'>
  /** `web_search` 工具上额外的参数（域名 / 地区）。 */
  toolOptions: Record<string, unknown>
}

/**
 * Claude：服务端 `web_search` 工具。⚠ 搜索出错也是 HTTP 200 —— 结果块的
 * `content` 是一个错误对象而不是列表，按形状分支并保留失败回执。
 * ⭐ 来源名单走 `allowed_domains` / `blocked_domains`，时区走 `user_location`
 *   （2026-10-14）。
 */
function anthropicNativeWebSearch(
  input: LlmNativeSearchInput,
): Promise<LlmNativeSearchResult> {
  const baseUrl =
    input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.ANTHROPIC
  const domains = input.domains
  return messagesNativeWebSearch(input, {
    adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    modelId: input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.ANTHROPIC],
    endpoint: `${baseUrl.replace(/\/$/, '')}${ANTHROPIC_API.MESSAGES_PATH}`,
    init: (body) =>
      anthropicRequestInit(
        input.apiKey,
        body,
        input.providerConfig.anthropicWorkspaceId,
      ),
    toolOptions: {
      ...(domains
        ? domains.mode === 'allow'
          ? { allowed_domains: domains.domains }
          : { blocked_domains: domains.domains }
        : {}),
      ...nativeSearchUserLocation(input.timeZone),
    },
  })
}

/**
 * DeepSeek：Anthropic 兼容入口上的同一个 `web_search` 工具（2026-10-14）。
 * ⚠ 只带 `max_uses`：兼容层没写收域名与地区，带了可能整次 400。也不带 Claude 那颗
 *   beta 头。搜不成时扇出层回落到 Serper，所以这里失败不会让这一轮空手。
 */
function deepseekNativeWebSearch(
  input: LlmNativeSearchInput,
): Promise<LlmNativeSearchResult> {
  const root = (input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.DEEPSEEK)
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '')
  return messagesNativeWebSearch(input, {
    adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    modelId: input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.DEEPSEEK],
    endpoint: `${root}${DEEPSEEK_ANTHROPIC_API.MESSAGES_PATH}`,
    init: (body) => ({
      method: 'POST',
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': ANTHROPIC_API.VERSION,
        'content-type': 'application/json',
      },
      body,
    }),
    toolOptions: {},
  })
}

async function messagesNativeWebSearch(
  input: LlmNativeSearchInput,
  target: MessagesSearchTarget,
): Promise<LlmNativeSearchResult> {
  const { adapterType, modelId } = target
  const response = await fetchLlmTextBuffered(
    target.endpoint,
    target.init(
      JSON.stringify({
        model: modelId,
        max_tokens: LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.query }],
        tools: [
          {
            type: ANTHROPIC_API.WEB_SEARCH_TOOL_TYPE,
            name: 'web_search',
            max_uses: input.maxUses ?? NATIVE_SEARCH_MAX_USES,
            ...target.toolOptions,
          },
        ],
      }),
    ),
    { adapterType, modelId },
    input.signal,
  )
  if (!response.ok) {
    const errorBody = await readLlmErrorBody(response, input.signal)
    throw toLlmTextProviderError(response.status, errorBody, {
      adapterType,
      modelId,
    })
  }
  const data = AnthropicSearchResponseSchema.parse(await response.json())
  if (data.stop_reason === 'refusal') {
    throw toLlmTextRefusalError({
      modelId,
      category: data.stop_details?.category ?? null,
    })
  }
  const cited: LlmNativeSearchSource[] = []
  const listed: LlmNativeSearchSource[] = []
  const blocks = data.content ?? []
  const calls = blocks.filter(
    (block) =>
      block.type === 'server_tool_use' &&
      block.name === 'web_search' &&
      block.id,
  )
  const callIds = new Set(calls.map((call) => call.id))
  const returnedIds = new Set<string>()
  const errors: string[] = []
  let completed = 0
  let answer = ''
  for (const block of blocks) {
    if (block.type === 'text') {
      answer += block.text ?? ''
      for (const citation of block.citations ?? []) {
        if (citation.type !== 'web_search_result_location' || !citation.url)
          continue
        cited.push({
          url: citation.url,
          title: citation.title ?? '',
          excerpt: citation.cited_text ?? '',
          excerptKind: citation.cited_text ? 'source_excerpt' : 'none',
        })
      }
    }
    if (block.type === 'web_search_tool_result') {
      if (!block.tool_use_id || !callIds.has(block.tool_use_id)) {
        errors.push('native_search_unpaired_result')
        continue
      }
      returnedIds.add(block.tool_use_id)
      const failure = AnthropicSearchErrorSchema.safeParse(block.content)
      if (failure.success) {
        errors.push(failure.data.error_code)
        continue
      }
      const results = AnthropicSearchResultsSchema.safeParse(block.content)
      if (!results.success) {
        errors.push('native_search_invalid_result')
        continue
      }
      completed += 1
      for (const result of results.data) {
        if (result.type !== 'web_search_result' || !result.url) continue
        listed.push({
          url: result.url,
          title: result.title ?? '',
          excerpt: '',
          excerptKind: 'none',
        })
      }
    }
  }
  const sources =
    completed > 0 ? collectNativeSources([...cited, ...listed]) : []
  const paused =
    data.stop_reason === 'pause_turn' || data.stop_reason === 'tool_use'
  if (data.error)
    errors.push(
      data.error.message ?? data.error.type ?? 'native_search_provider_error',
    )
  if (calls.some((call) => !returnedIds.has(call.id!)))
    errors.push('native_search_missing_result')
  if (data.stop_reason === 'max_tokens') errors.push('native_search_truncated')
  const error = paused
    ? `native_search_${data.stop_reason}`
    : errors.length > 0
      ? [...new Set(errors)].join('; ')
      : undefined
  return {
    status: paused
      ? 'paused'
      : error
        ? completed > 0
          ? 'partial'
          : 'failed'
        : calls.length === 0
          ? 'not_invoked'
          : sources.length > 0
            ? 'searched'
            : 'empty',
    answer: answer.trim(),
    // ⭐ 被引用的排前面：模型真正用上的那几条才是证据，搜到没用的垫在后面。
    sources,
    queries: [
      ...new Set(
        calls.flatMap((call) => (call.input?.query ? [call.input.query] : [])),
      ),
    ],
    ...(error ? { error } : {}),
  }
}

export async function llmNativeWebSearch(
  input: LlmNativeSearchInput,
): Promise<LlmNativeSearchResult> {
  input.signal?.throwIfAborted()
  const startedAt = Date.now()
  const settle = (error?: unknown) =>
    recordLlmUsage({
      meter: input.meter,
      adapterType: input.adapterType,
      modelId:
        input.modelId ??
        (isLlmTextAdapter(input.adapterType)
          ? LLM_TEXT_MODELS[input.adapterType]
          : input.adapterType),
      usage: null,
      ok: error === undefined,
      durationMs: Date.now() - startedAt,
      ...(error === undefined
        ? {}
        : {
            errorMessage:
              error instanceof Error ? error.message : String(error),
          }),
    })
  try {
    const result = await nativeWebSearchWithAdapter(input)
    settle(result.status === 'failed' ? (result.error ?? 'failed') : undefined)
    return result
  } catch (error) {
    settle(error)
    throw error
  }
}

function nativeWebSearchWithAdapter(
  input: LlmNativeSearchInput,
): Promise<LlmNativeSearchResult> {
  switch (input.adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return geminiNativeWebSearch(input)
    case AI_ADAPTER_TYPES.OPENAI:
      return openAiNativeWebSearch(input)
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return anthropicNativeWebSearch(input)
    case AI_ADAPTER_TYPES.XAI:
      return xaiNativeWebSearch(input)
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return deepseekNativeWebSearch(input)
    default:
      throw new Error(
        `Native web search not supported for adapter: ${input.adapterType}`,
      )
  }
}
