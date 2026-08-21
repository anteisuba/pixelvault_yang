import 'server-only'

import type { AssistantSurface, Prisma } from '@/lib/generated/prisma/client'

import {
  MEDIAWIKI_SITES,
  RESEARCH_DAILY_RUN_LIMIT,
  RESEARCH_FRESHNESS,
  RESEARCH_GROUP_SOURCES,
  RESEARCH_LIMITS,
  RESEARCH_MODES,
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_GROUPS,
  RESEARCH_SOURCE_IDS,
  RESEARCH_SOURCE_META,
  RESEARCH_SOURCE_STATUSES,
  type ResearchMode,
  type ResearchSourceId,
} from '@/constants/research'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  buildEvidenceBlock,
  sanitizeEvidenceItems,
} from '@/lib/research-evidence-block'
import {
  planResearchHeuristically,
  withForcedSearch,
} from '@/lib/research-intent'
import type { AssistantSurfaceId } from '@/types/assistant-conversation'
import {
  EvidenceItemSchema,
  ResearchRunStatusSchema,
  ResearchSourceReceiptSchema,
  type EvidenceItem,
  type ResearchPlan,
  type ResearchReceipt,
  type ResearchRunDetail,
  type ResearchSourceReceipt,
} from '@/types/research'
import {
  runConnector,
  skippedReceipt,
} from '@/services/research/connector-runtime'
import { fetchBilibiliEvidence } from '@/services/research/bilibili.connector'
import { fetchDanbooruEvidence } from '@/services/research/danbooru.connector'
import {
  fetchMediaWikiEvidence,
  getMediaWikiSite,
  pickQueryForSite,
} from '@/services/research/mediawiki.connector'
import {
  fetchUrlEvidence,
  fetchWebSearchEvidence,
} from '@/services/research/web-search.connector'
import { planResearchWithLlm } from '@/services/research/research-planner.service'

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
  /** 用哪条 key 跑规划器（跟着助手轮的选择走）。 */
  apiKeyId?: string
  /** 落库用：这一轮助手用的模型标识。 */
  model?: string
}

export interface ResearchOutcome {
  receipt: ResearchReceipt
  /** 可直接拼进用户提示的证据块（已过注入扫描 + 边界标记）。空串 = 无证据。 */
  evidenceBlock: string
  items: EvidenceItem[]
  plan: ResearchPlan
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

// ─── 打源 ───────────────────────────────────────────────────────

async function fetchFromSource(
  sourceId: ResearchSourceId,
  plan: ResearchPlan,
): Promise<{ items: EvidenceItem[]; receipt: ResearchSourceReceipt }> {
  const queries = plan.queries
  const primary = queries[0]?.text ?? ''

  if (sourceId === RESEARCH_SOURCE_IDS.webSearch) {
    return runConnector(sourceId, () =>
      fetchWebSearchEvidence({
        queries: queries.map((query) => query.text),
        freshness: plan.freshness,
      }),
    )
  }

  if (sourceId === RESEARCH_SOURCE_IDS.urlReader) {
    return runConnector(sourceId, () => fetchUrlEvidence({ urls: plan.urls }))
  }

  if (sourceId === RESEARCH_SOURCE_IDS.danbooru) {
    // danbooru 是英文 tag 库，但中文名有 `other_names_match` 现成反查，所以
    // 有英文查询就用英文的，没有也能用中文名打。
    const query = queries.find((entry) => entry.lang === 'en')?.text ?? primary
    if (!query)
      return { items: [], receipt: skippedReceipt(sourceId, 'no query') }
    return runConnector(sourceId, () => fetchDanbooruEvidence({ query }))
  }

  if (sourceId === RESEARCH_SOURCE_IDS.bilibili) {
    const query = queries.find((entry) => entry.lang === 'zh')?.text ?? primary
    if (!query)
      return { items: [], receipt: skippedReceipt(sourceId, 'no query') }
    return runConnector(sourceId, () => fetchBilibiliEvidence({ query }))
  }

  const site = getMediaWikiSite(sourceId)
  if (site) {
    const query = pickQueryForSite(site, queries)
    if (!query)
      return { items: [], receipt: skippedReceipt(sourceId, 'no query') }
    return runConnector(sourceId, () => fetchMediaWikiEvidence({ site, query }))
  }

  return { items: [], receipt: skippedReceipt(sourceId, 'unknown source') }
}

function resolveSourceList(plan: ResearchPlan): ResearchSourceId[] {
  // 用户贴了 URL：只读它，不打搜索（规划器那条启发式的落点）。
  if (plan.urls.length > 0) return [RESEARCH_SOURCE_IDS.urlReader]

  const configured = RESEARCH_GROUP_SOURCES[plan.sourceGroup]
  return configured.filter((sourceId) => {
    // Fandom 的 API host 在 v1 是固定的（见 MEDIAWIKI_SITES 注释），
    // 打不中的查询会自然返回空 —— 不会造假证据，只会得到 empty 回执。
    if (getMediaWikiSite(sourceId)) {
      return MEDIAWIKI_SITES.some((site) => site.sourceId === sourceId)
    }
    return true
  })
}

/**
 * 整轮的墙钟硬闸。
 *
 * ⚠ 每个源自己有超时，但**并行不等于有界**：一个源带重试最坏能拖到几十秒，
 * 而路由 `maxDuration=60`、检索之后还有模型调用。慢源必须被抛下，
 * 并在回执里如实记成 failed（不是 empty —— 「超时了」和「没料」是两件事）。
 */
function withSourceDeadline(
  sourceId: ResearchSourceId,
  promise: Promise<{ items: EvidenceItem[]; receipt: ResearchSourceReceipt }>,
): Promise<{ items: EvidenceItem[]; receipt: ResearchSourceReceipt }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<{
    items: EvidenceItem[]
    receipt: ResearchSourceReceipt
  }>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        items: [],
        receipt: {
          sourceId,
          status: RESEARCH_SOURCE_STATUSES.failed,
          count: 0,
          tookMs: RESEARCH_LIMITS.totalTimeoutMs,
          error: `timed out after ${RESEARCH_LIMITS.totalTimeoutMs}ms`,
        },
      })
    }, RESEARCH_LIMITS.totalTimeoutMs)
  })

  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function fanOut(
  plan: ResearchPlan,
): Promise<{ items: EvidenceItem[]; receipts: ResearchSourceReceipt[] }> {
  const sources = resolveSourceList(plan)
  const settled = await Promise.all(
    sources.map((sourceId) =>
      withSourceDeadline(sourceId, fetchFromSource(sourceId, plan)),
    ),
  )
  return {
    items: settled.flatMap((entry) => entry.items),
    receipts: settled.map((entry) => entry.receipt),
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

/**
 * 证据不足时的**唯一一次**改写重打（§3.2「有界二次深化」——死代码分支，不是
 * 开放循环）。改写策略是确定性的：放宽到通用组、去掉时间窗、把查询砍到主语。
 */
function broadenPlan(plan: ResearchPlan): ResearchPlan | null {
  const primary = plan.queries[0]?.text
  if (!primary) return null

  const broadened = primary
    .split(/[，,。；;：:]/)[0]
    ?.trim()
    .slice(0, RESEARCH_LIMITS.maxQueryLength)
  if (!broadened) return null

  const sameQuery = broadened === primary
  const alreadyGeneral = plan.sourceGroup === RESEARCH_SOURCE_GROUPS.general
  const noFreshness = plan.freshness === RESEARCH_FRESHNESS.none
  // 改写后跟原来一模一样就别再打一遍 —— 那只是把同一个请求发两次。
  if (sameQuery && alreadyGeneral && noFreshness) return null

  return {
    ...plan,
    sourceGroup: RESEARCH_SOURCE_GROUPS.general,
    freshness: RESEARCH_FRESHNESS.none,
    queries: [{ text: broadened, lang: plan.queries[0]?.lang }],
    reason: 'broadened retry after insufficient evidence',
  }
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

// ─── 入口 ───────────────────────────────────────────────────────

function quotaOutcome(plan: ResearchPlan): ResearchOutcome {
  return {
    receipt: {
      runId: null,
      grounded: false,
      status: RESEARCH_RUN_STATUSES.quotaExceeded,
      perSource: [],
      queries: [],
      evidenceCount: 0,
    },
    evidenceBlock: '',
    items: [],
    plan,
  }
}

/**
 * 跑一轮检索。
 *
 * 返回 `null` = **这轮不检索**（用户关掉了，或规划器判定不需要）—— 不建 run 行、
 * 不出回执，助手照常用自身知识回答。返回对象 = 检索发生过（含超配额与全挂），
 * 回执一定要带回给客户端。
 *
 * **本函数不抛**：检索坏了不该让一次对话失败。
 */
export async function runResearch(
  params: RunResearchParams,
): Promise<ResearchOutcome | null> {
  if (params.mode === RESEARCH_MODES.off) return null

  const forced = params.mode === RESEARCH_MODES.forced
  const baseline = planResearchHeuristically(params.text)
  if (!forced && !baseline.shouldSearch) {
    logger.info('Research skipped by planner', { reason: baseline.reason })
    return null
  }
  // ⚠ 强制模式必须补齐源组和查询，不能只把 shouldSearch 翻成 true ——
  //   `none` 组的源列表是空数组，那样会「一个请求都不发却报 no_evidence」。
  const heuristic = forced ? withForcedSearch(baseline, params.text) : baseline

  // 规划器只在「已经决定要搜」之后才跑 —— 它的活是把查询磨快（按源选语言、
  // 收窄源组），不是当门卫。当门卫意味着每一句「你好」都要先烧一次 LLM 调用。
  const plan = await planResearchWithLlm({
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    text: params.text,
    heuristic,
    forced,
  })

  if (!plan.shouldSearch && !forced) {
    logger.info('Research skipped by llm planner', { reason: plan.reason })
    return null
  }

  const used = await countResearchRunsToday(params.userId).catch(() => 0)
  if (used >= RESEARCH_DAILY_RUN_LIMIT) {
    logger.warn('Research daily quota exceeded', {
      userId: params.userId,
      used,
      limit: RESEARCH_DAILY_RUN_LIMIT,
    })
    return quotaOutcome(plan)
  }

  let effectivePlan = plan
  let { items, receipts } = await fanOut(effectivePlan)
  items = dedupeEvidence(items)

  // 有界二次深化：**恰好一次**。
  if (items.length < RESEARCH_LIMITS.refetchThreshold) {
    for (let round = 0; round < RESEARCH_LIMITS.maxRefetchRounds; round += 1) {
      const broadened = broadenPlan(effectivePlan)
      if (!broadened) break
      const retry = await fanOut(broadened)
      effectivePlan = broadened
      items = dedupeEvidence([...items, ...retry.items])
      receipts = mergeReceipts(receipts, retry.receipts)
      if (items.length >= RESEARCH_LIMITS.refetchThreshold) break
    }
  }

  const sanitized = sanitizeEvidenceItems(items)
  if (sanitized.flaggedCount > 0) {
    logger.warn('Evidence flagged as containing instruction-like text', {
      flaggedCount: sanitized.flaggedCount,
      total: items.length,
    })
  }
  const bounded = sanitized.items.slice(0, RESEARCH_LIMITS.maxEvidenceItems)
  const status = resolveRunStatus(bounded, receipts)
  const grounded = bounded.length > 0

  const runId = await persistRun({
    params,
    plan: effectivePlan,
    items: bounded,
    receipts,
    status,
    grounded,
  })

  return {
    receipt: {
      runId,
      grounded,
      status,
      perSource: receipts,
      queries: effectivePlan.queries.map((query) => query.text),
      evidenceCount: bounded.length,
    },
    evidenceBlock: buildEvidenceBlock(bounded),
    items: bounded,
    plan: effectivePlan,
  }
}

/** 二轮回执合并：同一个源出现两次时，保留信息量更大的那条（有料 > 没料）。 */
function mergeReceipts(
  first: readonly ResearchSourceReceipt[],
  second: readonly ResearchSourceReceipt[],
): ResearchSourceReceipt[] {
  const merged = new Map<ResearchSourceId, ResearchSourceReceipt>()
  for (const receipt of [...first, ...second]) {
    const existing = merged.get(receipt.sourceId)
    if (!existing || receipt.count > existing.count) {
      merged.set(receipt.sourceId, {
        ...receipt,
        tookMs: (existing?.tookMs ?? 0) + receipt.tookMs,
      })
    }
  }
  return [...merged.values()]
}

async function persistRun(input: {
  params: RunResearchParams
  plan: ResearchPlan
  items: EvidenceItem[]
  receipts: ResearchSourceReceipt[]
  status: string
  grounded: boolean
}): Promise<string | null> {
  const firstError = input.receipts.find((receipt) => receipt.error)?.error
  try {
    const run = await db.researchRun.create({
      data: {
        userId: input.params.userId,
        surface: input.params.surface as AssistantSurface,
        projectId: input.params.projectId ?? null,
        conversationId: input.params.conversationId ?? null,
        goal: input.plan.goal,
        query: input.params.text.slice(0, 4000),
        status: input.status,
        grounded: input.grounded,
        evidence: input.items as unknown as Prisma.InputJsonValue,
        perSource: input.receipts as unknown as Prisma.InputJsonValue,
        model: input.params.model ?? null,
        error: firstError ?? null,
        completedAt: new Date(),
      },
      select: { id: true },
    })
    return run.id
  } catch (error) {
    // 落库失败不该让这轮对话失败 —— 证据已经拿到了，回执照发，只是没有 runId
    // 可以回看。大声记一笔，别静静吞掉。
    logger.error('Failed to persist ResearchRun', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
