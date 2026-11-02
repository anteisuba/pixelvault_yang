import 'server-only'

/**
 * LLM 文本层的唯一入口（o-llm，docs/design/llm.md）：调用方只 import 这个文件。
 * 各家实现在 `src/services/llm/`，这里只做分派、超时归一与统一调用日志。
 */

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LLM_TEXT_TIMEOUTS_MS } from '@/constants/config'
import {
  LLM_TEXT_MODELS,
  type LlmTextAdapterType,
  type LlmTextInput,
  guardUserPrompt,
  isAbortError,
  isLlmTextAdapter,
  toLlmTextTimeoutError,
} from '@/services/llm/llm-core'
import {
  geminiTextCompletion,
  geminiTextStream,
} from '@/services/llm/llm-gemini'
import {
  openAiTextCompletion,
  openAiTextStream,
} from '@/services/llm/llm-openai'
import {
  deepseekTextCompletion,
  deepseekTextStream,
} from '@/services/llm/llm-deepseek'
import {
  anthropicTextCompletion,
  anthropicTextStream,
} from '@/services/llm/llm-anthropic'
import { xaiTextCompletion, xaiTextStream } from '@/services/llm/llm-xai'
import { logger } from '@/lib/logger'
import type { LlmTextUsage } from '@/services/llm/llm-core'
import { recordLlmUsage } from '@/services/llm-usage.service'

export {
  type VideoAnalysisWindow,
  type LlmTextInput,
  type ResolvedLlmTextRoute,
  type LlmTextUsage,
  LLM_TEXT_ADAPTERS,
  LLM_TEXT_PROVIDER_ERROR_CODES,
  isLlmTextContextLimitError,
  isLlmTextTransientError,
  toLlmTextProviderError,
  resolveLlmTextRoute,
} from '@/services/llm/llm-core'
export {
  getOpenAiChatBaseUrl,
  openAiTextStream,
} from '@/services/llm/llm-openai'
export {
  type LlmNativeSearchSource,
  type LlmNativeSearchStatus,
  type LlmNativeSearchResult,
  type LlmNativeSearchInput,
  supportsNativeWebSearch,
  llmNativeWebSearch,
} from '@/services/llm/llm-web-search'

/**
 * 每一家的 SSE 实现 —— **穷举 Record，没有兜底分支**。
 *
 * ⭐ 这张表取代了原先的 `LLM_TEXT_STREAMING_ADAPTERS: Set` + 「不在集合里就缓冲」
 *    降级。那条降级是 2026-08-24 生产 504 能活下来的原因：08-23 接 Grok 时只写了
 *    缓冲那一半，`llmTextStream` 于是静默地 `yield await llmTextCompletion()`，
 *    形态一模一样、行为天差地别（一个逐字、一个等完再一坨），**编译器和测试都不
 *    会说话**，直到线上一条长对话把 60 秒跑穿。
 *
 *    原来的注释写着「调用方要区分就查 `supportsLlmTextStreaming()`」——
 *    实际上没有任何调用方去查过。这正是 Engineering Principles 1 禁的那种
 *    fallback：它让缺陷可以静默存在。
 *
 * ⛔ **不许加 `default` / 索引签名 / `Partial`**。这张表的全部价值就是：接第七家
 *    LLM 文本 provider 时漏写 stream 实现，`tsc` 当场报
 *    「Property '<家>' is missing」，而不是等生产给你一个 504。
 */
export const LLM_TEXT_STREAMS: Record<
  LlmTextAdapterType,
  (input: LlmTextInput) => AsyncIterable<string>
> = {
  [AI_ADAPTER_TYPES.GEMINI]: geminiTextStream,
  [AI_ADAPTER_TYPES.OPENAI]: openAiTextStream,
  [AI_ADAPTER_TYPES.DEEPSEEK]: deepseekTextStream,
  [AI_ADAPTER_TYPES.ANTHROPIC]: anthropicTextStream,
  [AI_ADAPTER_TYPES.XAI]: xaiTextStream,
}

type LlmCallOutcome = 'ok' | 'error' | 'aborted'

/**
 * 账本口径：`outputTokens` 含思考。Gemini 原生的 `candidatesTokenCount` 不含思考（另在
 * `thoughtsTokenCount`，而思考照输出价收），这里加回去；其余几家的输出数本来就含。
 */
function toLedgerTokens(
  adapterType: AI_ADAPTER_TYPES,
  usage: LlmTextUsage | null,
): LlmTextUsage | null {
  if (
    !usage ||
    adapterType !== AI_ADAPTER_TYPES.GEMINI ||
    usage.reasoningTokens === undefined
  )
    return usage
  return {
    ...usage,
    outputTokens: (usage.outputTokens ?? 0) + usage.reasoningTokens,
  }
}

/**
 * 每一次 LLM 调用一行 `llm call` 日志（o-llm 费用记录，docs/design/llm.md §3）：
 * 哪家、哪个型号、干什么、多久、成没成、token 多少。所有调用方都经过这里，
 * ⛔ 不靠各调用方自己记 —— 之前只有助手记，其余 20 个调用方的花费看不见。
 * 调用方自己的 `onUsage` 照常收到。
 *
 * 同一处顺手记账（平台点数）：带了 `meter` 的调用一次一行 `ApiUsageLedger`（kind = llm，
 * 按型号单价折点；⛔ 不等不抛）。
 */
function startLlmCallRecord(input: LlmTextInput, mode: 'complete' | 'stream') {
  const startedAt = Date.now()
  let usage: LlmTextUsage | null = null
  let finished = false
  const recorded: LlmTextInput = {
    ...input,
    onUsage: (next) => {
      usage = next
      try {
        input.onUsage?.(next)
      } catch {
        // 用量回调只给记账用，抛了也不能弄坏这次调用（见 `onUsage` 的约定）。
      }
    },
  }
  return {
    input: recorded,
    finish(outcome: LlmCallOutcome, error?: unknown) {
      if (finished) return
      finished = true
      const modelId =
        input.modelId ??
        (isLlmTextAdapter(input.adapterType)
          ? LLM_TEXT_MODELS[input.adapterType]
          : null)
      const durationMs = Date.now() - startedAt
      logger.info('llm call', {
        purpose: input.purpose ?? 'unspecified',
        mode,
        adapterType: input.adapterType,
        modelId,
        outcome,
        durationMs,
        ...(usage ?? {}),
      })
      if (!input.meter) return
      recordLlmUsage({
        meter: input.meter,
        adapterType: input.adapterType,
        modelId: modelId ?? input.adapterType,
        usage: toLedgerTokens(input.adapterType, usage),
        ok: outcome === 'ok',
        durationMs,
        ...(outcome === 'ok'
          ? {}
          : {
              errorMessage:
                error instanceof Error
                  ? error.message
                  : String(error ?? outcome),
            }),
      })
    },
  }
}

function outcomeOf(error: unknown, signal?: AbortSignal): LlmCallOutcome {
  return signal?.aborted || isAbortError(error) ? 'aborted' : 'error'
}

export async function* llmTextStream(
  input: LlmTextInput,
): AsyncIterable<string> {
  input.signal?.throwIfAborted()
  if (!isLlmTextAdapter(input.adapterType)) {
    // 与 `llmTextCompletion` 的 default 同一条：大声失败，不静默降级。
    throw new Error(
      `LLM text streaming not supported for adapter: ${input.adapterType}`,
    )
  }

  if (
    input.audioData?.length &&
    input.adapterType !== AI_ADAPTER_TYPES.GEMINI
  ) {
    throw new Error(
      'The selected assistant route does not support audio input. Select Gemini.',
    )
  }
  guardUserPrompt(input.userPrompt, input.promptGuardMaxLength)
  const record = startLlmCallRecord(input, 'stream')
  try {
    yield* LLM_TEXT_STREAMS[input.adapterType](record.input)
    record.finish('ok')
  } catch (error) {
    record.finish(outcomeOf(error, input.signal), error)
    input.signal?.throwIfAborted()
    if (isAbortError(error)) {
      throw toLlmTextTimeoutError({
        adapterType: input.adapterType,
        modelId: input.modelId ?? LLM_TEXT_MODELS[input.adapterType],
        timeoutMs: LLM_TEXT_TIMEOUTS_MS.COMPLETION,
      })
    }
    throw error
  } finally {
    // 调用方中途 break 出去（拿够了）：生成器被 return，上面两支都不走，照样记一行。
    record.finish('ok')
  }
}

function completeWith(input: LlmTextInput): Promise<string> {
  switch (input.adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return geminiTextCompletion(input)
    case AI_ADAPTER_TYPES.OPENAI:
      return openAiTextCompletion(input)
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return deepseekTextCompletion(input)
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return anthropicTextCompletion(input)
    case AI_ADAPTER_TYPES.XAI:
      return xaiTextCompletion(input)
    default:
      throw new Error(
        `LLM text completion not supported for adapter: ${input.adapterType}`,
      )
  }
}

/**
 * Complete a text prompt using the specified LLM provider.
 * Supports pure text and multimodal (image + text) input.
 */
export async function llmTextCompletion(input: LlmTextInput): Promise<string> {
  input.signal?.throwIfAborted()
  if (
    input.audioData?.length &&
    input.adapterType !== AI_ADAPTER_TYPES.GEMINI
  ) {
    throw new Error(
      'The selected assistant route does not support audio input. Select Gemini.',
    )
  }
  guardUserPrompt(input.userPrompt, input.promptGuardMaxLength)
  const record = startLlmCallRecord(input, 'complete')
  try {
    const text = await completeWith(record.input)
    record.finish('ok')
    return text
  } catch (error) {
    record.finish(outcomeOf(error, input.signal), error)
    input.signal?.throwIfAborted()
    if (isAbortError(error) && isLlmTextAdapter(input.adapterType)) {
      throw toLlmTextTimeoutError({
        adapterType: input.adapterType,
        modelId: input.modelId ?? LLM_TEXT_MODELS[input.adapterType],
        timeoutMs: LLM_TEXT_TIMEOUTS_MS.COMPLETION,
      })
    }
    throw error
  }
}
