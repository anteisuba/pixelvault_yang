import 'server-only'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getOpenAiChatBaseUrl,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'

/** AI SDK 的 `providerOptions` 形状（provider 名 → 该家的参数）。 */
export type AssistantV3ProviderOptions = Record<
  string,
  Record<string, string | number | boolean>
>

export interface AssistantV3Model {
  readonly model: LanguageModel
  /** OpenAI 严格模式：工具入参按 schema 生成，形状错不了（草稿步 0 的前提）。 */
  readonly strictTools: boolean
  providerOptions(cacheKey: string): AssistantV3ProviderOptions
}

/**
 * 用户自己那把 key → AI SDK 模型。S1 只接三家：OpenAI（先跑）、Claude（过几天
 * 另跑一轮）、Gemini（看视频 / 听音频的那家）。别的厂商照走旧内核。
 *
 * ⚠ 缓存键只发给官方端点（代理不一定认这个字段）。
 */
export function resolveAssistantV3Model(
  route: ResolvedLlmTextRoute,
  modelId: string,
): AssistantV3Model | null {
  switch (route.adapterType) {
    case AI_ADAPTER_TYPES.OPENAI: {
      const baseURL = getOpenAiChatBaseUrl(route.providerConfig.baseUrl)
      const provider = createOpenAI({ apiKey: route.apiKey, baseURL })
      const official = baseURL === AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
      /**
       * ⚠ 官方端点走 Responses：GPT-6 在 Chat Completions 里推理档与工具调用不能同开
       * （2026-10-09 回放第一题就报这个错）。⛔ 不存记录（`store: false`）：本轮记录
       * 由我们自己还原，OpenAI 那边留一份只是多一处用户数据。代理端点不一定有
       * `/responses`，照走 Chat Completions。
       */
      return {
        model: official ? provider.responses(modelId) : provider.chat(modelId),
        strictTools: official,
        providerOptions: (cacheKey): AssistantV3ProviderOptions =>
          official
            ? { openai: { promptCacheKey: cacheKey, store: false } }
            : {},
      }
    }
    case AI_ADAPTER_TYPES.ANTHROPIC: {
      const provider = createAnthropic({ apiKey: route.apiKey })
      return {
        model: provider(modelId),
        strictTools: false,
        providerOptions: () => ({}),
      }
    }
    case AI_ADAPTER_TYPES.GEMINI: {
      const provider = createGoogleGenerativeAI({ apiKey: route.apiKey })
      return {
        model: provider(modelId),
        strictTools: false,
        providerOptions: () => ({}),
      }
    }
    default:
      return null
  }
}
