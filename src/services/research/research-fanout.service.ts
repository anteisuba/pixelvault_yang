import 'server-only'

import {
  ASSISTANT_RESEARCH_CONFIDENCE_IDS,
  ASSISTANT_RESEARCH_LIMITS,
  ASSISTANT_RESEARCH_SOURCE_IDS,
  type AssistantResearchConfidence,
  type AssistantResearchSource,
} from '@/constants/assistant-operator'
import {
  EVIDENCE_SOURCE_TIERS,
  MEDIAWIKI_SITES,
  RESEARCH_FRESHNESS,
  RESEARCH_LIMITS,
  RESEARCH_SOURCE_IDS,
  RESEARCH_SOURCE_META,
  RESEARCH_SOURCE_STATUSES,
  type ResearchSourceId,
} from '@/constants/research'
import type { EvidenceItem, ResearchSourceReceipt } from '@/types/research'
import { fetchBilibiliEvidence } from '@/services/research/bilibili.connector'
import {
  runConnector,
  skippedReceipt,
} from '@/services/research/connector-runtime'
import { fetchDanbooruEvidence } from '@/services/research/danbooru.connector'
import { fetchMediaWikiEvidence } from '@/services/research/mediawiki.connector'
import { fetchWebSearchEvidence } from '@/services/research/web-search.connector'

/**
 * **助手工具环用的检索扇出**（2026-09-06）。
 *
 * ── 为什么它不是 `research-run.service` ────────────────────────────
 * 那一条是**一整轮研究**：读配额、落 `ResearchRun`、拼证据块给写作模型。它 import
 * `@/lib/db`，而助手工具环那份钱闸（`assistant-operator.money-gate.test.ts`）里
 * `from '@/lib/db'` 是禁字 —— 不是洁癖：那条禁令挡的是「工具环里长出第二条查库/
 * 写库的路」，而检索这件事一行库都不需要碰。
 *
 * 所以这里只取**扇出那一段**：规划好的查询 → 并行打连接器 → 归并 → 投影成助手
 * 读得懂的证据条。连接器本身（`*.connector.ts`）一个字都没改，也一行 db 都不碰。
 * ⛔ 别为了「复用」把 `research-run.service` import 进来：那等于把 db 拖进工具环
 * 的模块图，钱闸那道结构性证明当场破一半。
 *
 * ── 与 `search_web` 的分工 ────────────────────────────────────────
 * `search_web` 是一条 Google 查询出一串摘要。这里是**几个源同时打**：萌百的分类
 * 直出「粉发 · 金瞳 · 下双马尾」这种已结构化的外观词，danbooru 的共现标签同理 ——
 * 那正是一条通用搜索摘要永远给不出、而提示词恰恰要的东西。
 */

export interface AssistantResearchEvidence {
  title: string
  url?: string
  /** 谁说的。⚠ **必填** —— 取不到站名时回落成域名，⛔ 不留空。 */
  publisher: string
  snippet: string
  kind: EvidenceItem['kind']
  /** 由源的层级算出来，⛔ 不由模型写。 */
  confidence: AssistantResearchConfidence
}

export interface AssistantResearchOutcome {
  /** 服务端真的发出去的那几条查询 —— 日志上「它到底查了什么」。 */
  queries: string[]
  /** 服务端真的打了哪几组源（模型没指定时由这里挑）。 */
  sources: AssistantResearchSource[]
  evidence: AssistantResearchEvidence[]
  /** 每个源一条回执。⚠ 「打了但没料」与「源挂了」是两件事，都要说得出来。 */
  receipts: ResearchSourceReceipt[]
}

export interface RunAssistantResearchParams {
  goal: string
  entities?: readonly string[]
  sources?: readonly AssistantResearchSource[]
  /** 最多回几条证据。缺省走 `ASSISTANT_RESEARCH_LIMITS.maxEvidenceItems`。 */
  limit?: number
}

// ─── 源分组 ─────────────────────────────────────────────────────

/**
 * 粗粒度分组 → 真源。
 *
 * ⚠ `wiki` 一次打三个站是有理由的：同一个角色在萌百是简体、在中文维基可能是
 * 繁体条目、在 Fandom 是英文页 —— 让模型去猜「哪个站收录了它」是让它猜一件它
 * 不可能知道的事，而三个站并行只多两次 HTTP，一个 credit 都不花。
 */
const SOURCE_GROUP_MEMBERS: Record<
  AssistantResearchSource,
  readonly ResearchSourceId[]
> = {
  [ASSISTANT_RESEARCH_SOURCE_IDS.web]: [RESEARCH_SOURCE_IDS.webSearch],
  [ASSISTANT_RESEARCH_SOURCE_IDS.wiki]: MEDIAWIKI_SITES.map(
    (site) => site.sourceId,
  ),
  [ASSISTANT_RESEARCH_SOURCE_IDS.bilibili]: [RESEARCH_SOURCE_IDS.bilibili],
  [ASSISTANT_RESEARCH_SOURCE_IDS.danbooru]: [RESEARCH_SOURCE_IDS.danbooru],
}

/**
 * 模型没说打哪儿时的默认组合。
 *
 * ⚠ 默认里**有 danbooru**：它是这条链上唯一一个直接给出「外观标签」的源，而
 * owner 的用例（角色的外貌服饰）正是它最强的题。默认里**没有 B站**：视频标题
 * 与简介对「她穿什么」几乎没有信息量，却要多一次请求。要它就明说。
 */
const DEFAULT_SOURCES: readonly AssistantResearchSource[] = [
  ASSISTANT_RESEARCH_SOURCE_IDS.wiki,
  ASSISTANT_RESEARCH_SOURCE_IDS.web,
  ASSISTANT_RESEARCH_SOURCE_IDS.danbooru,
]

// ─── 查询 ───────────────────────────────────────────────────────

/**
 * 目标 + 实体 → 几条查询。
 *
 * 形状是刻意的：**第一条是「实体 + 目标」**（`时夜 无限大 外貌 服饰`），因为
 * 通用网搜吃的就是这种带限定词的长查询；**后面几条是单个实体**，因为 wiki 的
 * 标题解析吃的恰恰相反 —— 一个干净的页名。两种需求塞进同一条查询，两边都查不准。
 *
 * ⚠ 没有实体时只发目标本身，⛔ 不编一个实体出来。
 */
export function buildResearchQueries(
  goal: string,
  entities: readonly string[],
): string[] {
  const cleanEntities = entities
    .map((entity) => entity.trim())
    .filter((entity) => entity.length > 0)
  const cleanGoal = goal.trim()

  const queries: string[] = []
  const primary = [...cleanEntities, cleanGoal].join(' ').trim()
  if (primary) queries.push(primary)
  for (const entity of cleanEntities) {
    if (!queries.includes(entity)) queries.push(entity)
  }
  if (queries.length === 0 && cleanGoal) queries.push(cleanGoal)

  return queries.slice(0, RESEARCH_LIMITS.maxQueries)
}

// ─── 打源 ───────────────────────────────────────────────────────

async function fetchOne(
  sourceId: ResearchSourceId,
  queries: readonly string[],
): Promise<{ items: EvidenceItem[]; receipt: ResearchSourceReceipt }> {
  const primary = queries[0] ?? ''
  if (!primary) {
    return { items: [], receipt: skippedReceipt(sourceId, 'no query') }
  }

  if (sourceId === RESEARCH_SOURCE_IDS.webSearch) {
    return runConnector(sourceId, () =>
      fetchWebSearchEvidence({
        queries,
        // ⚠ 角色设定是**稳定事实**，加时间窗会把官方资料页整片过滤掉。
        freshness: RESEARCH_FRESHNESS.none,
      }),
    )
  }

  if (sourceId === RESEARCH_SOURCE_IDS.danbooru) {
    return runConnector(sourceId, () =>
      fetchDanbooruEvidence({ query: primary }),
    )
  }

  if (sourceId === RESEARCH_SOURCE_IDS.bilibili) {
    return runConnector(sourceId, () =>
      fetchBilibiliEvidence({ query: primary }),
    )
  }

  const site = MEDIAWIKI_SITES.find((entry) => entry.sourceId === sourceId)
  if (site) {
    /**
     * ⚠ wiki 吃的是**页名**不是长查询：这里挑最后一条（`buildResearchQueries`
     * 把单个实体排在后面），退回第一条只是为了「没有实体」那种形状也能跑。
     */
    const query = queries.at(-1) ?? primary
    return runConnector(sourceId, () => fetchMediaWikiEvidence({ site, query }))
  }

  return { items: [], receipt: skippedReceipt(sourceId, 'unknown source') }
}

/**
 * 整轮墙钟硬闸 —— 与 `research-run.service` 同一条论据：每个源自己有超时，但
 * **并行不等于有界**，慢源必须被抛下，并如实记成 `failed`（⛔ 不是 `empty`，
 * 「超时了」和「没料」是两件事）。
 */
function withDeadline(
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

// ─── 归并与投影 ─────────────────────────────────────────────────

/**
 * 同一事实多源命中 → **权威层优先留**。
 *
 * ⚠ 判据是 `kind + url`：同一个页面的正文和标签是两条不同的证据，不能互相盖掉。
 * ⚠ 这段与 `research-run.service.dedupeEvidence` 同形而**没有共用**——共用要 import
 * 那个模块，而它 import 了 db（见文件头注）。十几行的重复换一道守得住的闸，划算。
 */
function dedupe(items: readonly EvidenceItem[]): EvidenceItem[] {
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

/** 源层级 → 置信度。⛔ 模型碰不到这三个字。 */
export function confidenceOfTier(
  tier: EvidenceItem['sourceTier'],
): AssistantResearchConfidence {
  if (tier === EVIDENCE_SOURCE_TIERS.official) {
    return ASSISTANT_RESEARCH_CONFIDENCE_IDS.high
  }
  if (tier === EVIDENCE_SOURCE_TIERS.community) {
    return ASSISTANT_RESEARCH_CONFIDENCE_IDS.medium
  }
  return ASSISTANT_RESEARCH_CONFIDENCE_IDS.low
}

function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname || undefined
  } catch {
    return undefined
  }
}

/**
 * 一条 `EvidenceItem` → 助手读得懂的证据条。
 *
 * ⚠ `image` 那一档的 `snippet` **有意不放图片地址**：候选图走
 * `search_web_images` + 用户点「选用」那条路（拍板 21），把一条能直接粘的图片
 * 地址喂给模型，它下一步就会试着把那串地址写进提示词或参考位。
 */
export function toAssistantEvidence(
  item: EvidenceItem,
): AssistantResearchEvidence {
  const publisher = hostnameOf(item.url) ?? item.sourceId.replace(/_/g, ' ')
  const snippet =
    item.kind === 'text'
      ? item.excerpt
      : item.kind === 'tags'
        ? `${item.provenance}: ${item.tags.join(', ')}`
        : `image on this page${item.width && item.height ? ` (${item.width}×${item.height})` : ''}`

  return {
    title: item.title.slice(0, ASSISTANT_RESEARCH_LIMITS.maxEvidenceTitleChars),
    ...(item.url ? { url: item.url } : {}),
    publisher: publisher.slice(
      0,
      ASSISTANT_RESEARCH_LIMITS.maxEvidencePublisherChars,
    ),
    snippet: snippet.slice(
      0,
      ASSISTANT_RESEARCH_LIMITS.maxEvidenceSnippetChars,
    ),
    kind: item.kind,
    confidence: confidenceOfTier(item.sourceTier),
  }
}

// ─── 入口 ───────────────────────────────────────────────────────

/**
 * 跑一次扇出。**任何情况下都不抛** —— 单源失败只落成一条回执，与
 * `research-run.service` 同一条契约（工具环里一步抛出去的表现是整轮跑到一半消失）。
 */
export async function runAssistantResearch(
  params: RunAssistantResearchParams,
): Promise<AssistantResearchOutcome> {
  const groups =
    params.sources && params.sources.length > 0
      ? [...new Set(params.sources)]
      : [...DEFAULT_SOURCES]
  const queries = buildResearchQueries(params.goal, params.entities ?? [])
  const sourceIds = [
    ...new Set(groups.flatMap((group) => SOURCE_GROUP_MEMBERS[group])),
  ]

  const settled = await Promise.all(
    sourceIds.map((sourceId) =>
      withDeadline(sourceId, fetchOne(sourceId, queries)),
    ),
  )

  const limit = Math.min(
    params.limit ?? ASSISTANT_RESEARCH_LIMITS.maxEvidenceItems,
    ASSISTANT_RESEARCH_LIMITS.maxEvidenceItems,
  )

  return {
    queries,
    sources: groups,
    evidence: dedupe(settled.flatMap((entry) => entry.items))
      .slice(0, limit)
      .map(toAssistantEvidence),
    receipts: settled.map((entry) => entry.receipt),
  }
}
