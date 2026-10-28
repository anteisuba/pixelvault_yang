import 'server-only'

import { Prisma } from '@/lib/generated/prisma/client'

import {
  ASSISTANT_EVIDENCE_RECALL_LIMITS,
  ASSISTANT_EVIDENCE_REF_PREFIX,
  ASSISTANT_PAST_SEARCH_LIMITS,
} from '@/constants/assistant-operator'
import {
  EVIDENCE_SOURCE_TIERS,
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_IDS,
} from '@/constants/research'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { assistantWorkspaceFromKey } from '@/lib/assistant-workspace'
import { findOwnConversation } from '@/services/assistant-conversation.service'
import {
  ASSISTANT_SURFACE_BY_DOMAIN,
  type AssistantSurfaceId,
} from '@/types/assistant-conversation'
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
  tx: Prisma.TransactionClient,
  userId: string,
  conversationId: string,
): Promise<number> {
  const rows = await tx.researchRun.findMany({
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
 * 把工具查到的证据写进证据本，逐条分配编号，提交成功后才返回编号。
 *
 * ⚠ **失败不抛**：写入失败不许阻塞工具完成与 `done`（§7.5）。
 * 写不进去就返回空编号 —— 结论记录于是不带 `evidenceRefs`，⛔ 而不是带着一串
 * 指不回任何东西的号。
 */
export async function appendAssistantEvidenceBook(args: {
  /** DB user id（不是 clerkId）。 */
  userId: string
  workspaceKey: string
  surface: AssistantSurfaceId
  conversationId: string
  projectId?: string | null
  /** 这一轮助手用的文本模型标识，落库只为归因。 */
  model?: string | undefined
  entries: readonly AssistantEvidenceBookEntry[]
  /**
   * 默认 true（打了我们的源、花了 Serper）。模型自带联网搜到的传 false：花的是
   * 创作者自己的 key，⛔ 计进平台的当日检索配额。
   */
  grounded?: boolean
}): Promise<AssistantEvidenceBookResult> {
  const entries = args.entries.filter((entry) => entry.items.length > 0)
  if (entries.length === 0) return { refs: [], researchRunIds: [] }

  try {
    return await db.$transaction(
      async (tx) => {
        const locked = await findOwnConversation(tx, {
          id: args.conversationId,
          userId: args.userId,
          lock: true,
        })
        if (!locked) return { refs: [], researchRunIds: [] }
        let seq = await nextRefSeq(tx, args.userId, args.conversationId)
        const refs: string[] = []
        const researchRunIds: string[] = []
        for (const entry of entries) {
          const numbered = entry.items.map((item) => {
            const ref = `${ASSISTANT_EVIDENCE_REF_PREFIX}${seq}`
            seq += 1
            refs.push(ref)
            return { ...item, ref }
          })
          const row = await tx.researchRun.create({
            data: {
              userId: args.userId,
              surface: args.surface,
              projectId: args.projectId ?? null,
              conversationId: args.conversationId,
              goal: entry.goal,
              query: entry.queries.join(' · '),
              status: RESEARCH_RUN_STATUSES.succeeded,
              grounded: args.grounded ?? true,
              evidence: numbered as unknown as Prisma.InputJsonValue,
              perSource: entry.receipts as unknown as Prisma.InputJsonValue,
              ...(args.model ? { model: args.model } : {}),
              completedAt: new Date(),
            },
            select: { id: true },
          })
          researchRunIds.push(row.id)
        }
        return { refs, researchRunIds }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )
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
  excerptKind?: EvidenceItem['excerptKind']
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
        ...(item.excerptKind ? { excerptKind: item.excerptKind } : {}),
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

/** 以前的一次搜索（跨会话），给翻记忆那一步带回去。 */
export interface AssistantPastSearch {
  goal: string
  /** 哪天搜的（YYYY-MM-DD）。 */
  day: string
  items: { title: string; url?: string; excerpt?: string }[]
}

function evidenceExcerpt(item: EvidenceItem): string | undefined {
  const text =
    item.kind === 'text'
      ? item.excerpt
      : item.kind === 'tags'
        ? item.tags.join(', ')
        : item.kind === 'video'
          ? item.excerpt
          : undefined
  if (!text) return undefined
  const max = ASSISTANT_PAST_SEARCH_LIMITS.maxExcerptChars
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * 翻**以前搜过的**（不分会话）：最近那批搜索里，目标或查询词含其中任一个词的几次。
 * 空词 = 最近几次。⚠ 打了注入标记的条目不带回；只读，⛔ 不花钱、⛔ 不打外部源。
 */
export async function searchPastResearch(
  userId: string,
  query: string,
): Promise<AssistantPastSearch[]> {
  const words = query
    .toLowerCase()
    .split(/[\s,，、;；]+/)
    .map((word) => word.trim())
    .filter(Boolean)
  const rows = await db.researchRun.findMany({
    where: { userId, status: RESEARCH_RUN_STATUSES.succeeded },
    orderBy: { createdAt: 'desc' },
    take: ASSISTANT_PAST_SEARCH_LIMITS.scanRuns,
    select: { goal: true, query: true, evidence: true, createdAt: true },
  })
  const found: AssistantPastSearch[] = []
  for (const row of rows) {
    if (found.length >= ASSISTANT_PAST_SEARCH_LIMITS.maxRuns) break
    const haystack = `${row.goal} ${row.query}`.toLowerCase()
    if (words.length > 0 && !words.some((word) => haystack.includes(word)))
      continue
    const items = (Array.isArray(row.evidence) ? row.evidence : [])
      .map((raw) => EvidenceItemSchema.safeParse(raw).data)
      // 视觉线的行装的是创作者自己给的图，不是搜来的。
      .filter(
        (item): item is EvidenceItem =>
          !!item &&
          !item.untrusted &&
          item.sourceId !== RESEARCH_SOURCE_IDS.visionInput,
      )
      .slice(0, ASSISTANT_PAST_SEARCH_LIMITS.maxItemsPerRun)
      .map((item) => {
        const excerpt = evidenceExcerpt(item)
        return {
          title: item.title,
          ...(item.url ? { url: item.url } : {}),
          ...(excerpt ? { excerpt } : {}),
        }
      })
    if (items.length === 0) continue
    found.push({
      goal: row.goal,
      day: row.createdAt.toISOString().slice(0, 10),
      items,
    })
  }
  return found
}

/**
 * 模型**自带联网**搜到的那几页记进证据本（新内核：厂商自己跑的搜索，我们只拿到标题与网址，
 * 摘要是厂商加密的）。⭐ 为的是换个会话也翻得到「以前搜过什么」（`searchPastResearch`）。
 * ⚠ 不计平台检索配额（`grounded: false`、无回执）；写不进去不抛。
 */
export async function recordNativeSearches(args: {
  userId: string
  workspaceKey: string
  domain: keyof typeof ASSISTANT_SURFACE_BY_DOMAIN
  conversationId: string
  model?: string | undefined
  queries: readonly string[]
  sources: readonly { title: string; url: string }[]
}): Promise<void> {
  if (args.queries.length === 0 || args.sources.length === 0) return
  const retrievedAt = new Date().toISOString()
  await appendAssistantEvidenceBook({
    userId: args.userId,
    workspaceKey: args.workspaceKey,
    surface: ASSISTANT_SURFACE_BY_DOMAIN[args.domain],
    projectId: assistantWorkspaceFromKey(args.workspaceKey)?.projectId ?? null,
    conversationId: args.conversationId,
    model: args.model,
    grounded: false,
    entries: [
      {
        goal: args.queries.join(' · ').slice(0, 300),
        queries: args.queries,
        items: args.sources.map((source, index) => ({
          kind: 'text' as const,
          id: `native-${index + 1}`,
          sourceId: RESEARCH_SOURCE_IDS.webSearch,
          sourceTier: EVIDENCE_SOURCE_TIERS.community,
          retrievedAt,
          title: source.title,
          url: source.url,
          excerpt: '',
        })),
        receipts: [],
      },
    ],
  })
}
