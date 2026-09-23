import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { Prisma, type AssistantSurface } from '@/lib/generated/prisma/client'

import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'
import { db } from '@/lib/db'
import { ensureUser } from '@/services/user.service'
import { ASSISTANT_ROUND_SUMMARY_LIMITS } from '@/constants/assistant-operator'
import { logger } from '@/lib/logger'
import {
  ASSISTANT_CONVERSATION_LIMITS,
  ASSISTANT_SURFACE_IDS,
  AssistantConversationMessageSchema,
  AssistantConversationRoundSchema,
  type AssistantConversationRoundStored,
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

/**
 * 新建会话时派生的那个标题。
 *
 * ⚠ 规则整条住在 `lib/assistant-conversation-title.ts`（owner 2026-09-20 真机
 * 第 4 条）：先剥参考图提及、再取首句、最后按视觉宽度封顶。⛔ 这里不再自己
 * 按 `titleMaxLength` 切 —— 那一版把「@图1 @图2 @图3 这几张图的画风…」原样存了
 * 进去。⚠ 面板那两处（头部胶囊 · 历史行）渲染时走的是**同一个函数**，所以
 * 存量行不需要迁移。
 */
function titleFromMessages(
  messages: AssistantConversationMessageStored[],
): string | null {
  const firstUser = messages.find((message) => message.role === 'user')
  return deriveAssistantConversationTitle(firstUser?.content)
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

/**
 * 结论记录那一列（§7.2）。
 *
 * ⚠ **逐条 safeParse，坏的那条丢掉**，⛔ 不整列作废 —— 判据与消息上的 `operator`
 * 那一格逐字同源：少一条结账记录是小事，整段会话读不出来是大事。
 * ⚠ 只留最近 `maxRoundsPerConversation` 条：更旧的那些没有任何读者（注入只带
 * 最近 8 轮，§7.6），留着只会让每次读写会话都拖着它们走。
 */
function sanitizeRounds(rounds: unknown): AssistantConversationRoundStored[] {
  if (!Array.isArray(rounds)) return []
  return rounds
    .map((round) => {
      const parsed = AssistantConversationRoundSchema.safeParse(round)
      return parsed.success ? parsed.data : null
    })
    .filter((round): round is AssistantConversationRoundStored =>
      Boolean(round),
    )
    .slice(-ASSISTANT_ROUND_SUMMARY_LIMITS.maxRoundsPerConversation)
}

function toRecord(row: {
  id: string
  surface: AssistantSurface
  projectId: string | null
  title: string | null
  messages: Prisma.JsonValue
  rounds?: Prisma.JsonValue
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
    rounds: sanitizeRounds(row.rounds),
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
    input.surface === ASSISTANT_SURFACE_IDS.nodeCanvas
      ? (input.projectId ?? null)
      : null

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
    operatorOnly?: boolean
    limit?: number
  },
): Promise<AssistantConversationSummary[]> {
  const user = await ensureUser(clerkId)
  const limit = args.limit ?? 20

  /**
   * ⚠ 工作台的操作员线程三个域合并成一个列表；画布**单独、按项目分**（D12 U7），
   * ⛔ 不并进工作台那一份。
   */
  const canvas = args.surface === ASSISTANT_SURFACE_IDS.nodeCanvas
  const surfaces =
    args.operatorOnly && !canvas
      ? [
          ASSISTANT_SURFACE_IDS.imageStudio,
          ASSISTANT_SURFACE_IDS.videoStudio,
          ASSISTANT_SURFACE_IDS.lora,
        ]
      : [args.surface]
  const operatorPayload = Prisma.sql`COALESCE("messages"->0->'operator' <> 'null'::jsonb, false)`
  const rows = await db.$queryRaw<
    (Omit<AssistantConversationSummary, 'updatedAt'> & { updatedAt: Date })[]
  >(Prisma.sql`
    SELECT "id", "surface", "projectId", "title", "updatedAt",
      CASE WHEN jsonb_typeof("messages") = 'array' THEN jsonb_array_length("messages") ELSE 0 END AS "messageCount",
      ${operatorPayload} AS "operatorThread"
    FROM "AssistantConversation"
    WHERE "userId" = ${user.id}
      AND "surface" IN (${Prisma.join(surfaces.map((surface) => Prisma.sql`${surface}::"AssistantSurface"`))})
      ${canvas && args.projectId ? Prisma.sql`AND "projectId" = ${args.projectId}` : Prisma.empty}
      ${args.operatorOnly ? Prisma.sql`AND ${operatorPayload}` : Prisma.empty}
    ORDER BY "updatedAt" DESC
    LIMIT ${limit}
  `)
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
}

export async function deleteAssistantConversation(
  clerkId: string,
  id: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const result = await db.assistantConversation.deleteMany({
    where: { id, userId: user.id },
  })
  return result.count > 0
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
      ...(args.surface === ASSISTANT_SURFACE_IDS.nodeCanvas && args.projectId
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

export async function renameAssistantConversation(
  clerkId: string,
  id: string,
  input: { title: string },
): Promise<{ title: string } | null> {
  const user = await ensureUser(clerkId)
  const result = await db.assistantConversation.updateMany({
    where: { id, userId: user.id },
    data: { title: input.title },
  })
  return result.count > 0 ? { title: input.title } : null
}

/**
 * **每轮结账**把一条结论记录追加进这段会话（v2 §7.2 / §7.5）。
 *
 * ⭐ 这是服务端**唯一**一条往会话里写非消息内容的路，owner 2026-09-09 定：
 * 「服务端零会话态」管的是**运行中的一轮不许留痕**（打断即转向的前提），
 * 而结账是一轮**已经结束**之后写下的事实 —— 两件事不冲突。
 *
 * ⚠ 三条纪律：
 *  ① **所有权服务端核**：`userId` 不匹配就当没这段会话（返回 null），
 *     ⛔ 不抛错 —— 调用方是流里的收尾那一步，抛错会把 `done` 一起带走。
 *  ② **`roundIndex` 由服务端定**（追加位置就是它），⛔ 不收客户端给的号：
 *     两个客户端并发时收上来的号会撞。
 *  ③ **一轮只写一条**：一轮里被问题卡停过几次都不算新的一轮。⚠ 结账不只发生在
 *     `done` 那一刻 —— **以卡结束的轮次在 `stopped` 之前也结账**（a1563804，
 *     §7.5 第 5 条）：用户点完确认卡 / 问题卡 / 上下文卡不再新开一轮，不结账
 *     那一轮在时间线上就没有结论块。调用方负责一轮只调一次。
 *
 * @returns 写下去的那条（带服务端定的 `roundIndex`）；会话不存在 / 不归他时 null。
 */
export async function appendAssistantConversationRound(
  clerkId: string,
  conversationId: string,
  round: Omit<AssistantConversationRoundStored, 'roundIndex'>,
): Promise<AssistantConversationRoundStored | null> {
  const user = await ensureUser(clerkId)
  const existing = await db.assistantConversation.findFirst({
    where: { id: conversationId, userId: user.id },
    select: { id: true, rounds: true },
  })
  if (!existing) return null

  const rounds = sanitizeRounds(existing.rounds)
  const stored: AssistantConversationRoundStored = {
    ...round,
    roundIndex: rounds.length,
  }
  const next = [...rounds, stored].slice(
    -ASSISTANT_ROUND_SUMMARY_LIMITS.maxRoundsPerConversation,
  )

  await db.assistantConversation.update({
    where: { id: existing.id },
    data: { rounds: next as unknown as Prisma.InputJsonValue },
  })
  logger.info('assistant round summary stored', {
    conversationId: existing.id,
    roundIndex: stored.roundIndex,
    evidenceRefs: stored.evidenceRefs.length,
  })
  return stored
}

/**
 * **用户就地改过的那一条写回去**（v2 §7.7，commit #13）。
 *
 * ⭐ 三条纪律，逐条对应一种走样：
 *  ① 只覆盖**带上来的那几栏**，`roundIndex` / `createdAt` / `evidenceRefs` 原样
 *     留着 —— 它们是这条记录的身份与出处，改了就指不回证据本；
 *  ② 带了三栏文字才置 `editedByUser: true` —— 下一轮注入的必须是用户这一版，而
 *     §7.2 写明它 ⛔ 不许被下一次结账悄悄覆盖回模型写的版本。
 *     ⚠ **只钉住 / 取消钉住的那一次不置**（实测第三组 B）：钉住动的是「这一句
 *     还留不留在眼前」，⛔ 不是把模型写的那三栏认领成用户写的；
 *  ③ **按 `roundIndex` 认，不按数组下标**：这一列会从最旧的那头截
 *     （`maxRoundsPerConversation`），下标会整体左移而编号不会。
 *
 * @returns 改完的那条；会话不存在 / 不归他 / 没有这一号时 `null`（调用方回 404）。
 */
export async function updateAssistantConversationRound(
  clerkId: string,
  conversationId: string,
  roundIndex: number,
  columns: Partial<
    Pick<
      AssistantConversationRoundStored,
      'facts' | 'decisions' | 'todos' | 'pinnedEvidence'
    >
  >,
): Promise<AssistantConversationRoundStored | null> {
  const user = await ensureUser(clerkId)
  const existing = await db.assistantConversation.findFirst({
    where: { id: conversationId, userId: user.id },
    select: { id: true, rounds: true },
  })
  if (!existing) return null

  const rounds = sanitizeRounds(existing.rounds)
  const target = rounds.find((round) => round.roundIndex === roundIndex)
  if (!target) return null

  const editedColumns =
    columns.facts !== undefined ||
    columns.decisions !== undefined ||
    columns.todos !== undefined
  const updated: AssistantConversationRoundStored = {
    ...target,
    ...(columns.facts !== undefined ? { facts: columns.facts } : {}),
    ...(columns.decisions !== undefined
      ? { decisions: columns.decisions }
      : {}),
    ...(columns.todos !== undefined ? { todos: columns.todos } : {}),
    ...(columns.pinnedEvidence !== undefined
      ? { pinnedEvidence: columns.pinnedEvidence }
      : {}),
    ...(editedColumns ? { editedByUser: true } : {}),
  }
  const next = rounds.map((round) =>
    round.roundIndex === roundIndex ? updated : round,
  )

  await db.assistantConversation.update({
    where: { id: existing.id },
    data: { rounds: next as unknown as Prisma.InputJsonValue },
  })
  logger.info('assistant round summary edited', {
    conversationId: existing.id,
    roundIndex,
  })
  return updated
}

/**
 * **下一轮注入要读的那几条结论记录**（v2 §7.6，commit #12）。
 *
 * ⚠ 收的是 **DB `userId`** 而不是 `clerkId`（与同文件其余几条不同，有意的）：
 * 调用方是工具环开跑前那一批并行读，它手上已经有 `ensureUser` 回来的那一行 ——
 * 为了签名整齐再 upsert 一次用户，是给每一轮多加一次写库。
 * ⚠ 所有权照旧**服务端核**：`userId` 不匹配就当没这段会话（返回空），
 * ⛔ 不抛错 —— 注入不到跨轮记忆是「这一轮少知道点事」，不是这一轮跑不了。
 * ⚠ 读**最近**几条（`rounds` 是追加序），⛔ 不读整列：更旧的那些没有读者。
 */
export async function listAssistantConversationRounds(
  userId: string,
  conversationId: string,
  args: { limit: number },
): Promise<AssistantConversationRoundStored[]> {
  const row = await db.assistantConversation.findFirst({
    where: { id: conversationId, userId },
    select: { rounds: true },
  })
  if (!row) return []
  return sanitizeRounds(row.rounds).slice(-args.limit)
}
