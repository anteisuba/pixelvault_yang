'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_ID_PREFIXES } from '@/constants/node-studio'
import {
  getAssistantConversationAPI,
  listAssistantConversationsAPI,
  streamNodeAssistantAPI,
  upsertAssistantConversationAPI,
} from '@/lib/api-client'
import { logger } from '@/lib/logger'
import { sanitizeNodeAssistantRequest } from '@/lib/node-assistant-request'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'
import type {
  NodeAssistantMessage,
  NodeAssistantMediaReference,
  NodeAssistantNodeContext,
  NodeAssistantRequest,
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

function stripNodeReferenceMarkers(content: string): string {
  return content
    .replace(/\[\[node:[^\]]+\]\]/g, '')
    .replace(/\[\[capability:(?:upscale|remove-background):[^\]]+\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

function toDisplayAssistantMessage(
  id: string,
  rawContent: string,
): AssistantConversationMessage {
  return {
    id,
    role: 'assistant',
    content: stripNodeReferenceMarkers(rawContent).trim(),
    references: extractNodeReferences(rawContent),
    capabilities: extractCapabilityReferences(rawContent),
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
      createdAt: new Date().toISOString(),
    }))
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
        references: context.references ?? [],
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
        setError(response.error)
        return
      }

      try {
        let finalAssistant: AssistantConversationMessage | null = null
        await readTextStream(response.stream, (rawContent) => {
          finalAssistant = toDisplayAssistantMessage(
            assistantMessageId,
            rawContent,
          )
          setMessages([...nextMessages, finalAssistant])
        })
        setIsLoading(false)

        const completed = finalAssistant
          ? [...nextMessages, finalAssistant]
          : nextMessages
        // Drop empty assistant shell if the stream produced no text.
        const completedWithoutEmpty =
          finalAssistant && finalAssistant.content.trim().length === 0
            ? nextMessages
            : completed
        const nextSessionId = await persistMessages(
          completedWithoutEmpty,
          sessionId,
        )
        if (nextSessionId) setSessionId(nextSessionId)
        if (finalAssistant && finalAssistant.content.trim().length === 0) {
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
    [isLoading, persistMessages, sessionId, t],
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
        references: context.references ?? [],
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
        setError(response.error)
        return
      }

      try {
        let finalAssistant: AssistantConversationMessage | null = null
        await readTextStream(response.stream, (rawContent) => {
          finalAssistant = toDisplayAssistantMessage(
            assistantMessageId,
            rawContent,
          )
          setMessages([...withoutTrailingAssistant, finalAssistant])
        })
        setIsLoading(false)
        const completed = finalAssistant
          ? [...withoutTrailingAssistant, finalAssistant]
          : withoutTrailingAssistant
        const completedWithoutEmpty =
          finalAssistant && finalAssistant.content.trim().length === 0
            ? withoutTrailingAssistant
            : completed
        const nextSessionId = await persistMessages(
          completedWithoutEmpty,
          sessionId,
        )
        if (nextSessionId) setSessionId(nextSessionId)
        if (finalAssistant && finalAssistant.content.trim().length === 0) {
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
    [persistMessages, sessionId, t],
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
