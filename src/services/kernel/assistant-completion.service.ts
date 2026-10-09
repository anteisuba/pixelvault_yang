import 'server-only'

import { after } from 'next/server'

import { logger } from '@/lib/logger'
import { sendLlmCallLogToWorker } from '@/services/execution-worker.service'
import {
  isLlmTextContextLimitError,
  isLlmTextTransientError,
  llmTextCompletion,
  llmTextStream,
  type LlmTextInput,
  type LlmTextUsage,
  type ResolvedLlmTextRoute,
  isLlmTextRecoverableError,
} from '@/services/llm-text.service'

interface AssistantConversationEntry {
  role: 'user' | 'assistant'
  content: string
}

interface CompleteAssistantTextOptions {
  systemPrompt: string
  signal?: AbortSignal
  buildUserPrompt(maxLength?: number): string
  route: ResolvedLlmTextRoute
  contextCompactionTargetLength: number
  modelId?: string
  imageData?: LlmTextInput['imageData']
  imageLabels?: LlmTextInput['imageLabels']
  videoData?: LlmTextInput['videoData']
  audioData?: LlmTextInput['audioData']
  /**
   * 视频分析窗口（裁剪/降帧）。⚠ **必须一路转发到 provider**：它是长视频的成本
   * 闸（§4.3.1 实测：裁 0–60s 只要全片 5% 的 token，fps 0.2 要 42%）。这里漏一
   * 手，`resolveNativeVideoWindow` 算出来的降级就静默失效 —— 表现不是报错，是
   * 半小时的视频照全片满帧烧，只有账单看得见。
   */
  videoAnalysis?: LlmTextInput['videoAnalysis']
  useGrounding?: boolean
  /** Request strict JSON where the provider supports it (F1 结构化输出). */
  responseFormat?: LlmTextInput['responseFormat']
  jsonSchema?: LlmTextInput['jsonSchema']
  /** 进 `assistant llm call` 那行日志：这次调用是干什么的、第几步。 */
  callLog?: AssistantLlmCallLog
  /**
   * 这条路临时出不来（`isLlmTextRecoverableError`）、重发一次仍不行时，借另一条路把这一次
   * 跑完。⚠ 只在**一个字都没吐出**时换（与重发同一条规矩）；借到了必经 `onFallback`
   * 告诉调用方，由它让模型对用户说一句。
   */
  fallback?(): Promise<AssistantFallbackTextRoute | null>
  onFallback?(info: AssistantFallbackTextRoute & { error: unknown }): void
}

export interface AssistantFallbackTextRoute {
  route: ResolvedLlmTextRoute
  modelId?: string
}

type CallOutcome = 'ok' | 'error' | 'aborted' | 'closed'

export interface AssistantLlmCallLog {
  purpose: string
  domain?: string
  step?: number
}

/**
 * 每一次发出去的请求（含重发）打一行 `assistant llm call`：耗时、结果与 provider 自报的
 * token（助手花费排查 2026-10-08；口径见 `LlmTextUsage`）。⭐ 生产也打，只有数。
 * `usageReported: false` = 这家这次没报 token（失败、被掐、OpenAI 流式）。
 * 同一行另发给 execution worker 存进 Workers Logs（Vercel 的只留 1 小时）。
 * ⚠ 字段名用复数 `*Tokens`：logger 会把以 `token` 结尾的字段当密钥脱敏。
 */
function startCallLog(
  options: Pick<CompleteAssistantTextOptions, 'callLog' | 'route' | 'modelId'>,
  attempt: number,
) {
  const startedAt = Date.now()
  let usage: LlmTextUsage | null = null
  return {
    onUsage(next: LlmTextUsage) {
      usage = next
    },
    finish(outcome: CallOutcome) {
      const entry = {
        ...options.callLog,
        adapterType: options.route.adapterType,
        modelId: options.modelId ?? null,
        attempt,
        outcome,
        llmMs: Date.now() - startedAt,
        usageReported: usage !== null,
        ...usage,
      }
      logger.info('assistant llm call', entry)
      shipCallLog(entry)
    },
  }
}

/** ⛔ 不等、不抛：日志发不出去绝不能拖慢或弄坏这次回答。 */
function shipCallLog(entry: Parameters<typeof sendLlmCallLogToWorker>[0]) {
  const pending = sendLlmCallLogToWorker(entry).catch((error: unknown) => {
    logger.warn('assistant llm call log not shipped', {
      error: error instanceof Error ? error.message : String(error),
    })
  })
  try {
    // 最后一次调用的日志常在响应收尾时才发出，`after` 让函数等它发完再退。
    after(() => pending)
  } catch {
    // 不在请求作用域里（脚本 / 测试）：已经发出去了，不必再等。
  }
}

function failureOutcome(signal: AbortSignal | undefined): CallOutcome {
  return signal?.aborted ? 'aborted' : 'error'
}

export function truncateAssistantContextBlock(
  value: string,
  maxLength: number,
  omissionMessage: string,
): string {
  if (value.length <= maxLength) return value

  const marker = `\n[${omissionMessage}]`
  if (marker.length >= maxLength) return marker.slice(0, maxLength)
  const contentLength = Math.max(0, maxLength - marker.length)
  return `${value.slice(0, contentLength).trimEnd()}${marker}`
}

/**
 * Keep the newest turns verbatim while reducing older turns to an extractive
 * summary. This is only used after the selected provider rejects the full
 * prompt for exceeding its own context window.
 */
export function buildAssistantConversation(
  messages: readonly AssistantConversationEntry[],
  maxLength?: number,
): string {
  const entries = messages.map((message) => {
    const label = message.role === 'user' ? 'User' : 'Assistant'
    return `${label}: ${message.content}`
  })
  const fullConversation = entries.join('\n\n')
  if (maxLength === undefined || fullConversation.length <= maxLength) {
    return fullConversation
  }

  const compactEntry = (entry: string, limit: number): string => {
    if (entry.length <= limit) return entry
    const marker = '\n[...middle compacted...]\n'
    if (marker.length >= limit) return entry.slice(0, limit)
    const available = Math.max(0, limit - marker.length)
    const headLength = Math.ceil(available * 0.65)
    return `${entry.slice(0, headLength)}${marker}${entry.slice(
      entry.length - (available - headLength),
    )}`
  }

  const recentBudget = Math.max(1, Math.floor(maxLength * 0.68))
  const kept: string[] = []
  let keptLength = 0

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry) continue

    const separatorLength = kept.length > 0 ? 2 : 0
    if (keptLength + separatorLength + entry.length > recentBudget) break

    kept.unshift(entry)
    keptLength += separatorLength + entry.length
  }

  if (kept.length === 0) {
    const marker = '[Latest message compacted for the model context retry.]\n\n'
    return `${marker}${compactEntry(
      entries.at(-1) ?? '',
      Math.max(1, maxLength - marker.length),
    )}`
  }

  const omittedEntries = entries.slice(0, entries.length - kept.length)
  const marker = `[${omittedEntries.length} earlier messages compacted into an extractive summary.]`
  const recentLabel = 'RECENT CONVERSATION:'
  const fixedLength = marker.length + recentLabel.length + keptLength + 4
  const summaryBudget = Math.max(1, maxLength - fixedLength)
  const summary = truncateAssistantContextBlock(
    omittedEntries
      .map((entry) => compactEntry(entry.replace(/\s+/g, ' '), 180))
      .join('\n'),
    summaryBudget,
    'Additional older-history details compacted.',
  )

  return `${marker}\n${summary}\n\n${recentLabel}\n${kept.join('\n\n')}`
}

/**
 * Shared non-streaming assistant completion policy.
 *
 * The selected provider owns input/output ceilings. PixelVault sends the full
 * sanitized context first and retries exactly once: compacted when the
 * provider reports an input-context overflow, unchanged after a short wait
 * when it reports a transient outage (see `promptForRetry`).
 */
export async function completeAssistantTextWithContextRetry({
  systemPrompt,
  signal,
  buildUserPrompt,
  route,
  contextCompactionTargetLength,
  modelId,
  imageData,
  imageLabels,
  videoData,
  audioData,
  videoAnalysis,
  useGrounding,
  responseFormat,
  jsonSchema,
  callLog,
  fallback,
  onFallback,
}: CompleteAssistantTextOptions): Promise<string> {
  signal?.throwIfAborted()
  let attempt = 0
  const complete = async (
    userPrompt: string,
    on: AssistantFallbackTextRoute = { route, modelId },
  ) => {
    const call = startCallLog(
      { callLog, route: on.route, modelId: on.modelId },
      ++attempt,
    )
    try {
      const result = await llmTextCompletion({
        systemPrompt,
        signal,
        userPrompt,
        modelId: on.modelId,
        imageData,
        imageLabels,
        videoData,
        audioData,
        videoAnalysis,
        adapterType: on.route.adapterType,
        providerConfig: on.route.providerConfig,
        apiKey: on.route.apiKey,
        useGrounding,
        providerManagedOutput: true,
        promptGuardMaxLength: null,
        responseFormat,
        jsonSchema,
        onUsage: call.onUsage,
      })
      call.finish('ok')
      return result
    } catch (error) {
      call.finish(failureOutcome(signal))
      throw error
    }
  }

  const fullPrompt = buildUserPrompt()
  try {
    const result = await complete(fullPrompt)
    signal?.throwIfAborted()
    return result
  } catch (error) {
    signal?.throwIfAborted()
    let lastError: unknown = error
    let lastPrompt = fullPrompt
    try {
      lastPrompt = await promptForRetry(error, {
        fullPrompt,
        buildUserPrompt,
        contextCompactionTargetLength,
        signal,
      })
      const result = await complete(lastPrompt)
      signal?.throwIfAborted()
      return result
    } catch (again) {
      signal?.throwIfAborted()
      lastError = again
    }
    const alt = await borrowRoute(lastError, fallback, onFallback)
    if (!alt) throw lastError
    const result = await complete(lastPrompt, alt)
    signal?.throwIfAborted()
    return result
  }
}

/**
 * 重发也不行、而错是**换一把 key 能过去的那类**时，借一条路。借不到就把原错原样交回。
 * ⚠ 这里只认 `isLlmTextRecoverableError`：安全拒答、余额不足、key 失效一律不借。
 */
async function borrowRoute(
  error: unknown,
  fallback: CompleteAssistantTextOptions['fallback'],
  onFallback: CompleteAssistantTextOptions['onFallback'],
): Promise<AssistantFallbackTextRoute | null> {
  if (!fallback || !isLlmTextRecoverableError(error)) return null
  const alt = await fallback()
  if (!alt) return null
  onFallback?.({ ...alt, error })
  return alt
}

/** provider 临时不可用时，同一请求等这么久再发一次。 */
const TRANSIENT_RETRY_DELAY_MS = 1_500

/**
 * 两类错误各值得**一次**重发，其余原样抛出：
 *  · 上下文超限 → 压缩历史后重发；
 *  · provider 临时不可用（503 / 529）→ 稍等后原样重发（2026-10-07 生产：
 *    Gemini 一次 503 就让整轮失败）。超时不在此列 —— 再等一轮只会翻倍等待。
 */
async function promptForRetry(
  error: unknown,
  {
    fullPrompt,
    buildUserPrompt,
    contextCompactionTargetLength,
    signal,
  }: {
    fullPrompt: string
    buildUserPrompt(maxLength?: number): string
    contextCompactionTargetLength: number
    signal?: AbortSignal
  },
): Promise<string> {
  if (isLlmTextTransientError(error)) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(signal.reason)
        },
        { once: true },
      )
    })
    return fullPrompt
  }
  if (!isLlmTextContextLimitError(error)) throw error
  const compactedPrompt = buildUserPrompt(contextCompactionTargetLength)
  if (compactedPrompt === fullPrompt) throw error
  signal?.throwIfAborted()
  return compactedPrompt
}

/**
 * 流式版，策略与上面那条一致：先发全量上下文，超限压缩 / 临时不可用稍等，各重发一次。
 *
 * ⚠ **已经吐出过字就绝不重试**（照搬画布 gateway 分支用真机换来的规则）：重试会把
 * 同一段开场白再流一遍，用户看到的是重复的半截话。
 */
export async function* streamAssistantTextWithContextRetry({
  systemPrompt,
  signal,
  buildUserPrompt,
  route,
  contextCompactionTargetLength,
  modelId,
  imageData,
  imageLabels,
  videoData,
  audioData,
  videoAnalysis,
  useGrounding,
  responseFormat,
  jsonSchema,
  callLog,
  fallback,
  onFallback,
}: CompleteAssistantTextOptions): AsyncIterable<string> {
  signal?.throwIfAborted()
  let attempt = 0
  async function* stream(
    userPrompt: string,
    on: AssistantFallbackTextRoute = { route, modelId },
  ): AsyncIterable<string> {
    const call = startCallLog(
      { callLog, route: on.route, modelId: on.modelId },
      ++attempt,
    )
    /** 没跑完也没抛 = 调用方提前收了这条流（⏹ / 时间预算掐断时就是这样）。 */
    let outcome: CallOutcome = 'closed'
    try {
      yield* llmTextStream({
        systemPrompt,
        signal,
        userPrompt,
        modelId: on.modelId,
        imageData,
        imageLabels,
        videoData,
        audioData,
        videoAnalysis,
        adapterType: on.route.adapterType,
        providerConfig: on.route.providerConfig,
        apiKey: on.route.apiKey,
        useGrounding,
        providerManagedOutput: true,
        promptGuardMaxLength: null,
        responseFormat,
        jsonSchema,
        onUsage: call.onUsage,
      })
      outcome = 'ok'
    } catch (error) {
      outcome = failureOutcome(signal)
      throw error
    } finally {
      call.finish(outcome === 'closed' && signal?.aborted ? 'aborted' : outcome)
    }
  }

  const fullPrompt = buildUserPrompt()
  let emittedText = false

  try {
    for await (const chunk of stream(fullPrompt)) {
      signal?.throwIfAborted()
      emittedText = true
      yield chunk
    }
    signal?.throwIfAborted()
    return
  } catch (error) {
    signal?.throwIfAborted()
    if (emittedText) throw error

    let lastError: unknown = error
    let lastPrompt = fullPrompt
    try {
      lastPrompt = await promptForRetry(error, {
        fullPrompt,
        buildUserPrompt,
        contextCompactionTargetLength,
        signal,
      })
      for await (const chunk of stream(lastPrompt)) {
        signal?.throwIfAborted()
        emittedText = true
        yield chunk
      }
      signal?.throwIfAborted()
      return
    } catch (again) {
      signal?.throwIfAborted()
      if (emittedText) throw again
      lastError = again
    }
    const alt = await borrowRoute(lastError, fallback, onFallback)
    if (!alt) throw lastError
    for await (const chunk of stream(lastPrompt, alt)) {
      signal?.throwIfAborted()
      yield chunk
    }
    signal?.throwIfAborted()
  }
}
