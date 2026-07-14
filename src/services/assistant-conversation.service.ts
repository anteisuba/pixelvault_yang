import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import type { AssistantSurface, Prisma } from '@/lib/generated/prisma/client'

import { db } from '@/lib/db'
import { ensureUser } from '@/services/user.service'
import {
  ASSISTANT_CONVERSATION_LIMITS,
  AssistantConversationMessageSchema,
  type AssistantConversationMessageStored,
  type AssistantConversationRecord,
  type AssistantConversationSummary,
  type AssistantConversationShare,
  type AssistantSurfaceId,
  type SharedAssistantConversationRecord,
  type UpsertAssistantConversationRequest,
} from '@/types/assistant-conversation'

const ASSISTANT_SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000

function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function titleFromMessages(
  messages: AssistantConversationMessageStored[],
): string | null {
  const firstUser = messages.find((message) => message.role === 'user')
  const content = firstUser?.content?.trim()
  if (!content) return null
  if (content.length <= ASSISTANT_CONVERSATION_LIMITS.titleMaxLength) {
    return content
  }
  return `${content.slice(0, ASSISTANT_CONVERSATION_LIMITS.titleMaxLength - 1)}…`
}

function sanitizeMessages(
  messages: AssistantConversationMessageStored[],
): AssistantConversationMessageStored[] {
  return messages
    .map((message) => {
      const parsed = AssistantConversationMessageSchema.safeParse(message)
      if (!parsed.success) return null
      // Strip accidental data-url / base64 bodies from persistence.
      if (parsed.data.content.startsWith('data:')) return null
      return parsed.data
    })
    .filter((message): message is AssistantConversationMessageStored =>
      Boolean(message),
    )
    .slice(-ASSISTANT_CONVERSATION_LIMITS.maxMessages)
}

function toRecord(row: {
  id: string
  surface: AssistantSurface
  projectId: string | null
  title: string | null
  messages: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}): AssistantConversationRecord {
  const messages = Array.isArray(row.messages)
    ? sanitizeMessages(row.messages as AssistantConversationMessageStored[])
    : []

  return {
    id: row.id,
    surface: row.surface as AssistantSurfaceId,
    projectId: row.projectId,
    title: row.title,
    messages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function upsertAssistantConversation(
  clerkId: string,
  input: UpsertAssistantConversationRequest,
): Promise<AssistantConversationRecord> {
  const user = await ensureUser(clerkId)
  const messages = sanitizeMessages(input.messages)
  const title = titleFromMessages(messages)
  const projectId =
    input.surface === 'NODE_CANVAS' ? (input.projectId ?? null) : null

  if (input.id) {
    const existing = await db.assistantConversation.findFirst({
      where: { id: input.id, userId: user.id },
    })
    if (!existing) {
      throw new Error('ASSISTANT_CONVERSATION_NOT_FOUND')
    }

    const updated = await db.assistantConversation.update({
      where: { id: existing.id },
      data: {
        messages: messages as unknown as Prisma.InputJsonValue,
        title,
        projectId,
        surface: input.surface,
      },
    })
    return toRecord(updated)
  }

  const created = await db.assistantConversation.create({
    data: {
      userId: user.id,
      surface: input.surface,
      projectId,
      title,
      messages: messages as unknown as Prisma.InputJsonValue,
    },
  })
  return toRecord(created)
}

export async function listAssistantConversations(
  clerkId: string,
  args: {
    surface: AssistantSurfaceId
    projectId?: string
    limit?: number
  },
): Promise<AssistantConversationSummary[]> {
  const user = await ensureUser(clerkId)
  const limit = args.limit ?? 20

  const rows = await db.assistantConversation.findMany({
    where: {
      userId: user.id,
      surface: args.surface,
      ...(args.surface === 'NODE_CANVAS' && args.projectId
        ? { projectId: args.projectId }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      surface: true,
      projectId: true,
      title: true,
      updatedAt: true,
      messages: true,
    },
  })

  return rows.map((row) => {
    const messages = Array.isArray(row.messages) ? row.messages : []
    return {
      id: row.id,
      surface: row.surface as AssistantSurfaceId,
      projectId: row.projectId,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      messageCount: messages.length,
    }
  })
}

export async function getAssistantConversation(
  clerkId: string,
  args: {
    id?: string
    surface?: AssistantSurfaceId
    projectId?: string
  },
): Promise<AssistantConversationRecord | null> {
  const user = await ensureUser(clerkId)

  if (args.id) {
    const row = await db.assistantConversation.findFirst({
      where: { id: args.id, userId: user.id },
    })
    return row ? toRecord(row) : null
  }

  if (!args.surface) return null

  const row = await db.assistantConversation.findFirst({
    where: {
      userId: user.id,
      surface: args.surface,
      ...(args.surface === 'NODE_CANVAS' && args.projectId
        ? { projectId: args.projectId }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
  })
  return row ? toRecord(row) : null
}

export async function createAssistantConversationShare(
  clerkId: string,
  conversationId: string,
): Promise<AssistantConversationShare> {
  const user = await ensureUser(clerkId)
  const conversation = await db.assistantConversation.findFirst({
    where: { id: conversationId, userId: user.id },
    select: { id: true },
  })
  if (!conversation) throw new Error('ASSISTANT_CONVERSATION_NOT_FOUND')

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ASSISTANT_SHARE_TTL_MS)

  await db.assistantConversationShare.updateMany({
    where: { conversationId: conversation.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  await db.assistantConversationShare.create({
    data: {
      conversationId: conversation.id,
      tokenHash: hashShareToken(token),
      expiresAt,
    },
  })

  return { token, expiresAt: expiresAt.toISOString() }
}

export async function getSharedAssistantConversation(
  token: string,
): Promise<SharedAssistantConversationRecord | null> {
  const share = await db.assistantConversationShare.findUnique({
    where: { tokenHash: hashShareToken(token) },
    include: { conversation: true },
  })
  if (
    !share ||
    share.revokedAt ||
    !share.expiresAt ||
    share.expiresAt <= new Date()
  ) {
    return null
  }

  const record = toRecord(share.conversation)
  return {
    id: record.id,
    surface: record.surface,
    title: record.title,
    messages: record.messages,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
