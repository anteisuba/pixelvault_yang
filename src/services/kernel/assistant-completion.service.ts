import 'server-only'

import {
  isLlmTextContextLimitError,
  llmTextCompletion,
  llmTextStream,
  llmTextToolCall,
  type LlmTextInput,
  type LlmToolCallResult,
  type LlmToolDefinition,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'

interface AssistantConversationEntry {
  role: 'user' | 'assistant'
  content: string
}

interface CompleteAssistantTextOptions {
  systemPrompt: string
  buildUserPrompt(maxLength?: number): string
  route: ResolvedLlmTextRoute
  contextCompactionTargetLength: number
  modelId?: string
  imageData?: LlmTextInput['imageData']
  videoData?: LlmTextInput['videoData']
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
  /**
   * 调用方的取消信号，原样转给 `LlmTextInput.signal`——在飞的 provider 请求跟着停。
   *
   * ⚠ 取消**不走**压缩重试：signal 已触发时不管上游报的是什么错都直接抛。
   * 用户已经离开了，再发一次压缩过的请求只是白花一次 provider 调用。
   */
  signal?: AbortSignal
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

interface ContextRetryPrompt {
  build(maxLength?: number): string
  compactionTargetLength: number
  /**
   * 调用方的取消信号。⚠ 只参与**重试判定**（已取消就直接抛，见下），真正把请求
   * 打断的是它一路转发到 `LlmTextInput.signal` 的那一份。
   */
  signal?: AbortSignal
}

/**
 * 上下文压缩重试的**策略本身**，与「这一跳去 provider 要什么」无关。
 *
 * 先发全量上下文；**只有** provider 明确报输入超限才压缩重试一次；压出来的串跟
 * 原串一样（压不动）就把原错抛出去 —— 再发一次一模一样的请求只是多花一次钱。
 *
 * ⚠ 泛型在 `T` 上：文本补全要一段 string，原生工具路要一条 `LlmToolCallResult`，
 * 但**重试的判据是同一条**。两条各写一份的下场很具体 —— 修了一处超限判定，另一
 * 条路上的那份还留着旧行为，而它们看起来完全一样。
 */
async function withContextRetry<T>(
  buildPrompt: ContextRetryPrompt,
  call: (userPrompt: string) => Promise<T>,
): Promise<T> {
  const fullPrompt = buildPrompt.build()
  try {
    return await call(fullPrompt)
  } catch (error) {
    // 取消**不走**压缩重试：用户已经走了，再发一次只是白花一次 provider 调用。
    if (buildPrompt.signal?.aborted || !isLlmTextContextLimitError(error)) {
      throw error
    }

    const compactedPrompt = buildPrompt.build(
      buildPrompt.compactionTargetLength,
    )
    if (compactedPrompt === fullPrompt) throw error
    return call(compactedPrompt)
  }
}

/**
 * Shared non-streaming assistant completion policy.
 *
 * The selected provider owns input/output ceilings. PixelVault sends the full
 * sanitized context first and performs exactly one compacted retry only when
 * the provider explicitly reports an input-context overflow.
 */
export async function completeAssistantTextWithContextRetry({
  systemPrompt,
  buildUserPrompt,
  route,
  contextCompactionTargetLength,
  modelId,
  imageData,
  videoData,
  videoAnalysis,
  useGrounding,
  responseFormat,
  signal,
}: CompleteAssistantTextOptions): Promise<string> {
  return withContextRetry(
    {
      build: buildUserPrompt,
      compactionTargetLength: contextCompactionTargetLength,
      signal,
    },
    (userPrompt) =>
      llmTextCompletion({
        systemPrompt,
        userPrompt,
        modelId,
        imageData,
        videoData,
        videoAnalysis,
        adapterType: route.adapterType,
        providerConfig: route.providerConfig,
        apiKey: route.apiKey,
        useGrounding,
        providerManagedOutput: true,
        promptGuardMaxLength: null,
        responseFormat,
        signal,
      }),
  )
}

export interface RequestToolCallOptions extends Omit<
  CompleteAssistantTextOptions,
  'responseFormat'
> {
  /** 这一轮模型能选的工具。⛔ `parameters` 从 zod 生成，别手抄。 */
  tools: LlmToolDefinition[]
}

/**
 * 原生工具调用的那一跳，与文本补全共用同一条压缩重试策略。
 *
 * ⛔ 这里**不收 `responseFormat`**：强制 JSON 输出与原生工具调用互斥（见
 * `buildOpenAiChatRequest` 里那段头注）。让调用方能传，等于给它一条能把快路悄悄
 * 变回慢路的开关。
 */
export async function requestToolCallWithContextRetry({
  systemPrompt,
  buildUserPrompt,
  route,
  contextCompactionTargetLength,
  modelId,
  imageData,
  videoData,
  videoAnalysis,
  useGrounding,
  tools,
  signal,
}: RequestToolCallOptions): Promise<LlmToolCallResult> {
  return withContextRetry(
    {
      build: buildUserPrompt,
      compactionTargetLength: contextCompactionTargetLength,
      signal,
    },
    (userPrompt) =>
      llmTextToolCall({
        systemPrompt,
        userPrompt,
        modelId,
        imageData,
        videoData,
        videoAnalysis,
        adapterType: route.adapterType,
        providerConfig: route.providerConfig,
        apiKey: route.apiKey,
        useGrounding,
        providerManagedOutput: true,
        promptGuardMaxLength: null,
        tools,
        // 合并时必做 ①：取消信号与文本补全走同一条并联器（`combineAbortSignals`），
        // 快路不能是唯一一条「用户点了停还在烧 provider 调用」的路。
        signal,
      }),
  )
}

/**
 * 流式版，策略与上面那条一致：先发全量上下文，**只有** provider 明确报输入超限
 * 才压缩重试一次。
 *
 * ⚠ **已经吐出过字就绝不重试**（照搬画布 gateway 分支用真机换来的规则）：重试会把
 * 同一段开场白再流一遍，用户看到的是重复的半截话。超上下文这种错必然发生在任何
 * 可见输出之前，所以「吐过字」等价于「这个错不是超上下文」，直接抛。
 *
 * 取消同理：signal 已触发就直接抛，不重试（见 `CompleteAssistantTextOptions.signal`）。
 */
export async function* streamAssistantTextWithContextRetry({
  systemPrompt,
  buildUserPrompt,
  route,
  contextCompactionTargetLength,
  modelId,
  imageData,
  videoData,
  videoAnalysis,
  useGrounding,
  responseFormat,
  signal,
}: CompleteAssistantTextOptions): AsyncIterable<string> {
  const stream = (userPrompt: string) =>
    llmTextStream({
      systemPrompt,
      userPrompt,
      modelId,
      imageData,
      videoData,
      videoAnalysis,
      adapterType: route.adapterType,
      providerConfig: route.providerConfig,
      apiKey: route.apiKey,
      useGrounding,
      providerManagedOutput: true,
      promptGuardMaxLength: null,
      responseFormat,
      signal,
    })

  const fullPrompt = buildUserPrompt()
  let emittedText = false

  try {
    for await (const chunk of stream(fullPrompt)) {
      emittedText = true
      yield chunk
    }
    return
  } catch (error) {
    if (emittedText || signal?.aborted || !isLlmTextContextLimitError(error)) {
      throw error
    }

    const compactedPrompt = buildUserPrompt(contextCompactionTargetLength)
    if (compactedPrompt === fullPrompt) throw error
    yield* stream(compactedPrompt)
  }
}
