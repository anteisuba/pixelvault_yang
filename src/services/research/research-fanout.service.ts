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
  MEDIAWIKI_SOURCE_IDS,
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
import {
  fetchMediaWikiEvidence,
  getMediaWikiSite,
  resolveFandomSite,
} from '@/services/research/mediawiki.connector'
import { fetchWebSearchEvidence } from '@/services/research/web-search.connector'
import { isWebSearchConfigured } from '@/services/web-research.service'

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
  [ASSISTANT_RESEARCH_SOURCE_IDS.wiki]: MEDIAWIKI_SOURCE_IDS,
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
 * 目标 + 实体 → 一份**查询计划**。
 *
 * ── 修的是什么（2026-09-06）────────────────────────────────────────
 * 🔬 owner 真机：`entities:['无限大','Ananta','时夜']` 进来，旧实现先拼一条
 * 「全部实体 + 目标」的长查询，再把实体逐个排在后面，最后 `slice(maxQueries=3)`
 * —— **正好把角色名切掉**，而 wiki 腿又取 `queries.at(-1)`，于是三个百科站全被
 * 拿去查「Ananta」。查错了名字，后面每一条证据都是错的。
 *
 * ── 现在的形状 ────────────────────────────────────────────────────
 * 前三条是**保底**：作品名 / 角色名 / 作品+角色。它们是三种源各自吃得下的形状 ——
 * 单名喂 wiki 的标题解析、组合喂网搜与消歧。带目标的长查询与其余别名排在后面，
 * 有位置才发。⛔ 别再让「截断」决定查什么。
 *
 * ⚠ 没有实体时只发目标本身，⛔ 不编一个实体出来。
 */
export interface ResearchQueryPlan {
  /** 服务端真的发出去的那几条，顺序即优先级。 */
  queries: string[]
  /** wiki 腿吃的那一条 —— **作品 + 角色**，⛔ 不再是 `queries.at(-1)`。 */
  wikiQuery: string
  /** 判相关性 / 解析 Fandom 子站用的实体词（清洗过的原样实体）。 */
  entities: string[]
}

export function buildResearchQueryPlan(
  goal: string,
  entities: readonly string[],
): ResearchQueryPlan {
  const cleanEntities = entities
    .map((entity) => entity.trim())
    .filter((entity) => entity.length > 0)
  const cleanGoal = goal.trim()

  // ⚠ 约定：第一个实体是**作品**，最后一个是**角色**（工具说明里写死这条顺序）。
  const work = cleanEntities[0]
  const character =
    cleanEntities.length >= 2
      ? cleanEntities[cleanEntities.length - 1]
      : undefined
  const combo = work && character ? `${work} ${character}` : undefined

  const ordered = [
    work,
    character,
    combo,
    [...cleanEntities, cleanGoal].join(' ').trim(),
    ...cleanEntities.slice(1, -1),
    cleanGoal,
  ]

  const queries: string[] = []
  for (const candidate of ordered) {
    const text = candidate?.trim()
    if (!text || queries.includes(text)) continue
    queries.push(text)
  }

  return {
    queries: queries.slice(0, RESEARCH_LIMITS.maxQueries),
    wikiQuery: combo ?? work ?? cleanGoal,
    entities: cleanEntities,
  }
}

// ─── 打源 ───────────────────────────────────────────────────────

async function fetchOne(
  sourceId: ResearchSourceId,
  plan: ResearchQueryPlan,
): Promise<{ items: EvidenceItem[]; receipt: ResearchSourceReceipt }> {
  const { queries } = plan
  const primary = queries[0] ?? ''
  if (!primary) {
    return { items: [], receipt: skippedReceipt(sourceId, 'no query') }
  }

  if (sourceId === RESEARCH_SOURCE_IDS.webSearch) {
    /**
     * ⭐ **缺 Serper 只关掉这一个源**（2026-09-06 修）。
     *
     * 🔬 这道闸原先长在工具入口上（`isWebSearchConfigured()` 不成就整条
     * `research` 拒），于是没配 Serper 的部署连**免 key 的**萌百 / 中文维基 /
     * Fandom / danbooru / B站一起关掉了 —— 一把钥匙锁了五扇本来就没上锁的门。
     * 现在只把这一条标 `skipped`，回执里说得出是为什么。
     */
    if (!isWebSearchConfigured()) {
      return {
        items: [],
        receipt: skippedReceipt(sourceId, 'missing SERPER_API_KEY'),
      }
    }
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

  if (sourceId === RESEARCH_SOURCE_IDS.fandom) {
    /**
     * ⭐ **Fandom 按作品解析 host**（2026-09-06 修）。以前这里的 host 硬编码成
     * `wutheringwaves.fandom.com` —— 问什么题材都回鸣潮的条目，而那条假证据长得
     * 跟真的一模一样。表里没有的作品**直接跳过**，⛔ 不退回任何一个具体子域。
     */
    const site = resolveFandomSite(plan.entities)
    if (!site) {
      return {
        items: [],
        receipt: skippedReceipt(sourceId, 'no fandom site'),
      }
    }
    return runConnector(sourceId, () =>
      fetchMediaWikiEvidence({
        site,
        query: plan.wikiQuery,
        entities: plan.entities,
      }),
    )
  }

  const site = getMediaWikiSite(sourceId)
  if (site) {
    /**
     * ⚠ wiki 吃的是**页名**不是长查询，而且必须是「作品 + 角色」那一条 ——
     * 取 `queries.at(-1)` 的旧写法会随查询表的截断漂到别名上（见
     * `buildResearchQueryPlan` 头注）。
     */
    return runConnector(sourceId, () =>
      fetchMediaWikiEvidence({
        site,
        query: plan.wikiQuery,
        entities: plan.entities,
      }),
    )
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
  const plan = buildResearchQueryPlan(params.goal, params.entities ?? [])
  const sourceIds = [
    ...new Set(groups.flatMap((group) => SOURCE_GROUP_MEMBERS[group])),
  ]

  const settled = await Promise.all(
    sourceIds.map((sourceId) =>
      withDeadline(sourceId, fetchOne(sourceId, plan)),
    ),
  )

  const limit = Math.min(
    params.limit ?? ASSISTANT_RESEARCH_LIMITS.maxEvidenceItems,
    ASSISTANT_RESEARCH_LIMITS.maxEvidenceItems,
  )

  return {
    queries: plan.queries,
    sources: groups,
    evidence: dedupe(settled.flatMap((entry) => entry.items))
      .slice(0, limit)
      .map(toAssistantEvidence),
    receipts: settled.map((entry) => entry.receipt),
  }
}
