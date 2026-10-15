import 'server-only'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { JSONValue } from '@ai-sdk/provider'
import type { LanguageModel, ModelMessage, SystemModelMessage } from 'ai'

import {
  ASSISTANT_DEEPSEEK_EFFORTS,
  ASSISTANT_REASONING_EFFORT_IDS,
  type AssistantReasoningEffort,
} from '@/constants/assistant-persona'
import { ASSISTANT_V3_MAX_OUTPUT_TOKENS } from '@/constants/assistant-v3'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { AssistantV3SystemPrompt } from '@/services/kernel/assistant-v3-prompt.service'
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
  /**
   * 这一家能不能**按步**换思考档（P2 §2.6，`assistantV3StepEffort`）而不赔掉缓存。
   * ⚠ Claude、OpenAI 官方：⛔ 不换，整轮照用创作者那一档 —— 档位一变，Claude 至少整段消息缓存
   *   作废（有的型号连工具 + 系统提示一起，官方文档建议按路由钉住档位）；OpenAI 换 `reasoning.effort`
   *   会改写藏在前面的系统指令，整段前缀重算。⛔ 也不接两家不赔缓存的 beta 写法。这是我们为了缓存
   *   稳定做的取舍（P2），⛔ 不是 owner 定的。
   * ⭐ Gemini / DeepSeek / Grok：档位是生成参数，不进提示的前缀 —— 换（我的判断，未实测命中率）。
   */
  readonly effortPerStep: boolean
  /**
   * 主步一次最多输出多少 token（`ASSISTANT_V3_MAX_OUTPUT_TOKENS`，交给 `streamText`）。
   * `undefined` = 不发：代理端点（上限由模型自己兜着），以及 Grok（同一个数走 `providerOptions`
   * 的 `maxCompletionTokens`，⛔ 不发已弃用的 `max_tokens`）。
   */
  readonly maxOutputTokens: number | undefined
  providerOptions(
    cacheKey: string,
    effort: AssistantReasoningEffort,
  ): AssistantV3ProviderOptions
  /**
   * 系统提示交给 SDK 的样子。Claude：规则段与分界线之后那段各一块、各带一个缓存断点
   * （`withAnthropicCachePoints`）；别家：一整段（前缀照样稳定，隐式缓存认的就是它）。
   */
  system(
    prompt: Pick<AssistantV3SystemPrompt, 'rules' | 'creator'>,
  ): string | SystemModelMessage[]
  /** Claude：历史末尾与最后一条各打一个缓存断点；别家原样交回。 */
  messages(messages: ModelMessage[], historyLength: number): ModelMessage[]
}

/**
 * Claude 的缓存断点（P2 稳定前缀）。⭐ Claude 只在显式断点处写缓存、读时从断点往回找最多
 * 20 块（官方文档）；没有断点就一字不缓存 —— 2026-10-15 之前 v3 在 Claude 上每一步都整段重算。
 * 四个断点（SDK 与 API 的上限都是 4，`CacheControlValidator`），按变的频率从慢到快：
 *  ① 规则段末尾 —— 工具 + 不变的规则，对这位创作者的每一轮都一样；
 *  ② 分界线之后那段末尾 —— 人设 / 规矩 / 记忆 / 板上型号写法，多数轮不变；
 *  ③ 历史末尾 —— 下一轮的历史是这一轮的历史再接两条，往回找得到这一处；
 *  ④ 最后一条 —— 同一轮的下一步（含接力那一跳）从这里接着读。
 * ⚠ 一步就答完的轮次，④ 写下的那一段（板子 + 这句话）没人再读，多付一次写入的溢价（1.25 倍）
 *   —— 换来多步、接力的那几轮每一步只重算新的那几条。
 * ⚠ 不到最小可缓存长度（按型号 1–4k token）的断点 Claude 直接不缓存，不报错。
 * ⚠ 默认 5 分钟过期；两轮之间隔得更久，①② 也要重写一次。
 */
const ANTHROPIC_CACHE_POINT = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
} as const

function withAnthropicCachePoint<T extends ModelMessage>(message: T): T {
  return {
    ...message,
    providerOptions: {
      ...message.providerOptions,
      anthropic: {
        ...message.providerOptions?.anthropic,
        ...ANTHROPIC_CACHE_POINT.anthropic,
      },
    },
  }
}

function withAnthropicCachePoints(
  messages: ModelMessage[],
  historyLength: number,
): ModelMessage[] {
  const last = messages.length - 1
  return messages.map((message, index) =>
    index === last || (historyLength > 0 && index === historyLength - 1)
      ? withAnthropicCachePoint(message)
      : message,
  )
}

/** 别家：系统提示一整段（规则段在前），消息原样。 */
const plainShape = {
  system: (prompt: Pick<AssistantV3SystemPrompt, 'rules' | 'creator'>) =>
    `${prompt.rules}${prompt.creator}`,
  messages: (messages: ModelMessage[]) => messages,
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
 *   DeepSeek 只有 low / high / max，按 `ASSISTANT_DEEPSEEK_EFFORTS` 换。每一步用哪一档由
 *   `assistantV3StepEffort` 定，交给 `providerOptions`。
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
        effortPerStep: false,
        maxOutputTokens: official
          ? ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.OPENAI]
          : undefined,
        ...plainShape,
        // ⚠ 代理端点走 Chat Completions：GPT-6 在那里推理档与工具调用不能同开，⛔ 不发档位。
        providerOptions: (cacheKey, effort): AssistantV3ProviderOptions =>
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
      /**
       * ⚠ baseURL 一定要显式给：不给时 SDK 读进程环境的 `ANTHROPIC_BASE_URL`，环境里
       * 设了它，创作者的 key 就会发到那个地址去（2026-10-15 回放基线在沙箱里撞见）。
       */
      const provider = createAnthropic({
        apiKey: route.apiKey,
        baseURL:
          route.providerConfig.baseUrl?.replace(/\/$/, '') ||
          AI_PROVIDER_ENDPOINTS.ANTHROPIC,
      })
      return {
        model: provider(modelId),
        strictTools: false,
        effortPerStep: false,
        // Claude 必填（代理也一样）：不给时 SDK 自己填 128k。
        maxOutputTokens:
          ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.ANTHROPIC],
        providerOptions: (_cacheKey, effort) => ({ anthropic: { effort } }),
        system: (prompt) => [
          {
            role: 'system',
            content: prompt.rules,
            providerOptions: ANTHROPIC_CACHE_POINT,
          },
          {
            role: 'system',
            content: prompt.creator,
            providerOptions: ANTHROPIC_CACHE_POINT,
          },
        ],
        messages: withAnthropicCachePoints,
      }
    }
    case AI_ADAPTER_TYPES.GEMINI: {
      const provider = createGoogleGenerativeAI({ apiKey: route.apiKey })
      return {
        model: provider(modelId),
        strictTools: false,
        effortPerStep: true,
        // 只走官方端点（这里不接自定义地址）。
        maxOutputTokens:
          ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.GEMINI],
        ...plainShape,
        /**
         * ⚠ Gemini 3 自己默认最高档：2026-10-10 一步调权重想了 4465 个 token、46 秒；
         *   同题 low 12 秒但把决定推回给创作者，medium 33 秒出卡（所以默认 Medium）。
         */
        providerOptions: (_cacheKey, effort) => ({
          google: { thinkingConfig: { thinkingLevel: effort } },
        }),
      }
    }
    case AI_ADAPTER_TYPES.DEEPSEEK: {
      const baseURL =
        route.providerConfig.baseUrl?.replace(/\/$/, '') ||
        AI_PROVIDER_ENDPOINTS.DEEPSEEK
      const provider = createOpenAI({ apiKey: route.apiKey, baseURL })
      return {
        model: provider.chat(modelId),
        strictTools: false,
        effortPerStep: true,
        maxOutputTokens:
          baseURL === AI_PROVIDER_ENDPOINTS.DEEPSEEK
            ? ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.DEEPSEEK]
            : undefined,
        ...plainShape,
        providerOptions: (_cacheKey, effort) => ({
          openai: { reasoningEffort: ASSISTANT_DEEPSEEK_EFFORTS[effort] },
        }),
      }
    }
    case AI_ADAPTER_TYPES.XAI: {
      const baseURL =
        route.providerConfig.baseUrl?.replace(/\/$/, '') ||
        AI_PROVIDER_ENDPOINTS.XAI
      const provider = createOpenAI({ apiKey: route.apiKey, baseURL })
      const official = baseURL === AI_PROVIDER_ENDPOINTS.XAI
      return {
        model: provider.chat(modelId),
        strictTools: false,
        effortPerStep: true,
        // ⛔ 不发 `max_tokens`（已弃用）：上限走 `max_completion_tokens`，见下。
        maxOutputTokens: undefined,
        ...plainShape,
        /**
         * ⚠ grok 的推理关不掉、自己默认 high：High 档首字前想得久，旧内核那边曾因此被掐
         *   连接（`buildXaiChatRequest`）。
         */
        providerOptions: (_cacheKey, effort) => ({
          openai: {
            reasoningEffort: effort,
            ...(official
              ? {
                  maxCompletionTokens:
                    ASSISTANT_V3_MAX_OUTPUT_TOKENS[AI_ADAPTER_TYPES.XAI],
                }
              : {}),
          },
        }),
      }
    }
    default:
      return null
  }
}

/**
 * 这一步用哪一档（设计方案 §2.6，P2）。
 * - 创作者在「思考」chip 上选的那一档管**想事的步**：开轮第一步，以及一切还要判断的步。
 * - **纯落地步**（`landing`：上一步的调用全是成功落下的 edit / write，模型多半只剩收尾那句）用
 *   `low`；⚠ 只在 `effortPerStep` 的那几家换 —— 换档赔缓存的两家（Claude、OpenAI 官方）整轮
 *   照用创作者那一档。`low` 是最低档，⛔ 永远不会高过创作者选的。
 * ⚠ 「落地步」的判据是保守版（我的判断）：上一步只要有一个调用不是成功的 edit / write
 *   （查了、看了、问了、失败了），这一步照用创作者那一档。
 */
export function assistantV3StepEffort(
  model: Pick<AssistantV3Model, 'effortPerStep'>,
  creator: AssistantReasoningEffort,
  landing: boolean,
): AssistantReasoningEffort {
  return landing && model.effortPerStep
    ? ASSISTANT_REASONING_EFFORT_IDS.low
    : creator
}
