import 'server-only'

import type { Prisma } from '@/lib/generated/prisma/client'

import {
  ASSISTANT_EVIDENCE_REF_PREFIX,
  ASSISTANT_ROUND_SUMMARY_LIMITS,
} from '@/constants/assistant-operator'
import { RESEARCH_RUN_STATUSES } from '@/constants/research'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { AssistantSurfaceId } from '@/types/assistant-conversation'
import {
  EvidenceItemSchema,
  type EvidenceItem,
  type ResearchSourceReceipt,
} from '@/types/research'

/**
 * **证据本**（assistant-shell-v2 §7.3）—— 工具环查到的东西按编号落库，模型不再
 * 重发正文，下一轮要看就按编号翻（`recall_evidence`，commit #12）。
 *
 * ── 为什么复用 `ResearchRun` 而不新建一张表（§7.3）────────────────
 * 它的字段形状与「证据本」逐字重合：已经有 `conversationId` 弱引用、
 * `evidence Json`、`conclusions Json`、`perSource Json`。另建一张只会让同一份证据
 * 在库里有两个身份，而「同一件事两个真值口」正是这份 spec 一路在拆的东西。
 *
 * ── 为什么它是独立文件而不是 `research-run.service` 的一个函数 ────
 * 那条服务会读配额、跑规划器、拼证据块给写作模型；工具环的钱闸
 * （`assistant-operator.money-gate.test.ts`）把它挡在 import 名单外是有意的。
 * 这里只做**一件事**：把已经拿到手的证据按编号写下去。⛔ 别往这个文件里加任何
 * 会花钱的腿（打源、调模型、下载），它进得了工具环的 import 名单就是因为它没有。
 *
 * ⚠ 这些行**会被 `countResearchRunsToday` 计入当日检索配额**（判据是
 * `grounded=true` 或 `perSource` 非空）—— 有意的：这一跳确实打了外部源、确实花了
 * Serper credit，不计数等于给同一条成本开两个池子。
 */

/** 一次 `research` 调用的产出 —— 一行 `ResearchRun` 记一条。 */
export interface AssistantEvidenceBookEntry {
  goal: string
  /** 服务端真的发出去的那几条查询。 */
  queries: readonly string[]
  items: readonly EvidenceItem[]
  receipts: readonly ResearchSourceReceipt[]
}

export interface AssistantEvidenceBookResult {
  /** 这一轮新分配出去的编号，按 `entries` 的顺序拍平。 */
  refs: string[]
  /** 写下去的那几行 `ResearchRun.id`（日志与 §7.3 的回溯用）。 */
  researchRunIds: string[]
}

/**
 * 这段会话已经用到第几号（§7.3：`#e` + **会话内**自增）。
 *
 * ⚠ 序号从已经落库的证据里现算，⛔ 不另存一个计数器：计数器与实际条目一旦不同步
 * （写了一半失败、行被删），编号就会指向不存在的东西，而编号的全部价值就是
 * 「点得回那一条」。
 */
async function nextRefSeq(
  userId: string,
  conversationId: string,
): Promise<number> {
  const rows = await db.researchRun.findMany({
    where: { userId, conversationId },
    select: { evidence: true },
  })
  let max = 0
  for (const row of rows) {
    if (!Array.isArray(row.evidence)) continue
    for (const raw of row.evidence) {
      const parsed = EvidenceItemSchema.safeParse(raw)
      const ref = parsed.success ? parsed.data.ref : undefined
      if (!ref) continue
      const seq = Number(ref.slice(ASSISTANT_EVIDENCE_REF_PREFIX.length))
      if (Number.isFinite(seq) && seq > max) max = seq
    }
  }
  return max + 1
}

/**
 * 把本轮查到的证据写进证据本，逐条分配编号。
 *
 * ⚠ **失败不抛**：它跑在每轮结账那一步，而结账失败不许阻塞 `done`（§7.5）。
 * 写不进去就返回空编号 —— 结论记录于是不带 `evidenceRefs`，⛔ 而不是带着一串
 * 指不回任何东西的号。
 */
export async function appendAssistantEvidenceBook(args: {
  /** DB user id（不是 clerkId）。 */
  userId: string
  surface: AssistantSurfaceId
  conversationId: string
  projectId?: string | null
  /** 这一轮助手用的文本模型标识，落库只为归因。 */
  model?: string | undefined
  entries: readonly AssistantEvidenceBookEntry[]
}): Promise<AssistantEvidenceBookResult> {
  const entries = args.entries.filter((entry) => entry.items.length > 0)
  if (entries.length === 0) return { refs: [], researchRunIds: [] }

  try {
    let seq = await nextRefSeq(args.userId, args.conversationId)
    const refs: string[] = []
    const researchRunIds: string[] = []

    for (const entry of entries) {
      const numbered = entry.items.map((item) => {
        const ref = `${ASSISTANT_EVIDENCE_REF_PREFIX}${seq}`
        seq += 1
        refs.push(ref)
        return { ...item, ref }
      })
      const row = await db.researchRun.create({
        data: {
          userId: args.userId,
          surface: args.surface,
          projectId: args.projectId ?? null,
          conversationId: args.conversationId,
          goal: entry.goal,
          query: entry.queries.join(' · '),
          status: RESEARCH_RUN_STATUSES.succeeded,
          grounded: true,
          evidence: numbered as unknown as Prisma.InputJsonValue,
          perSource: entry.receipts as unknown as Prisma.InputJsonValue,
          ...(args.model ? { model: args.model } : {}),
          completedAt: new Date(),
        },
        select: { id: true },
      })
      researchRunIds.push(row.id)
    }

    return {
      // ⚠ 编号本身有上限（结论记录只装得下那么多），⛔ 但库里那几行是全的。
      refs: refs.slice(0, ASSISTANT_ROUND_SUMMARY_LIMITS.maxEvidenceRefs),
      researchRunIds,
    }
  } catch (error) {
    logger.warn('assistant evidence book write failed', {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { refs: [], researchRunIds: [] }
  }
}
