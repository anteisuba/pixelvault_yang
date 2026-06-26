'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_ID_PREFIXES } from '@/constants/node-studio'
import { streamNodeAssistantAPI } from '@/lib/api-client/node-assistant'
import type {
  NodeAssistantMessage,
  NodeAssistantNodeContext,
  NodeAssistantRequest,
} from '@/types/node-assistant'
import type { AppLocale } from '@/i18n/routing'

export interface AssistantNodeReference {
  nodeId: string
}

export interface AssistantConversationMessage {
  id: string
  role: NodeAssistantMessage['role']
  content: string
  references: AssistantNodeReference[]
}

export interface AssistantConversationContext {
  nodes: NodeAssistantNodeContext[]
  selectedNodeIds: string[]
  locale: AppLocale
  apiKeyId?: string
  /** Reference-research turn (study a film/anime/short → original suggestions). */
  research?: boolean
}

interface UseAssistantConversationValue {
  messages: AssistantConversationMessage[]
  isLoading: boolean
  error: string | null
  send(content: string, context: AssistantConversationContext): Promise<void>
  retry(context: AssistantConversationContext): Promise<void>
  clear(): void
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

function stripNodeReferenceMarkers(content: string): string {
  return content.replace(/\[\[node:[^\]]+\]\]/g, '').replace(/\n{3,}/g, '\n\n')
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

export function useAssistantConversation(): UseAssistantConversationValue {
  const t = useTranslations('StudioNode')
  const [messages, setMessages] = useState<AssistantConversationMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      }
      const assistantMessageId = createConversationMessageId('assistant')
      const priorMessages = messages
      const nextMessages = [...priorMessages, userMessage]

      setMessages([
        ...nextMessages,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          references: [],
        },
      ])
      setIsLoading(true)
      setError(null)

      const request: NodeAssistantRequest = {
        messages: nextMessages.map(toApiMessage),
        nodes: context.nodes,
        selectedNodeIds: context.selectedNodeIds,
        locale: context.locale,
        apiKeyId: context.apiKeyId,
        research: context.research,
      }

      const response = await streamNodeAssistantAPI(request)
      if (!response.success) {
        setMessages(nextMessages)
        setIsLoading(false)
        setError(response.error)
        return
      }

      try {
        await readTextStream(response.stream, (rawContent) => {
          const nextAssistantMessage = toDisplayAssistantMessage(
            assistantMessageId,
            rawContent,
          )

          setMessages([...nextMessages, nextAssistantMessage])
        })
        setIsLoading(false)
      } catch (caughtError) {
        setIsLoading(false)
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : t('assistant.streamFailed'),
        )
      }
    },
    [isLoading, messages, t],
  )

  const retry = useCallback(
    async (context: AssistantConversationContext) => {
      const lastUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === 'user')
      if (!lastUserMessage) {
        return
      }

      await send(lastUserMessage.content, context)
    },
    [messages, send],
  )

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
    setIsLoading(false)
  }, [])

  return {
    messages,
    isLoading,
    error,
    send,
    retry,
    clear,
  }
}
