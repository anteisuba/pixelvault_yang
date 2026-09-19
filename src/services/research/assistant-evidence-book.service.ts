import 'server-only'

import type { Prisma } from '@/lib/generated/prisma/client'

import {
  ASSISTANT_EVIDENCE_RECALL_LIMITS,
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
 * **号段预取**（§9.1 ④ / §9.2 `evidenceRef`，commit #16）——这一轮的证据会拿到
 * 哪几个号，在**查到的那一刻**就说得出来。
 *
 * ⭐ 为什么要在落库之前就给号：证据卡上的「钉住」钉的是号（钉住 = 进本轮结论
 * 记录的 `evidenceRefs`，§7.3），而卡在 `done` 那一帧就画出来了，比结账早得多。
 * ⚠ 它**只读不写**：号段照旧由 `appendAssistantEvidenceBook` 在结账时从库里现算
 * 分配 —— 两处算的是同一件事（`max + 1`），中途没有第二条写路，所以号对得上。
 * ⛔ 别在这里改成「预留号段」：预留就是一个会与实际条目失同步的计数器，而那正是
 * `nextRefSeq` 头注里拒绝过的东西。
 * ⚠ 读不出来（库挂了）就返回 `null` —— 这一轮的证据于是不带编号，⛔ 不编号。
 */
export async function peekAssistantEvidenceRefSeq(args: {
  userId: string
  conversationId: string
}): Promise<number | null> {
  try {
    return await nextRefSeq(args.userId, args.conversationId)
  } catch (error) {
    logger.warn('assistant evidence book ref peek failed', {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
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

/**
 * 一条被翻回来的证据 —— 形状见
 * `AssistantOperatorRecalledEvidenceSchema`（`types/assistant-operator.ts`）。
 */
export interface AssistantRecalledEvidence {
  ref: string
  title: string
  url?: string
  source: string
  body: string
}

export interface AssistantEvidenceRecallResult {
  items: AssistantRecalledEvidence[]
  /** 这段会话的证据本里**没有**的那几个号（§7.3：不存在要说得出来）。 */
  missing: string[]
}

/** 四种 `kind` 压平成模型要读的那一段正文。 */
function evidenceBody(item: EvidenceItem): string {
  const text =
    item.kind === 'text'
      ? item.excerpt
      : item.kind === 'tags'
        ? `${item.tags.join(', ')}（${item.provenance}）`
        : item.kind === 'video'
          ? // ⚠ 与证据块同一条纪律：视频给元数据，⛔ 不给播放地址。
            `${item.site}${item.durationSeconds ? ` · ${item.durationSeconds}s` : ''}${item.excerpt ? ` · ${item.excerpt}` : ''}`
          : item.imageUrl
  return text.slice(0, ASSISTANT_EVIDENCE_RECALL_LIMITS.maxBodyChars)
}

/**
 * **按编号翻证据本**（§7.3 / commit #12 的 `recall_evidence`）。
 *
 * ⚠ 两道闸都在 where 里：`userId` **与** `conversationId` —— 编号是**会话内**
 * 自增的，只核用户的话，A 会话的 `#e3` 会把 B 会话的 `#e3` 翻出来。
 * ⚠ 翻不到的号进 `missing` 而不是抛错：三个号里有一个过期时，把翻到的两条给出去
 * 比整条拒掉有用；一个都没翻到该不该拒，由调用方（规划器）判 —— 这里只答事实。
 * ⛔ 它**不去打任何外部源**：翻旧账要是会触发一次新检索，那就不是翻旧账了。
 */
export async function recallAssistantEvidence(args: {
  /** DB user id（不是 clerkId）。 */
  userId: string
  conversationId: string
  refs: readonly string[]
}): Promise<AssistantEvidenceRecallResult> {
  const wanted = [...new Set(args.refs)].slice(
    0,
    ASSISTANT_EVIDENCE_RECALL_LIMITS.maxRefsPerCall,
  )
  if (wanted.length === 0) return { items: [], missing: [] }

  const rows = await db.researchRun.findMany({
    where: { userId: args.userId, conversationId: args.conversationId },
    select: { evidence: true },
  })

  const found = new Map<string, AssistantRecalledEvidence>()
  for (const row of rows) {
    if (!Array.isArray(row.evidence)) continue
    for (const raw of row.evidence) {
      const parsed = EvidenceItemSchema.safeParse(raw)
      if (!parsed.success) continue
      const item = parsed.data
      if (!item.ref || !wanted.includes(item.ref) || found.has(item.ref)) {
        continue
      }
      found.set(item.ref, {
        ref: item.ref,
        title: item.title,
        ...(item.url ? { url: item.url } : {}),
        source: item.sourceId,
        body: evidenceBody(item),
      })
    }
  }

  return {
    // ⚠ 按**模型问的顺序**回，⛔ 不按库里的顺序：它问的顺序就是它读的顺序。
    items: wanted
      .map((ref) => found.get(ref))
      .filter((item): item is AssistantRecalledEvidence => Boolean(item)),
    missing: wanted.filter((ref) => !found.has(ref)),
  }
}
