import 'server-only'

import {
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_META,
  RESEARCH_SOURCE_STATUSES,
  type ResearchMode,
} from '@/constants/research'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { AssistantSurfaceId } from '@/types/assistant-conversation'
import {
  EvidenceItemSchema,
  ResearchRunStatusSchema,
  ResearchSourceReceiptSchema,
  type EvidenceItem,
  type ResearchRunDetail,
  type ResearchSourceReceipt,
} from '@/types/research'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

/**
 * 检索管线 v1 编排（§3.2）。
 *
 * 规划 → 并行打源 → 去重 → 有界二次深化 → 组装证据包 → 落 `ResearchRun`。
 *
 * 三条不许含糊的边界：
 *  1. **单源失败不拖垮整体** —— 每个源自己产回执，编排层只汇总，从不 rethrow。
 *  2. **`no_evidence` ≠ `failed`** —— 「打了但没料」和「源被封/全挂」是两个事实，
 *     UI 的下一步话术完全不同（换关键词 vs 这条路不通）。
 *  3. **超配额要说出来** —— `quota_exceeded` 是显性状态，不静默降级成「没搜到」。
 */

export interface RunResearchParams {
  /** DB user id（不是 clerkId）。 */
  userId: string
  surface: AssistantSurfaceId
  projectId?: string | null
  conversationId?: string | null
  /** 最新一条用户消息的原文。 */
  text: string
  mode: ResearchMode
  /**
   * 规划器跑在哪一家：就是这一轮助手所选的那条路（owner 2026-10-15，⛔ 借别家的 key）。
   */
  route: ResolvedLlmTextRoute
  /** 这一轮助手用的型号：规划器同用它，落库也记它。 */
  model?: string
}

// ─── 配额 ───────────────────────────────────────────────────────

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * 当日**检索** run 计数。
 *
 * ⚠ **直接 count `ResearchRun` 行，不塞 `ApiUsageLedger`** —— 后者的形状绑在
 * generation / generationJob 上，硬塞会得到一堆没有 generation 的孤儿行，
 * 而且用量汇总页会把检索算进生成用量。索引 `[userId, createdAt desc]` 就是为它建的。
 *
 * ⚠ **必须排掉视觉线的 run**（2026-08-21 修）：`ResearchRun` 这张表被检索线与
 * 视觉线共用（共用的是证据契约，不是配额），若一并计数，40 次看图会吃掉 60 个
 * 检索名额里的 40 个——两条线成本结构完全不同（视觉按图收费、检索按查收费），
 * 混在一个池子里，一条线的正常使用会把另一条线饿死。判据用 `grounded`：
 * **视觉线恒 false 且 `perSource` 恒空**，而检索线只要真打过源就为 true。
 * ⚠ 别改用 goal 过滤——`analyze_character` / `review_shot` 两条线都在用。
 */
export async function countResearchRunsToday(userId: string): Promise<number> {
  return db.researchRun.count({
    where: {
      userId,
      createdAt: { gte: startOfToday() },
      NOT: { grounded: false, perSource: { equals: [] } },
    },
  })
}

// ─── 回看（UI 懒加载）───────────────────────────────────────────

/**
 * 按 id 取一次检索的可回看形态。**只读，只读本人的行。**
 *
 * ⚠ ownership 写在 `where` 里而不是「取回来再比 userId」—— 后者一旦有人重构成
 * 早返回，就变成任何人凭 id 读别人的证据（证据里带原文摘录和检索问题）。
 *
 * ⚠ 两个 Json 列（`evidence` / `perSource`）**必须过 zod 再出服务层**：它们是
 * 历史数据，schema 演进过就会有对不上的老行。解析失败当空数组处理而不是抛 ——
 * 「这次检索的证据读不出来」不该让整个回看 404。
 */
export async function getResearchRunForUser(
  runId: string,
  userId: string,
): Promise<ResearchRunDetail | null> {
  const row = await db.researchRun.findFirst({
    where: { id: runId, userId },
    select: {
      id: true,
      status: true,
      grounded: true,
      goal: true,
      query: true,
      perSource: true,
      evidence: true,
      model: true,
      error: true,
      createdAt: true,
      completedAt: true,
    },
  })
  if (!row) return null

  const evidence = EvidenceItemSchema.array().safeParse(row.evidence)
  const perSource = ResearchSourceReceiptSchema.array().safeParse(row.perSource)
  if (!evidence.success || !perSource.success) {
    logger.warn('ResearchRun payload failed schema validation', {
      runId,
      evidenceOk: evidence.success,
      perSourceOk: perSource.success,
    })
  }

  const status = ResearchRunStatusSchema.safeParse(row.status)

  return {
    id: row.id,
    // 未知状态**从 grounded 推**，不硬塞成 failed —— 「没搜到」和「搜挂了」
    // 是这条线的第一道闸，猜错方向比少一个字段更坏。
    status: status.success
      ? status.data
      : row.grounded
        ? RESEARCH_RUN_STATUSES.succeeded
        : RESEARCH_RUN_STATUSES.noEvidence,
    grounded: row.grounded,
    goal: row.goal,
    query: row.query,
    perSource: perSource.success ? perSource.data : [],
    evidence: evidence.success ? evidence.data : [],
    model: row.model,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}

// ─── 去重 ───────────────────────────────────────────────────────

/**
 * 同一事实多源命中 → **权威层优先留**（§3.4 第 5 闸）。
 *
 * 判据是 `kind + url`：同一个页面的正文和标签是两条不同的证据，不能互相盖掉；
 * 而两个源指向同一个 URL 的同一类证据才是真重复。
 */
export function dedupeEvidence(items: readonly EvidenceItem[]): EvidenceItem[] {
  const byKey = new Map<string, EvidenceItem>()
  for (const item of items) {
    const key = `${item.kind}:${item.url ?? item.id}`
    const existing = byKey.get(key)
    if (
      !existing ||
      RESEARCH_SOURCE_META[item.sourceId].authorityRank <
        RESEARCH_SOURCE_META[existing.sourceId].authorityRank
    ) {
      byKey.set(key, item)
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      RESEARCH_SOURCE_META[a.sourceId].authorityRank -
      RESEARCH_SOURCE_META[b.sourceId].authorityRank,
  )
}

// ─── 状态判定 ───────────────────────────────────────────────────

/**
 * ⚠ **判据不能只看有没有证据**：全部源都 failed / circuit_open 是「这条路不通」
 * （`failed`），而源都活着只是没料才是「没搜到」（`no_evidence`）。混掉这两个，
 * 用户会拿到一句「没找到相关资料」，然后一直换关键词换到怀疑人生。
 */
export function resolveRunStatus(
  items: readonly EvidenceItem[],
  receipts: readonly ResearchSourceReceipt[],
) {
  if (items.length > 0) return RESEARCH_RUN_STATUSES.succeeded

  const attempted = receipts.filter(
    (receipt) => receipt.status !== RESEARCH_SOURCE_STATUSES.skipped,
  )
  if (attempted.length === 0) return RESEARCH_RUN_STATUSES.noEvidence

  const allBroken = attempted.every(
    (receipt) =>
      receipt.status === RESEARCH_SOURCE_STATUSES.failed ||
      receipt.status === RESEARCH_SOURCE_STATUSES.circuitOpen,
  )
  return allBroken
    ? RESEARCH_RUN_STATUSES.failed
    : RESEARCH_RUN_STATUSES.noEvidence
}
