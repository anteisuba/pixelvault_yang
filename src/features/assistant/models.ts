import 'server-only'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { JSONValue } from '@ai-sdk/provider'
import type {
  LanguageModel,
  ModelMessage,
  SystemModelMessage,
  ToolSet,
} from 'ai'

import {
  ASSISTANT_DEEPSEEK_EFFORTS,
  type AssistantReasoningEffort,
} from '@/constants/assistant-persona'
import {
  ASSISTANT_V3_MAX_OUTPUT_TOKENS,
  assistantV3VerifiedOutputCap,
} from '@/constants/assistant-v3'
import {
  AI_PROVIDER_ENDPOINTS,
  LLM_TEXT_MODEL_IDS,
  XAI_API,
} from '@/constants/config'
import {
  OPENAI_PROXY_NEEDS_RESPONSES_I18N_KEY,
  OPENAI_TOOLS_NEED_RESPONSES_MODELS,
} from '@/constants/llm-capability'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getOpenAiChatBaseUrl,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'
import { aiGatewayFetch } from '@/lib/ai-gateway'
import { decodeImage, encodePng } from '@/lib/image-pixels'

/**
 * 新内核的模型接法（接口与搜索调研：/mnt/project-files/assistant-reliability/model-interfaces.md）。
 *
 * 和 v3 的三处不同，都是为了「别让外壳绊住模型」：
 *  ① 各家**自带的联网搜索 / 读网页直接挂在主循环上**：搜不搜、搜几次、点进哪一页，模型自己定；
 *    外壳只给来源名单（⛔ 不改写查询、不扇出、不替它拼证据）。⚠ DeepSeek 例外：它的联网工具不能和
 *    别的工具同开（11-18），主循环不挂；没挂联网的接法在系统提示末尾说明（`NO_WEB_NOTE`）。
 *  ② **思考跨步接上**：每一步把模型的完整回复（思考、签名、搜索结果）原样接回去（见 `kernel.ts`），
 *    所以这里要的是「能回传思考」的那条接法 —— OpenAI / Grok 走 Responses 并带回加密思考，
 *    DeepSeek 改走它的 Anthropic 兼容入口（OpenAI 兼容那条 SDK 不回传 `reasoning_content`）。
 *  ③ **思考档整轮用创作者选的那一档**，⛔ 不按步自作主张降档。
 *
 * ⚠ DeepSeek / Grok 的新接法、Claude 的 adaptive 思考还没用真 key 跑过：每家带一个 `fallback`
 *   （= v3 那条已经跑通的接法，没有自带联网），第一次调用就被厂商 4xx 拒掉时整轮换过去。
 */

export type NextProviderOptions = Record<string, Record<string, JSONValue>>

export interface NextModel {
  readonly model: LanguageModel
  /** 给日志与过程记录：这一份是哪条接法。 */
  readonly path: string
  /** 厂商自己跑的工具（联网 / 读网页）。工具名就是模型看到的名字。 */
  readonly nativeTools: ToolSet
  /** OpenAI 严格模式：工具入参按 schema 生成。 */
  readonly strictTools: boolean
  readonly maxOutputTokens: number | undefined
  providerOptions(
    cacheKey: string,
    effort: AssistantReasoningEffort,
  ): NextProviderOptions
  system(text: {
    stable: string
    creator: string
  }): string | SystemModelMessage[]
  /**
   * `historyEnd`：前面几条是之前几轮的历史（逐轮原样重放）。Claude 在它末尾多打一个断点，
   * 下一轮第一步就能接着用这一段的缓存（11-10）；别家按前缀自动缓存，不用管。
   */
  messages(messages: ModelMessage[], historyEnd?: number): ModelMessage[]
  /** 第一次调用就被拒（4xx）时换成的那一份；没有 = 已经是最保守的接法。 */
  readonly fallback: NextModel | null
  /**
   * 这一份被厂商拒（4xx）且没有下一份时报的文案键（`common`）。缺席 = 照常归类。
   * 给「已知注定被拒」的情形一句看得懂的话（OpenAI 代理没开 Responses，11-18）。
   */
  readonly rejectedI18nKey?: string
  /** 每次请求额外的 HTTP 头（Grok Chat Completions 的 `x-grok-conv-id`，11-18）。 */
  headers?(cacheKey: string): Record<string, string>
  /** 图交给这家之前换格式（Grok 只收 jpg / png，11-18）。缺席 = 原样。 */
  preparePicture?(picture: NextPicture): Promise<NextPicture>
}

export interface NextPicture {
  readonly data: Uint8Array
  readonly mediaType: string
}

/**
 * Claude 的缓存断点（⚠ 上限 4 个）：系统提示两段各一个、之前几轮历史的末尾一个、最后一条消息一个。
 * 新内核每一步都把上一步的完整回复接在后面，前缀逐字不变，最后一条那一处每步往后挪。
 * ⭐ 历史末尾那一个（11-10）：新一轮第一步时，上一轮的工具步已经压成文字重放，最后一条那一处必然落空；
 *   历史是逐轮原样重放的，下一轮同一段前缀还在，这个断点让它们第一步就命中（之前只命中系统提示）。
 */
const ANTHROPIC_CACHE_POINT = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
} as const

function withCachePoints(
  messages: ModelMessage[],
  historyEnd?: number,
): ModelMessage[] {
  const last = messages.length - 1
  const historyLast =
    historyEnd !== undefined && historyEnd > 0 ? historyEnd - 1 : -1
  return messages.map((message, index) =>
    index === last || index === historyLast
      ? {
          ...message,
          providerOptions: {
            ...message.providerOptions,
            anthropic: {
              ...message.providerOptions?.anthropic,
              ...ANTHROPIC_CACHE_POINT.anthropic,
            },
          },
        }
      : message,
  )
}

const anthropicShape = {
  system: (text: { stable: string; creator: string }): SystemModelMessage[] => [
    {
      role: 'system',
      content: text.stable,
      providerOptions: ANTHROPIC_CACHE_POINT,
    },
    {
      role: 'system',
      content: text.creator,
      providerOptions: ANTHROPIC_CACHE_POINT,
    },
  ],
  messages: withCachePoints,
}

const plainShape = {
  system: (text: { stable: string; creator: string }) =>
    `${text.stable}${text.creator}`,
  messages: (messages: ModelMessage[]) => messages,
}

/**
 * 系统提示里写着「联网 / 读网页是自带的」（`prompt.ts`），但有几条接法没挂厂商联网（DeepSeek 主循环、
 * OpenAI 代理、各家被拒后的保守接法）：在系统提示**最末尾**补一句，模型就不会假装查过（11-18）。
 * ⭐ 缓存：只加在末尾，前面的稳定段逐字不变；同一条接法每步都是同一句，步与步之间的前缀照样命中。
 */
const NO_WEB_NOTE =
  '\n\nOn this connection there is no built-in web search or page reading. Answer from what you know and what the creator gives you; when a fact needs checking online, say so instead of claiming you looked it up.'

const noWebPlainShape = {
  system: (text: { stable: string; creator: string }) =>
    `${text.stable}${text.creator}${NO_WEB_NOTE}`,
  messages: plainShape.messages,
}

const noWebAnthropicShape = {
  system: (text: { stable: string; creator: string }) =>
    anthropicShape.system({
      stable: text.stable,
      creator: `${text.creator}${NO_WEB_NOTE}`,
    }),
  messages: withCachePoints,
}

function trimmedBase(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, '')
}

/**
 * 用户自己那把 key → 新内核的模型。五家：OpenAI、Claude、Gemini、DeepSeek、Grok。
 * ⚠ baseURL 一律显式给（不给时 SDK 会读进程环境，key 可能发到别处去 —— v3 2026-10-15 撞见过）。
 */
export function resolveNextModel(
  route: ResolvedLlmTextRoute,
  modelId: string,
): NextModel | null {
  switch (route.adapterType) {
    case AI_ADAPTER_TYPES.OPENAI:
      return openAiModel(route, modelId)
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return anthropicModel(route, modelId)
    case AI_ADAPTER_TYPES.GEMINI:
      return geminiModel(route, modelId)
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return deepSeekModel(route, modelId)
    case AI_ADAPTER_TYPES.XAI:
      return grokModel(route, modelId)
    default:
      return null
  }
}

function openAiModel(route: ResolvedLlmTextRoute, modelId: string): NextModel {
  const baseURL = getOpenAiChatBaseUrl(route.providerConfig.baseUrl)
  const provider = createOpenAI({
    apiKey: route.apiKey,
    baseURL,
    fetch: aiGatewayFetch,
  })
  const official = baseURL === AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
  /**
   * ⛔ 不在 OpenAI 那边存记录（`store: false`），所以要带回加密思考
   * （`reasoning.encrypted_content`），下一步原样交回才接得上。
   * `reasoningSummary: 'auto'`（11-18，reasoning 指南）：思考摘要以 reasoning 分片流出，
   * 内核原样喂进「我的想法」那几行（`createReasoningLines`），和 Claude / Gemini 一样。
   * ⚠ 指南：「may require organization verification」—— 没验证的组织会被拒，所以带摘要的
   *   那一份被拒时先退到不带摘要的同一份。
   */
  const responsesOptions =
    (summary: boolean) =>
    (cacheKey: string, effort: AssistantReasoningEffort) => ({
      openai: {
        promptCacheKey: cacheKey,
        store: false,
        reasoningEffort: effort,
        ...(summary ? { reasoningSummary: 'auto' } : {}),
        include: ['reasoning.encrypted_content'],
      },
    })
  if (!official) {
    /**
     * 代理（11-18）：先 Responses —— gpt-6.2-sol / gpt-6.2-astra 的模型页写着「Tool calling requires the
     * Responses API」，Chat Completions 上带工具它不认，而主循环一定带工具。代理没开
     * `/responses`（被 4xx 拒）就退到 Chat Completions；那份对「必须 Responses 才能调工具」的型号
     * 也被拒时，报一句看得懂的话（`rejectedI18nKey`），⛔ 不落成笼统的「提供商错误」。
     * 两份都发创作者选的思考档。代理不挂 OpenAI 自带联网（不一定转发 hosted tools）。
     */
    const chatPath: NextModel = {
      model: provider.chat(modelId),
      path: 'openai-chat',
      nativeTools: {},
      strictTools: false,
      maxOutputTokens: undefined,
      ...noWebPlainShape,
      providerOptions: (_cacheKey, effort) => ({
        openai: { reasoningEffort: effort },
      }),
      ...(OPENAI_TOOLS_NEED_RESPONSES_MODELS.has(modelId)
        ? { rejectedI18nKey: OPENAI_PROXY_NEEDS_RESPONSES_I18N_KEY }
        : {}),
      fallback: null,
    }
    return {
      model: provider.responses(modelId),
      path: 'openai-proxy-responses',
      nativeTools: {},
      strictTools: true,
      maxOutputTokens: undefined,
      ...noWebPlainShape,
      providerOptions: responsesOptions(false),
      fallback: chatPath,
    }
  }
  /** 官方：Responses + 自带 web_search + 思考摘要。被拒依次退：去掉摘要 → 去掉联网。 */
  const responses = (nativeTools: ToolSet, summary: boolean): NextModel => ({
    model: provider.responses(modelId),
    path: `openai-responses${nativeTools.web_search ? '+search' : ''}${summary ? '+summary' : ''}`,
    nativeTools,
    strictTools: true,
    maxOutputTokens: assistantV3VerifiedOutputCap(modelId),
    ...(nativeTools.web_search ? plainShape : noWebPlainShape),
    providerOptions: responsesOptions(summary),
    fallback: summary
      ? responses(nativeTools, false)
      : nativeTools.web_search
        ? responses({}, false)
        : null,
  })
  return responses({ web_search: provider.tools.webSearch({}) }, true)
}

function anthropicModel(
  route: ResolvedLlmTextRoute,
  modelId: string,
): NextModel {
  const provider = createAnthropic({
    apiKey: route.apiKey,
    fetch: aiGatewayFetch,
    baseURL: trimmedBase(
      route.providerConfig.baseUrl,
      AI_PROVIDER_ENDPOINTS.ANTHROPIC,
    ),
  })
  /**
   * 服务端拒答兜底（11-18）：分类器拒了这一次时，Claude 在同一次往返里换它推荐的模型重答
   * （`fallbacks: 'default'`，SDK 自动带 `server-side-fallback-2026-07-01` 头；后台调用早就这样发）。
   * ⛔ Haiku 5.5 没有服务端兜底，不发。
   */
  const refusalFallback: Record<string, JSONValue> =
    modelId === LLM_TEXT_MODEL_IDS.CLAUDE_HAIKU_5_5
      ? {}
      : { fallbacks: 'default' }
  const v3Path: NextModel = {
    model: provider(modelId),
    path: 'anthropic',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens: ASSISTANT_V3_MAX_OUTPUT_TOKENS.anthropic,
    ...noWebAnthropicShape,
    providerOptions: (_cacheKey, effort) => ({
      anthropic: { effort, ...refusalFallback },
    }),
    fallback: null,
  }
  /**
   * ⭐ 2026-02 版联网（先写代码筛结果再进上下文）+ 读网页；adaptive 思考 = 想不想、想多久模型
   * 自己定，档位管上限。思考块带签名，SDK 原样回传。
   * ⚠ 签名绑着它产生时的系统提示与之前每条消息：接力那一跳系统提示会变（开台换脸、台上换型号、
   *   记忆现读），一轮太长时旧工具结果 / 旧图也会被换成一行 —— 都会让之前的思考块对不上，
   *   8/31 后开的账号直接 400（10-27 实测）。`drop_block` = 对不上的由 Claude 丢掉、照常往下跑。
   */
  return {
    ...v3Path,
    ...anthropicShape,
    path: 'anthropic+search',
    nativeTools: {
      // 搜几次、读几页交给模型自己定（10-25 用户定：不设每步上限）。
      // ⚠ 版本与单独联网调用同一个（`ANTHROPIC_API.WEB_SEARCH_TOOL_TYPE`，有测试锁）；这里保留动态过滤。
      web_search: provider.tools.webSearch_20260209({}),
      web_fetch: provider.tools.webFetch_20260209({}),
    },
    providerOptions: (_cacheKey, effort) => ({
      anthropic: {
        effort,
        ...refusalFallback,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
          blockBinding: { prefixMismatchBehavior: 'drop_block' },
        },
      },
    }),
    fallback: v3Path,
  }
}

function geminiModel(route: ResolvedLlmTextRoute, modelId: string): NextModel {
  const provider = createGoogleGenerativeAI({
    apiKey: route.apiKey,
    fetch: aiGatewayFetch,
  })
  const v3Path: NextModel = {
    model: provider(modelId),
    path: 'gemini',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens: assistantV3VerifiedOutputCap(modelId),
    ...noWebPlainShape,
    // 思考签名由 SDK 自己带着走（`thoughtSignature`），跟在完整回复里接回去就行。
    // `includeThoughts`：思考摘要流给界面（10-27「流出思考摘要」），不额外计费。
    providerOptions: (_cacheKey, effort) => ({
      google: {
        thinkingConfig: { thinkingLevel: effort, includeThoughts: true },
      },
    }),
    fallback: null,
  }
  // ⭐ Gemini 3 起自带搜索 / 读网址能和我们的工具同开（SDK 自己打开服务端工具调用）。
  return {
    ...v3Path,
    ...plainShape,
    path: 'gemini+search',
    nativeTools: {
      google_search: provider.tools.googleSearch({}),
      url_context: provider.tools.urlContext({}),
    },
    fallback: v3Path,
  }
}

function deepSeekModel(
  route: ResolvedLlmTextRoute,
  modelId: string,
): NextModel {
  const base = trimmedBase(
    route.providerConfig.baseUrl,
    AI_PROVIDER_ENDPOINTS.DEEPSEEK,
  )
  const chatPath: NextModel = {
    model: createOpenAI({
      apiKey: route.apiKey,
      baseURL: base,
      fetch: aiGatewayFetch,
    }).chat(modelId),
    path: 'deepseek-chat',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens:
      base === AI_PROVIDER_ENDPOINTS.DEEPSEEK
        ? assistantV3VerifiedOutputCap(modelId)
        : undefined,
    ...noWebPlainShape,
    providerOptions: (_cacheKey, effort) => ({
      openai: { reasoningEffort: ASSISTANT_DEEPSEEK_EFFORTS[effort] },
    }),
    fallback: null,
  }
  /**
   * ⭐ Anthropic 兼容入口（`/anthropic/v1/messages`）：思考块能原样接回去（官方要求带工具时
   * 必须传回思考）。⚠ 还没用真 key 跑过主循环 —— 被拒就退回 chat 那条。
   * ⛔ **主循环不挂联网**（11-18 照 https://api-docs.deepseek.com/guides/web_tools）：DeepSeek
   *   的联网工具是 `deepseek_web_search`，文档错误表写着「other tools cannot be used together
   *   with `deepseek_web_search`…」，而主循环一定带着我们自己的工具。之前挂的 Claude
   *   `web_search_20250305` 文档里根本没有。DeepSeek 要查网只走单独的联网调用（`llm-web-search`）。
   * 思考档走 `output_config.effort`（兼容层文档：只认 low / high / max），映射同 chat 那条。
   */
  const anthropic = createAnthropic({
    apiKey: route.apiKey,
    fetch: aiGatewayFetch,
    baseURL: `${base.replace(/\/v1$/, '')}/anthropic/v1`,
  })
  return {
    model: anthropic(modelId),
    path: 'deepseek-anthropic',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens:
      chatPath.maxOutputTokens ?? ASSISTANT_V3_MAX_OUTPUT_TOKENS.anthropic,
    ...noWebPlainShape,
    providerOptions: (_cacheKey, effort) => ({
      anthropic: { effort: ASSISTANT_DEEPSEEK_EFFORTS[effort] },
    }),
    fallback: chatPath,
  }
}

function grokModel(route: ResolvedLlmTextRoute, modelId: string): NextModel {
  const baseURL = trimmedBase(
    route.providerConfig.baseUrl,
    AI_PROVIDER_ENDPOINTS.XAI,
  )
  const provider = createOpenAI({
    apiKey: route.apiKey,
    baseURL,
    fetch: aiGatewayFetch,
  })
  const official = baseURL === AI_PROVIDER_ENDPOINTS.XAI
  const outputCap = official ? assistantV3VerifiedOutputCap(modelId) : undefined
  // ⚠ grok 的推理关不掉、自己默认 high；⛔ 不发已弃用的 `max_tokens`。
  const chatPath: NextModel = {
    model: provider.chat(modelId),
    path: 'grok-chat',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens: undefined,
    ...noWebPlainShape,
    providerOptions: (_cacheKey, effort) => ({
      openai: {
        reasoningEffort: effort,
        ...(outputCap === undefined ? {} : { maxCompletionTokens: outputCap }),
      },
    }),
    /**
     * 缓存路由（11-18，xAI「Maximizing cache hits」）：Chat Completions 上是请求头
     * 「Set `x-grok-conv-id`」，同一个值的请求落到同一台缓存上。
     */
    headers: (cacheKey) => ({ [XAI_API.CONVERSATION_ID_HEADER]: cacheKey }),
    preparePicture: toGrokPicture,
    fallback: null,
  }
  if (!official) return chatPath
  /**
   * ⭐ Responses：思考能接上（加密思考带回）+ 自带 web_search。⚠ 没用真 key 跑过，被拒退回 chat。
   * `promptCacheKey`（11-18）：xAI 文档 Responses 上「use the `prompt_cache_key` field directly in
   *   the request body」，与 OpenAI 同名同义。
   * `forceReasoning`（11-18）：SDK 只按 OpenAI 型号名（gpt-5+ / o 系）认推理模型，`grok-4.7` 认不出，
   *   Responses 上就**不发** `reasoning.effort` —— 思考 chip 选了不生效。显式告诉它这是推理模型。
   */
  return {
    model: provider.responses(modelId),
    path: 'grok-responses+search',
    nativeTools: { web_search: provider.tools.webSearch({}) },
    strictTools: false,
    maxOutputTokens: outputCap,
    ...plainShape,
    providerOptions: (cacheKey, effort) => ({
      openai: {
        promptCacheKey: cacheKey,
        store: false,
        forceReasoning: true,
        reasoningEffort: effort,
        include: ['reasoning.encrypted_content'],
      },
    }),
    preparePicture: toGrokPicture,
    fallback: chatPath,
  }
}

/**
 * xAI 看图只收 jpg / png（image-understanding 文档「Supported image file types: jpg/jpeg or
 * png」），助手的图可能是 WebP（`ASSISTANT_V3_PICTURE_FORMATS`）：发给 Grok 前转成 PNG（11-18）。
 */
async function toGrokPicture(picture: NextPicture): Promise<NextPicture> {
  if (
    (XAI_API.IMAGE_MEDIA_TYPES as readonly string[]).includes(picture.mediaType)
  )
    return picture
  const png = await encodePng(await decodeImage(picture.data))
  return { data: png, mediaType: 'image/png' }
}
