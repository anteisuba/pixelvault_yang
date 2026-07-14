import type { AssistantConversationMessage } from '@/hooks/use-assistant-conversation'

export interface NodeAssistantHistorySession {
  id: string
  title: string
  updatedAt: string
  messages: AssistantConversationMessage[]
}

const STORAGE_PREFIX = 'pixelvault:node-assistant-sessions:v1:'
const MAX_SESSIONS = 30

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`
}

function safeParse(raw: string | null): NodeAssistantHistorySession[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is NodeAssistantHistorySession =>
      Boolean(
        item &&
        typeof item === 'object' &&
        typeof (item as NodeAssistantHistorySession).id === 'string' &&
        Array.isArray((item as NodeAssistantHistorySession).messages),
      ),
    )
  } catch {
    return []
  }
}

export function listNodeAssistantSessions(
  projectId: string,
): NodeAssistantHistorySession[] {
  if (typeof window === 'undefined' || !projectId) return []
  return safeParse(window.localStorage.getItem(storageKey(projectId))).sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  )
}

export function saveNodeAssistantSession(
  projectId: string,
  session: NodeAssistantHistorySession,
): void {
  if (typeof window === 'undefined' || !projectId) return
  const existing = listNodeAssistantSessions(projectId).filter(
    (item) => item.id !== session.id,
  )
  const next = [session, ...existing].slice(0, MAX_SESSIONS)
  window.localStorage.setItem(storageKey(projectId), JSON.stringify(next))
}

export function deleteNodeAssistantSession(
  projectId: string,
  sessionId: string,
): void {
  if (typeof window === 'undefined' || !projectId) return
  const next = listNodeAssistantSessions(projectId).filter(
    (item) => item.id !== sessionId,
  )
  window.localStorage.setItem(storageKey(projectId), JSON.stringify(next))
}

export function createNodeAssistantSessionId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
}

export function titleFromMessages(
  messages: AssistantConversationMessage[],
  fallback: string,
): string {
  const firstUser = messages.find((message) => message.role === 'user')
  const content = firstUser?.content?.trim()
  if (!content) return fallback
  return content.length > 36 ? `${content.slice(0, 36)}…` : content
}
