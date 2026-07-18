import 'server-only'

import {
  isLlmTextContextLimitError,
  llmTextCompletion,
  type LlmTextInput,
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
  useGrounding?: boolean
  /** Request strict JSON where the provider supports it (F1 结构化输出). */
  responseFormat?: LlmTextInput['responseFormat']
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
  useGrounding,
  responseFormat,
}: CompleteAssistantTextOptions): Promise<string> {
  const complete = (userPrompt: string) =>
    llmTextCompletion({
      systemPrompt,
      userPrompt,
      modelId,
      imageData,
      adapterType: route.adapterType,
      providerConfig: route.providerConfig,
      apiKey: route.apiKey,
      useGrounding,
      providerManagedOutput: true,
      promptGuardMaxLength: null,
      responseFormat,
    })

  const fullPrompt = buildUserPrompt()
  try {
    return await complete(fullPrompt)
  } catch (error) {
    if (!isLlmTextContextLimitError(error)) throw error

    const compactedPrompt = buildUserPrompt(contextCompactionTargetLength)
    if (compactedPrompt === fullPrompt) throw error
    return complete(compactedPrompt)
  }
}
