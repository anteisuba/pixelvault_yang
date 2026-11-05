import 'server-only'

/**
 * LLM 文本层的唯一入口（o-llm，docs/design/llm.md）：调用方只 import 这个文件。
 * 各家实现在 `src/services/llm/`，这里只做分派、超时归一、统一重发与调用日志。
 */

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LLM_TEXT_RETRY, LLM_TEXT_TIMEOUTS_MS } from '@/constants/config'
import {
  LLM_TEXT_MODELS,
  type LlmTextInput,
  type LlmTextRetryReason,
  getLlmTextRetryReason,
  guardUserPrompt,
  isAbortError,
  isLlmTextAdapter,
  toLlmTextTimeoutError,
} from '@/services/llm/llm-core'
import { geminiTextCompletion } from '@/services/llm/llm-gemini'
import { openAiTextCompletion } from '@/services/llm/llm-openai'
import { deepseekTextCompletion } from '@/services/llm/llm-deepseek'
import { anthropicTextCompletion } from '@/services/llm/llm-anthropic'
import { xaiTextCompletion } from '@/services/llm/llm-xai'
import { logger } from '@/lib/logger'
import type { LlmTextUsage } from '@/services/llm/llm-core'

export {
  type VideoAnalysisWindow,
  type LlmTextInput,
  type ResolvedLlmTextRoute,
  type LlmTextUsage,
  LLM_TEXT_ADAPTERS,
  LLM_TEXT_PROVIDER_ERROR_CODES,
  isLlmTextContextLimitError,
  toLlmTextProviderError,
  resolveLlmTextRoute,
} from '@/services/llm/llm-core'
export { getOpenAiChatBaseUrl } from '@/services/llm/llm-openai'
export {
  type LlmNativeSearchSource,
  type LlmNativeSearchStatus,
  type LlmNativeSearchResult,
  type LlmNativeSearchInput,
  supportsNativeWebSearch,
  llmNativeWebSearch,
} from '@/services/llm/llm-web-search'

type LlmCallOutcome = 'ok' | 'error' | 'aborted'

/**
 * 每一次 LLM 调用一行 `llm call` 日志（o-llm 费用记录，docs/design/llm.md §3）：
 * 哪家、哪个型号、干什么、多久、成没成、token 多少。所有调用方都经过这里，
 * ⛔ 不靠各调用方自己记 —— 之前只有助手记，其余 20 个调用方的花费看不见。
 * 调用方自己的 `onUsage` 照常收到。
 */
function startLlmCallRecord(input: LlmTextInput, attempt: number) {
  const startedAt = Date.now()
  let usage: LlmTextUsage | null = null
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
    startedAt,
    finish(outcome: LlmCallOutcome) {
      logger.info('llm call', {
        purpose: input.purpose ?? 'unspecified',
        adapterType: input.adapterType,
        modelId:
          input.modelId ??
          (isLlmTextAdapter(input.adapterType)
            ? LLM_TEXT_MODELS[input.adapterType]
            : null),
        outcome,
        attempt,
        durationMs: Date.now() - startedAt,
        ...(usage ?? {}),
      })
    },
  }
}

function outcomeOf(error: unknown, signal?: AbortSignal): LlmCallOutcome {
  return signal?.aborted || isAbortError(error) ? 'aborted' : 'error'
}

const RETRY_DELAY_MS: Record<LlmTextRetryReason, number> = {
  transient: LLM_TEXT_RETRY.TRANSIENT_DELAY_MS,
  'rate-limited': LLM_TEXT_RETRY.RATE_LIMITED_DELAY_MS,
  network: LLM_TEXT_RETRY.NETWORK_DELAY_MS,
}

/**
 * 这次失败要不要重发（docs/design/llm.md §4）。**一处管全部调用方**：
 * 同一家、同一把 key、同一型号原样再发一次；失败来得慢（快到路由时限）或
 * 已经重发过就不再试。返回要等的毫秒数，不重发返回 null。
 */
function retryDelayFor(
  error: unknown,
  input: LlmTextInput,
  attempt: number,
  startedAt: number,
): number | null {
  if (attempt >= LLM_TEXT_RETRY.MAX_ATTEMPTS) return null
  const reason = getLlmTextRetryReason(error)
  if (!reason) return null
  const failedAfterMs = Date.now() - startedAt
  if (failedAfterMs > LLM_TEXT_RETRY.MAX_FAILED_ATTEMPT_MS) return null
  const delayMs = RETRY_DELAY_MS[reason]
  logger.warn('llm retry', {
    purpose: input.purpose ?? 'unspecified',
    adapterType: input.adapterType,
    modelId: input.modelId ?? null,
    reason,
    attempt,
    failedAfterMs,
    delayMs,
  })
  return delayMs
}

function waitBeforeRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
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
  for (let attempt = 1; ; attempt++) {
    const record = startLlmCallRecord(input, attempt)
    try {
      const text = await completeWith(record.input)
      record.finish('ok')
      return text
    } catch (error) {
      record.finish(outcomeOf(error, input.signal))
      input.signal?.throwIfAborted()
      if (isAbortError(error) && isLlmTextAdapter(input.adapterType)) {
        throw toLlmTextTimeoutError({
          adapterType: input.adapterType,
          modelId: input.modelId ?? LLM_TEXT_MODELS[input.adapterType],
          timeoutMs: LLM_TEXT_TIMEOUTS_MS.COMPLETION,
        })
      }
      const delayMs = retryDelayFor(error, input, attempt, record.startedAt)
      if (delayMs === null) throw error
      await waitBeforeRetry(delayMs, input.signal)
    }
  }
}
