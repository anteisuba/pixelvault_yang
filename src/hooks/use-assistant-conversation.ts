'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ID_PREFIXES,
} from '@/constants/node-studio'
import {
  getAssistantConversationAPI,
  listAssistantConversationsAPI,
  streamNodeAssistantAPI,
  upsertAssistantConversationAPI,
} from '@/lib/api-client'
import { logger } from '@/lib/logger'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { extractNodeAssistantOps } from '@/lib/node-assistant-ops'
import { sanitizeNodeAssistantRequest } from '@/lib/node-assistant-request'
import type { NodeAssistantOpBatch } from '@/types/node-assistant-ops'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'
import type {
  NodeAssistantMessage,
  NodeAssistantMediaReference,
  NodeAssistantNodeContext,
} from '@/types/node-assistant'
import type { AppLocale } from '@/i18n/routing'

export interface AssistantNodeReference {
  nodeId: string
}

export interface AssistantCapabilityReference {
  capability: 'upscale' | 'remove-background'
  nodeId: string
}

export interface AssistantConversationMessage {
  id: string
  role: NodeAssistantMessage['role']
  content: string
  references: AssistantNodeReference[]
  capabilities: AssistantCapabilityReference[]
  /** Stable image/video URLs attached to this user turn. */
  mediaReferences?: NodeAssistantMediaReference[]
  /**
   * 包 5 画布改动提案。流式写到一半时为 null —— 载荷没闭合就不算提案。
   *
   * ⚠ 入库的是**剥干净的正文**，所以提案**不跨刷新存活**。这是有意的：一条几分
   * 钟前针对另一张图的提案，重新加载后再点「应用」只会做错事。
   */
  ops?: NodeAssistantOpBatch | null
  /** 出现了完整的提案块却读不出来 —— 明说，不装作什么都没发生。 */
  opsMalformed?: boolean
}

export interface AssistantConversationContext {
  nodes: NodeAssistantNodeContext[]
  selectedNodeIds: string[]
  references?: NodeAssistantMediaReference[]
  locale: AppLocale
  apiKeyId?: string
  /** Reference-research turn (study a film/anime/short → original suggestions). */
  research?: boolean
}

export interface UseAssistantConversationOptions {
  /** Node canvas project id — required for DB persistence. */
  projectId?: string | null
  /** When false, skip network persistence (tests / offline). Default true. */
  persist?: boolean
}

interface UseAssistantConversationValue {
  messages: AssistantConversationMessage[]
  isLoading: boolean
  isHydrating: boolean
  error: string | null
  sessionId: string | null
  sessions: AssistantConversationSummary[]
  send(content: string, context: AssistantConversationContext): Promise<void>
  retry(context: AssistantConversationContext): Promise<void>
  /** Start a new empty session (previous transcript stays in DB). */
  clear(): void
  /** Replace the in-memory transcript (history restore). */
  load(messages: AssistantConversationMessage[], sessionId?: string): void
  selectSession(sessionId: string): Promise<void>
  refreshSessions(): Promise<void>
}

let assistantMessageSequence = 0

function createConversationMessageId(role: NodeAssistantMessage['role']) {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) {
    return `${NODE_STUDIO_ID_PREFIXES.message}-${role}-${randomId}`
  }

  assistantMessageSequence += 1
  return `${NODE_STUDIO_ID_PREFIXES.message}-${role}-${Date.now()}-${assistantMessageSequence}`
}

function extractNodeReferences(content: string): AssistantNodeReference[] {
  const references: AssistantNodeReference[] = []
  const matches = content.matchAll(/\[\[node:([^\]\s]+)\]\]/g)

  for (const match of matches) {
    const nodeId = match[1]?.trim()
    if (
      !nodeId ||
      references.some((reference) => reference.nodeId === nodeId)
    ) {
      continue
    }
    references.push({ nodeId })
  }

  return references
}

function extractCapabilityReferences(
  content: string,
): AssistantCapabilityReference[] {
  const references: AssistantCapabilityReference[] = []
  const matches = content.matchAll(
    /\[\[capability:(upscale|remove-background):([^\]\s]+)\]\]/g,
  )
  for (const match of matches) {
    const capability = match[1] as AssistantCapabilityReference['capability']
    const nodeId = match[2]?.trim()
    if (
      !nodeId ||
      references.some(
        (reference) =>
          reference.nodeId === nodeId && reference.capability === capability,
      )
    ) {
      continue
    }
    references.push({ capability, nodeId })
  }
  return references
}

/**
 * 引用标记的字面头部（写到自由 id 之前为止）。
 *
 * ⚠ **剥标记的正则与「扣留半截标记」的判定都从这里生成**：两份规则各写一遍迟早
 * 分叉，而分叉的表现就是「某一种标记会漏出去」。同一条结论见
 * `assistant-marker-block.ts` 文件头第 4 条。
 */
const REFERENCE_MARKER_HEADS = [
  '[[node:',
  '[[capability:upscale:',
  '[[capability:remove-background:',
] as const

/** 写完的样子：头部 + 至少一个字符的 id + `]]`。 */
const COMPLETE_REFERENCE_MARKERS = REFERENCE_MARKER_HEADS.map(
  (head) =>
    new RegExp(
      `${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]+\\]\\]`,
      'g',
    ),
)

/**
 * 尾巴上那截「还可能长成引用标记」的字符有多长 —— 与
 * `assistant-marker-block.ts` 的 `partialOpenMarkerLength` 是同一件事，只是这里的
 * 标记自带载荷（`:id]]`），所以头部写完之后还要继续扣着 id 那一段。
 *
 * ⚠ **只判尾巴**：流式文本只会从末尾长，中间的 `[[` 要么早就凑成了完整标记（上一
 * 步已经剥掉）、要么这辈子都凑不成。判定得出来立刻放行 —— 正文里的 `[1]`、
 * markdown 链接不会被永久吃掉，也不会被推迟到流结束才一次性蹦出来。
 */
function partialReferenceMarkerLength(value: string): number {
  let held = 0

  for (const head of REFERENCE_MARKER_HEADS) {
    // 头部还没写完：`[`、`[[`、`[[n`…`[[node:`
    for (let taken = 1; taken <= head.length; taken += 1) {
      if (taken > held && value.endsWith(head.slice(0, taken))) held = taken
    }

    // 头部写完了，正在写 id：`[[node:abc`，或只差最后一个方括号的 `[[node:abc]`
    const openIndex = value.lastIndexOf(head)
    if (openIndex < 0) continue
    const pending = value.length - openIndex
    if (
      pending > held &&
      /^[^\]]*\]?$/.test(value.slice(openIndex + head.length))
    ) {
      held = pending
    }
  }

  return held
}

function stripNodeReferenceMarkers(
  content: string,
  /**
   * 流已经结束（不会再有 chunk 了）。没结束前，尾巴上写到一半的标记不外显 ——
   * 这个函数每来一个 chunk 就整段重跑一次，只剥「写完的」标记会让 `[[node`、
   * `[[capabilit` 这种半截标记原样渲染出去，用户看着裸标记蹦出来又消失。
   * ⛔ 别改成「等流结束再显示全部」：那会毁掉打字机，而打字机正是「传输与呈现
   * 解耦」这条结论的落点（见 `lib/assistant-typewriter.ts`）。
   */
  streamComplete: boolean,
): string {
  const stripped = COMPLETE_REFERENCE_MARKERS.reduce(
    (value, pattern) => value.replace(pattern, ''),
    content,
  )
  const visible = streamComplete
    ? stripped
    : stripped.slice(
        0,
        stripped.length - partialReferenceMarkerLength(stripped),
      )

  return visible.replace(/\n{3,}/g, '\n\n')
}

function toDisplayAssistantMessage(
  id: string,
  rawContent: string,
  /**
   * 流结束后必须再构造一次，并把这个置真 —— 否则「载荷写完了但闭合标记写歪了」
   * 会被当成「还在写」永远藏着，用户看到一句开场白然后什么都没有。真机踩过。
   */
  streamComplete = false,
): AssistantConversationMessage {
  // op 块先摘掉再剥引用标记：前者是整段 JSON，留到后面会被 `\n{3,}` 那类正文
  // 规整规则啃掉一部分，变成读不出来的载荷。
  const ops = extractNodeAssistantOps(rawContent, { streamComplete })
  return {
    id,
    role: 'assistant',
    content: stripNodeReferenceMarkers(ops.content, streamComplete).trim(),
    references: extractNodeReferences(rawContent),
    capabilities: extractCapabilityReferences(rawContent),
    ops: ops.batch,
    opsMalformed: ops.malformed,
  }
}

function toApiMessage(
  message: AssistantConversationMessage,
): NodeAssistantMessage {
  return {
    role: message.role,
    content: message.content,
  }
}

function toStoredMessages(messages: AssistantConversationMessage[]) {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      ...(message.mediaReferences?.length
        ? { mediaReferences: message.mediaReferences }
        : {}),
      createdAt: new Date().toISOString(),
    }))
}

function collectConversationMediaReferences(
  messages: AssistantConversationMessage[],
  current: NodeAssistantMediaReference[],
): NodeAssistantMediaReference[] {
  const unique = new Map<string, NodeAssistantMediaReference>()
  const candidates = [
    ...current,
    ...messages
      .slice()
      .reverse()
      .flatMap((message) => message.mediaReferences ?? []),
  ]

  for (const reference of candidates) {
    if (!unique.has(reference.url)) unique.set(reference.url, reference)
    if (unique.size >= NODE_STUDIO_ASSISTANT_LIMITS.maxReferences) break
  }

  return [...unique.values()]
}

async function readTextStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (nextText: string) => void,
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      output += decoder.decode(value, { stream: true })
      onChunk(output)
    }

    output += decoder.decode()
    onChunk(output)
    return output
  } finally {
    reader.releaseLock()
  }
}

export function useAssistantConversation(
  options: UseAssistantConversationOptions = {},
): UseAssistantConversationValue {
  const { projectId = null, persist = true } = options
  const t = useTranslations('StudioNode')
  const tErrors = useTranslations('Errors')
  const [messages, setMessages] = useState<AssistantConversationMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isHydrating, setIsHydrating] = useState(Boolean(persist && projectId))
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AssistantConversationSummary[]>([])
  const messagesRef = useRef<AssistantConversationMessage[]>([])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const refreshSessions = useCallback(async () => {
    if (!persist || !projectId) {
      setSessions([])
      return
    }
    const result = await listAssistantConversationsAPI({
      surface: 'NODE_CANVAS',
      projectId,
      limit: 30,
    })
    if (result.success) {
      setSessions(result.data)
    }
  }, [persist, projectId])

  // Hydrate latest conversation when project changes.
  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      if (!persist || !projectId) {
        setMessages([])
        setSessionId(null)
        setSessions([])
        setIsHydrating(false)
        return
      }

      setIsHydrating(true)
      setError(null)

      const [latest, list] = await Promise.all([
        getAssistantConversationAPI({
          surface: 'NODE_CANVAS',
          projectId,
        }),
        listAssistantConversationsAPI({
          surface: 'NODE_CANVAS',
          projectId,
          limit: 30,
        }),
      ])

      if (cancelled) return

      if (list.success) {
        setSessions(list.data)
      }

      if (latest.success && latest.data) {
        setSessionId(latest.data.id)
        setMessages(
          latest.data.messages.map((message) => ({
            id: message.id ?? createConversationMessageId(message.role),
            role: message.role,
            content: message.content,
            mediaReferences: message.mediaReferences ?? [],
            references:
              message.role === 'assistant'
                ? extractNodeReferences(message.content)
                : [],
            capabilities:
              message.role === 'assistant'
                ? extractCapabilityReferences(message.content)
                : [],
          })),
        )
      } else {
        setSessionId(null)
        setMessages([])
      }
      setIsHydrating(false)
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [persist, projectId])

  const persistMessages = useCallback(
    async (nextMessages: AssistantConversationMessage[], id: string | null) => {
      if (!persist || !projectId) return id
      const stored = toStoredMessages(nextMessages)
      if (stored.length === 0) return id

      const result = await upsertAssistantConversationAPI({
        ...(id ? { id } : {}),
        surface: 'NODE_CANVAS',
        projectId,
        messages: stored,
      })
      if (!result.success) {
        logger.warn('[assistant-conversation] persist failed', {
          error: result.error,
        })
        return id
      }
      void refreshSessions()
      return result.data.id
    },
    [persist, projectId, refreshSessions],
  )

  const send = useCallback(
    async (content: string, context: AssistantConversationContext) => {
      const trimmedContent = content.trim()
      if (!trimmedContent || isLoading) {
        return
      }

      const userMessage: AssistantConversationMessage = {
        id: createConversationMessageId('user'),
        role: 'user',
        content: trimmedContent,
        references: [],
        capabilities: [],
        mediaReferences: (context.references ?? []).slice(
          0,
          NODE_STUDIO_ASSISTANT_LIMITS.maxReferences,
        ),
      }
      const assistantMessageId = createConversationMessageId('assistant')
      const priorMessages = messagesRef.current
      const nextMessages = [...priorMessages, userMessage]

      setMessages([
        ...nextMessages,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          references: [],
          capabilities: [],
        },
      ])
      setIsLoading(true)
      setError(null)

      const request = sanitizeNodeAssistantRequest({
        messages: nextMessages.map(toApiMessage),
        nodes: context.nodes,
        selectedNodeIds: context.selectedNodeIds,
        references: collectConversationMediaReferences(
          nextMessages,
          context.references ?? [],
        ),
        locale: context.locale,
        apiKeyId: context.apiKeyId,
        research: context.research,
      })

      if (request.messages.length === 0) {
        setMessages(priorMessages)
        setIsLoading(false)
        setError(t('assistant.streamFailed'))
        return
      }

      const response = await streamNodeAssistantAPI(request)
      if (!response.success) {
        setMessages(nextMessages)
        setIsLoading(false)
        setError(
          getApiErrorMessage(tErrors, response, t('assistant.streamFailed')),
        )
        return
      }

      try {
        // Object holder so TS tracks callback mutations across the await.
        const streamState: { message: AssistantConversationMessage | null } = {
          message: null,
        }
        const finalRawContent = await readTextStream(
          response.stream,
          (rawContent) => {
            streamState.message = toDisplayAssistantMessage(
              assistantMessageId,
              rawContent,
            )
            setMessages([...nextMessages, streamState.message])
          },
        )
        setIsLoading(false)

        // 流结束后重建一次：这一次抽取知道「不会再有 chunk 了」，才敢对没闭合的
        // 载荷下判断（读出来 or 报错），而不是继续藏着。
        streamState.message = toDisplayAssistantMessage(
          assistantMessageId,
          finalRawContent,
          true,
        )
        setMessages([...nextMessages, streamState.message])

        const finalAssistant = streamState.message
        // Drop empty assistant shell if the stream produced no text.
        const completedWithoutEmpty =
          finalAssistant && finalAssistant.content.trim().length > 0
            ? [...nextMessages, finalAssistant]
            : nextMessages
        const nextSessionId = await persistMessages(
          completedWithoutEmpty,
          sessionId,
        )
        if (nextSessionId) setSessionId(nextSessionId)
        if (!finalAssistant || finalAssistant.content.trim().length === 0) {
          setMessages(nextMessages)
          setError(t('assistant.streamFailed'))
        }
      } catch (caughtError) {
        setIsLoading(false)
        setMessages(nextMessages)
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : t('assistant.streamFailed'),
        )
      }
    },
    [isLoading, persistMessages, sessionId, t, tErrors],
  )

  const retry = useCallback(
    async (context: AssistantConversationContext) => {
      // Drop the last assistant turn (empty or failed) and re-send without
      // duplicating the last user message.
      const current = messagesRef.current
      const lastUserIndex = [...current]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(({ message }) => message.role === 'user')?.index
      if (lastUserIndex === undefined) return

      const withoutTrailingAssistant = current.slice(0, lastUserIndex + 1)
      setMessages(withoutTrailingAssistant)
      messagesRef.current = withoutTrailingAssistant

      // Call stream path without re-appending the user message.
      const assistantMessageId = createConversationMessageId('assistant')
      setMessages([
        ...withoutTrailingAssistant,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          references: [],
          capabilities: [],
        },
      ])
      setIsLoading(true)
      setError(null)

      const request = sanitizeNodeAssistantRequest({
        messages: withoutTrailingAssistant.map(toApiMessage),
        nodes: context.nodes,
        selectedNodeIds: context.selectedNodeIds,
        references: collectConversationMediaReferences(
          withoutTrailingAssistant,
          context.references ?? [],
        ),
        locale: context.locale,
        apiKeyId: context.apiKeyId,
        research: context.research,
      })

      if (request.messages.length === 0) {
        setMessages(withoutTrailingAssistant)
        setIsLoading(false)
        setError(t('assistant.streamFailed'))
        return
      }

      const response = await streamNodeAssistantAPI(request)
      if (!response.success) {
        setMessages(withoutTrailingAssistant)
        setIsLoading(false)
        setError(
          getApiErrorMessage(tErrors, response, t('assistant.streamFailed')),
        )
        return
      }

      try {
        const streamState: { message: AssistantConversationMessage | null } = {
          message: null,
        }
        const finalRawContent = await readTextStream(
          response.stream,
          (rawContent) => {
            streamState.message = toDisplayAssistantMessage(
              assistantMessageId,
              rawContent,
            )
            setMessages([...withoutTrailingAssistant, streamState.message])
          },
        )
        setIsLoading(false)
        // 同 send：结束后再构造一次，让抽取能对没闭合的载荷下判断。
        streamState.message = toDisplayAssistantMessage(
          assistantMessageId,
          finalRawContent,
          true,
        )
        setMessages([...withoutTrailingAssistant, streamState.message])
        const finalAssistant = streamState.message
        const completedWithoutEmpty =
          finalAssistant && finalAssistant.content.trim().length > 0
            ? [...withoutTrailingAssistant, finalAssistant]
            : withoutTrailingAssistant
        const nextSessionId = await persistMessages(
          completedWithoutEmpty,
          sessionId,
        )
        if (nextSessionId) setSessionId(nextSessionId)
        if (!finalAssistant || finalAssistant.content.trim().length === 0) {
          setMessages(withoutTrailingAssistant)
          setError(t('assistant.streamFailed'))
        }
      } catch (caughtError) {
        setIsLoading(false)
        setMessages(withoutTrailingAssistant)
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : t('assistant.streamFailed'),
        )
      }
    },
    [persistMessages, sessionId, t, tErrors],
  )

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
    setIsLoading(false)
    // New session id is allocated on next successful persist.
    setSessionId(null)
  }, [])

  const load = useCallback(
    (nextMessages: AssistantConversationMessage[], nextSessionId?: string) => {
      setMessages(nextMessages)
      setError(null)
      setIsLoading(false)
      if (nextSessionId !== undefined) {
        setSessionId(nextSessionId)
      }
    },
    [],
  )

  const selectSession = useCallback(
    async (id: string) => {
      if (!persist) return
      const result = await getAssistantConversationAPI({
        surface: 'NODE_CANVAS',
        id,
        projectId: projectId ?? undefined,
      })
      if (!result.success || !result.data) {
        setError(result.success === false ? result.error : 'Not found')
        return
      }
      setSessionId(result.data.id)
      setMessages(
        result.data.messages.map((message) => ({
          id: message.id ?? createConversationMessageId(message.role),
          role: message.role,
          content: message.content,
          mediaReferences: message.mediaReferences ?? [],
          references:
            message.role === 'assistant'
              ? extractNodeReferences(message.content)
              : [],
          capabilities:
            message.role === 'assistant'
              ? extractCapabilityReferences(message.content)
              : [],
        })),
      )
    },
    [persist, projectId],
  )

  return {
    messages,
    isLoading,
    isHydrating,
    error,
    sessionId,
    sessions,
    send,
    retry,
    clear,
    load,
    selectSession,
    refreshSessions,
  }
}
