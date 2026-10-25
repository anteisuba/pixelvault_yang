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
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getOpenAiChatBaseUrl,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'

/**
 * 新内核的模型接法（接口与搜索调研：/mnt/project-files/assistant-reliability/model-interfaces.md）。
 *
 * 和 v3 的三处不同，都是为了「别让外壳绊住模型」：
 *  ① 各家**自带的联网搜索 / 读网页直接挂在主循环上**：搜不搜、搜几次、点进哪一页，模型自己定；
 *    外壳只给来源名单（⛔ 不改写查询、不扇出、不替它拼证据）。
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
  messages(messages: ModelMessage[]): ModelMessage[]
  /** 第一次调用就被拒（4xx）时换成的那一份；没有 = 已经是最保守的接法。 */
  readonly fallback: NextModel | null
}

/**
 * Claude 的缓存断点（同 v3 的做法，⚠ 上限 4 个）：系统提示两段各一个、最后一条消息一个。
 * 新内核每一步都把上一步的完整回复接在后面，前缀逐字不变，最后一条那一处每步往后挪。
 */
const ANTHROPIC_CACHE_POINT = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
} as const

function withLastCachePoint(messages: ModelMessage[]): ModelMessage[] {
  const last = messages.length - 1
  return messages.map((message, index) =>
    index === last
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
  messages: withLastCachePoint,
}

const plainShape = {
  system: (text: { stable: string; creator: string }) =>
    `${text.stable}${text.creator}`,
  messages: (messages: ModelMessage[]) => messages,
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
  const provider = createOpenAI({ apiKey: route.apiKey, baseURL })
  const official = baseURL === AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
  // 代理端点不一定有 `/responses`，也不一定认档位：照 v3 走 Chat Completions、不发档位。
  if (!official)
    return {
      model: provider.chat(modelId),
      path: 'openai-chat',
      nativeTools: {},
      strictTools: false,
      maxOutputTokens: undefined,
      ...plainShape,
      providerOptions: () => ({}),
      fallback: null,
    }
  /**
   * 官方：Responses + 自带 web_search。⛔ 不在 OpenAI 那边存记录（`store: false`），
   * 所以要带回加密思考（`reasoning.encrypted_content`），下一步原样交回才接得上。
   */
  const responses = (nativeTools: ToolSet): NextModel => ({
    model: provider.responses(modelId),
    path: nativeTools.web_search
      ? 'openai-responses+search'
      : 'openai-responses',
    nativeTools,
    strictTools: true,
    maxOutputTokens: assistantV3VerifiedOutputCap(modelId),
    ...plainShape,
    providerOptions: (cacheKey, effort) => ({
      openai: {
        promptCacheKey: cacheKey,
        store: false,
        reasoningEffort: effort,
        include: ['reasoning.encrypted_content'],
      },
    }),
    fallback: nativeTools.web_search ? responses({}) : null,
  })
  return responses({ web_search: provider.tools.webSearch({}) })
}

function anthropicModel(
  route: ResolvedLlmTextRoute,
  modelId: string,
): NextModel {
  const provider = createAnthropic({
    apiKey: route.apiKey,
    baseURL: trimmedBase(
      route.providerConfig.baseUrl,
      AI_PROVIDER_ENDPOINTS.ANTHROPIC,
    ),
  })
  const v3Path: NextModel = {
    model: provider(modelId),
    path: 'anthropic',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens: ASSISTANT_V3_MAX_OUTPUT_TOKENS.anthropic,
    ...anthropicShape,
    providerOptions: (_cacheKey, effort) => ({ anthropic: { effort } }),
    fallback: null,
  }
  /**
   * ⭐ 2026-02 版联网（先写代码筛结果再进上下文）+ 读网页；adaptive 思考 = 想不想、想多久模型
   * 自己定，档位管上限。思考块带签名，SDK 原样回传。
   */
  return {
    ...v3Path,
    path: 'anthropic+search',
    nativeTools: {
      // 搜几次、读几页交给模型自己定（10-25 用户定：不设每步上限）。
      web_search: provider.tools.webSearch_20260209({}),
      web_fetch: provider.tools.webFetch_20260209({}),
    },
    providerOptions: (_cacheKey, effort) => ({
      anthropic: {
        effort,
        thinking: { type: 'adaptive', display: 'summarized' },
      },
    }),
    fallback: v3Path,
  }
}

function geminiModel(route: ResolvedLlmTextRoute, modelId: string): NextModel {
  const provider = createGoogleGenerativeAI({ apiKey: route.apiKey })
  const v3Path: NextModel = {
    model: provider(modelId),
    path: 'gemini',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens: assistantV3VerifiedOutputCap(modelId),
    ...plainShape,
    // 思考签名由 SDK 自己带着走（`thoughtSignature`），跟在完整回复里接回去就行。
    providerOptions: (_cacheKey, effort) => ({
      google: { thinkingConfig: { thinkingLevel: effort } },
    }),
    fallback: null,
  }
  // ⭐ Gemini 3 起自带搜索 / 读网址能和我们的工具同开（SDK 自己打开服务端工具调用）。
  return {
    ...v3Path,
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
    model: createOpenAI({ apiKey: route.apiKey, baseURL: base }).chat(modelId),
    path: 'deepseek-chat',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens:
      base === AI_PROVIDER_ENDPOINTS.DEEPSEEK
        ? assistantV3VerifiedOutputCap(modelId)
        : undefined,
    ...plainShape,
    providerOptions: (_cacheKey, effort) => ({
      openai: { reasoningEffort: ASSISTANT_DEEPSEEK_EFFORTS[effort] },
    }),
    fallback: null,
  }
  /**
   * ⭐ Anthropic 兼容入口（`/anthropic/v1/messages`，`llm-text.service` 的联网已在用）：思考块
   * 能原样接回去（官方要求带工具时必须传回思考），还顺带有自带联网。⚠ 兼容层没写域名 / 地区
   * 这些参数，只带次数；⚠ 还没用真 key 跑过主循环 —— 被拒就退回 chat 那条。
   */
  const anthropic = createAnthropic({
    apiKey: route.apiKey,
    baseURL: `${base.replace(/\/v1$/, '')}/anthropic/v1`,
  })
  return {
    model: anthropic(modelId),
    path: 'deepseek-anthropic+search',
    nativeTools: {
      web_search: anthropic.tools.webSearch_20250305({}),
    },
    strictTools: false,
    maxOutputTokens:
      chatPath.maxOutputTokens ?? ASSISTANT_V3_MAX_OUTPUT_TOKENS.anthropic,
    ...plainShape,
    providerOptions: () => ({}),
    fallback: chatPath,
  }
}

function grokModel(route: ResolvedLlmTextRoute, modelId: string): NextModel {
  const baseURL = trimmedBase(
    route.providerConfig.baseUrl,
    AI_PROVIDER_ENDPOINTS.XAI,
  )
  const provider = createOpenAI({ apiKey: route.apiKey, baseURL })
  const official = baseURL === AI_PROVIDER_ENDPOINTS.XAI
  const outputCap = official ? assistantV3VerifiedOutputCap(modelId) : undefined
  // ⚠ grok 的推理关不掉、自己默认 high；⛔ 不发已弃用的 `max_tokens`。
  const chatPath: NextModel = {
    model: provider.chat(modelId),
    path: 'grok-chat',
    nativeTools: {},
    strictTools: false,
    maxOutputTokens: undefined,
    ...plainShape,
    providerOptions: (_cacheKey, effort) => ({
      openai: {
        reasoningEffort: effort,
        ...(outputCap === undefined ? {} : { maxCompletionTokens: outputCap }),
      },
    }),
    fallback: null,
  }
  if (!official) return chatPath
  /** ⭐ Responses：思考能接上（加密思考带回）+ 自带 web_search。⚠ 没用真 key 跑过，被拒退回 chat。 */
  return {
    model: provider.responses(modelId),
    path: 'grok-responses+search',
    nativeTools: { web_search: provider.tools.webSearch({}) },
    strictTools: false,
    maxOutputTokens: outputCap,
    ...plainShape,
    providerOptions: (_cacheKey, effort) => ({
      openai: {
        store: false,
        reasoningEffort: effort,
        include: ['reasoning.encrypted_content'],
      },
    }),
    fallback: chatPath,
  }
}
