import 'server-only'

import { ASSISTANT_V3_HISTORY } from '@/constants/assistant-v3'
import {
  AssistantV3HistorySummariesSchema,
  AssistantV3HistorySummarySchema,
  type AssistantV3HistorySummary,
} from '@/types/assistant-v3'
import { db } from '@/lib/db'
import { Prisma } from '@/lib/generated/prisma/client'

/**
 * 滑出窗口的那几轮的摘要存在哪（P2 第三片）：会话那一行上的 `AssistantConversation.historySummary`
 * （owner 2026-10-15 同意加这一列）。
 *
 * 为什么是新的一列，不是现有的两列：
 *  - `messages`：前端整份覆盖写（`upsertAssistantConversation`），服务端写进去的东西下一次保存就被冲掉；
 *  - `rounds`：结论记录，逐条按 `AssistantOperatorRoundSummarySchema` 过，面板与分享页都读它 ——
 *    塞一份摘要进去会被当成一轮结论画出来。
 *
 * ⚠ 认会话按 `{ id: conversationId, userId }`（⛔ 不认别人的）；读出来逐份过
 *   `AssistantV3HistorySummarySchema`，读不出来的那一份丢掉（⛔ 因为一份坏的把其余几份一起当空）。
 * ⚠ `update` 在事务里 `SELECT … FOR UPDATE` 锁那一行读改写（与 `appendAssistantConversationRound`
 *   同一个做法：两个标签页同时补完，后写的那个看得见先写的）。
 * ⚠ 写用原生 SQL：⛔ 动 `updatedAt` —— 后台补一份摘要不是用户改了会话，列表排序不该跟着跳。
 */
export interface AssistantV3HistoryKey {
  /** `User.id`（⛔ 不是 clerkId）。 */
  readonly userId: string
  readonly conversationId: string
}

export interface AssistantV3HistoryStore {
  /** false = 存不下来：⛔ 不生成、⛔ 不花钱。 */
  readonly persists: boolean
  /** 这段会话上存的那几份（最旧的在前）；没有 / 不归他 = 空。 */
  load(key: AssistantV3HistoryKey): Promise<AssistantV3HistorySummary[]>
  /** 读改写（在事务里锁行）；会话不在 / 不归他就什么都不做。 */
  update(
    key: AssistantV3HistoryKey,
    apply: (
      current: AssistantV3HistorySummary[],
    ) => AssistantV3HistorySummary[],
  ): Promise<void>
}

export function readStoredAssistantV3HistorySummaries(
  value: unknown,
): AssistantV3HistorySummary[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((entry) => {
      const parsed = AssistantV3HistorySummarySchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
    .slice(-ASSISTANT_V3_HISTORY.summary.keep)
}

export const assistantV3HistoryStore: AssistantV3HistoryStore = {
  persists: true,
  load: async (key) => {
    const row = await db.assistantConversation.findFirst({
      where: { id: key.conversationId, userId: key.userId },
      select: { historySummary: true },
    })
    return row ? readStoredAssistantV3HistorySummaries(row.historySummary) : []
  },
  update: async (key, apply) => {
    await db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ historySummary: unknown }[]>(
          Prisma.sql`
            SELECT "historySummary" FROM "AssistantConversation"
            WHERE "id" = ${key.conversationId} AND "userId" = ${key.userId}
            FOR UPDATE
          `,
        )
        const row = rows[0]
        if (!row) return
        // ⚠ 写之前再过一遍：⛔ 把超份数 / 超字数的那一份写进库。
        const next = AssistantV3HistorySummariesSchema.parse(
          apply(readStoredAssistantV3HistorySummaries(row.historySummary)),
        )
        await tx.$executeRaw(Prisma.sql`
          UPDATE "AssistantConversation"
          SET "historySummary" = ${JSON.stringify(next)}::jsonb
          WHERE "id" = ${key.conversationId} AND "userId" = ${key.userId}
        `)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )
  },
}
