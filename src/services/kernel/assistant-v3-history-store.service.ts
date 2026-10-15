import 'server-only'

import type { AssistantV3HistorySummary } from '@/types/assistant-v3'

/**
 * 滑出窗口的那几轮的摘要存在哪（P2 第三片）—— ⚠ **现在哪都不存**（`persists: false`）。
 *
 * 它该住在会话那一行上（与 `rounds` 同一个理由：与会话同生共死、只有这段会话读它），但现有的
 * 两列都装不干净：
 *  - `AssistantConversation.messages`：前端整份覆盖写（`upsertAssistantConversation`），服务端写进去
 *    的东西下一次保存就被冲掉；
 *  - `AssistantConversation.rounds`：结论记录，逐条按 `AssistantOperatorRoundSummarySchema`（三栏 ×
 *    每条 60 字）过、读不出来的丢掉，面板与分享页都读它 —— 塞一份摘要进去会被当成一轮结论画出来。
 * 所以要一列新的（`historySummary Json?`，迁移写法见 `docs/references/assistant-v3.md`），owner 点头之前
 * 这里是空的：读回空、写不落；`persists: false` 时服务端 ⛔ 不起后台那一跳（存不下就 ⛔ 花这笔钱），
 * 窗口照样按字数滑、只是滑出去的那几轮没有摘要（与从前按 24 条截掉一样丢）。
 *
 * 那一列加上之后，这里换成真的读写：按 `{ id: conversationId, userId }` 认会话（⛔ 不认别人的），
 * `update` 在事务里锁那一行读改写，读出来过 `AssistantV3HistorySummariesSchema`，读不出来当空。
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
  /** 读改写（真的那一份要在事务里锁行）；会话不在 / 不归他就什么都不做。 */
  update(
    key: AssistantV3HistoryKey,
    apply: (
      current: AssistantV3HistorySummary[],
    ) => AssistantV3HistorySummary[],
  ): Promise<void>
}

export const assistantV3HistoryStore: AssistantV3HistoryStore = {
  persists: false,
  load: async () => [],
  update: async () => {},
}
