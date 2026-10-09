import 'server-only'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { JSONValue } from '@ai-sdk/provider'
import type { LanguageModel } from 'ai'

import {
  ASSISTANT_DEEPSEEK_EFFORTS,
  ASSISTANT_REASONING_EFFORT_IDS,
  type AssistantReasoningEffort,
} from '@/constants/assistant-persona'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getOpenAiChatBaseUrl,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'

/** AI SDK 的 `providerOptions` 形状（provider 名 → 该家的参数）。 */
export type AssistantV3ProviderOptions = Record<
  string,
  Record<string, JSONValue>
>

export interface AssistantV3Model {
  readonly model: LanguageModel
  /** OpenAI 严格模式：工具入参按 schema 生成，形状错不了（草稿步 0 的前提）。 */
  readonly strictTools: boolean
  providerOptions(cacheKey: string): AssistantV3ProviderOptions
}

/**
 * 用户自己那把 key → AI SDK 模型。助手路由上的五家都接：OpenAI、Claude、Gemini，
 * 以及走兼容 OpenAI 对话接口的 DeepSeek 与 Grok（2026-10-10 补上，此前这两家退回
 * 旧内核）。别的厂商照走旧内核。
 *
 * ⚠ 缓存键只发给官方端点（代理不一定认这个字段）。
 *
 * ⭐ 思考档位（owner 2026-10-10，输入区「思考」chip）按各家参数名落：OpenAI / Grok 的
 *   `reasoning_effort`、Claude 的 `effort`、Gemini 的 `thinkingLevel` 都是同名三档；
 *   DeepSeek 只有 low / high / max，按 `ASSISTANT_DEEPSEEK_EFFORTS` 换。
 */
export function resolveAssistantV3Model(
  route: ResolvedLlmTextRoute,
  modelId: string,
  effort: AssistantReasoningEffort = ASSISTANT_REASONING_EFFORT_IDS.medium,
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
        // ⚠ 代理端点走 Chat Completions：GPT-6 在那里推理档与工具调用不能同开，⛔ 不发档位。
        providerOptions: (cacheKey): AssistantV3ProviderOptions =>
          official
            ? {
                openai: {
                  promptCacheKey: cacheKey,
                  store: false,
                  reasoningEffort: effort,
                },
              }
            : {},
      }
    }
    case AI_ADAPTER_TYPES.ANTHROPIC: {
      const provider = createAnthropic({ apiKey: route.apiKey })
      return {
        model: provider(modelId),
        strictTools: false,
        providerOptions: () => ({ anthropic: { effort } }),
      }
    }
    case AI_ADAPTER_TYPES.GEMINI: {
      const provider = createGoogleGenerativeAI({ apiKey: route.apiKey })
      return {
        model: provider(modelId),
        strictTools: false,
        /**
         * ⚠ Gemini 3 自己默认最高档：2026-10-10 一步调权重想了 4465 个 token、46 秒；
         *   同题 low 12 秒但把决定推回给创作者，medium 33 秒出卡（所以默认 Medium）。
         */
        providerOptions: () => ({
          google: { thinkingConfig: { thinkingLevel: effort } },
        }),
      }
    }
    case AI_ADAPTER_TYPES.DEEPSEEK: {
      const provider = createOpenAI({
        apiKey: route.apiKey,
        baseURL:
          route.providerConfig.baseUrl?.replace(/\/$/, '') ||
          AI_PROVIDER_ENDPOINTS.DEEPSEEK,
      })
      return {
        model: provider.chat(modelId),
        strictTools: false,
        providerOptions: () => ({
          openai: { reasoningEffort: ASSISTANT_DEEPSEEK_EFFORTS[effort] },
        }),
      }
    }
    case AI_ADAPTER_TYPES.XAI: {
      const provider = createOpenAI({
        apiKey: route.apiKey,
        baseURL:
          route.providerConfig.baseUrl?.replace(/\/$/, '') ||
          AI_PROVIDER_ENDPOINTS.XAI,
      })
      return {
        model: provider.chat(modelId),
        strictTools: false,
        /**
         * ⚠ grok 的推理关不掉、自己默认 high：High 档首字前想得久，旧内核那边曾因此被掐
         *   连接（`buildXaiChatRequest`）。
         */
        providerOptions: () => ({ openai: { reasoningEffort: effort } }),
      }
    }
    default:
      return null
  }
}
