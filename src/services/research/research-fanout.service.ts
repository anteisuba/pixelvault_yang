import 'server-only'

import {
  ASSISTANT_RESEARCH_CONFIDENCE_IDS,
  ASSISTANT_RESEARCH_LIMITS,
  ASSISTANT_RESEARCH_SCOPE_IDS,
  ASSISTANT_RESEARCH_SOURCE_IDS,
  type AssistantResearchConfidence,
  type AssistantResearchScope,
  type AssistantResearchSource,
} from '@/constants/assistant-operator'
import {
  EVIDENCE_CREDIBILITY_IDS,
  MEDIAWIKI_SOURCE_IDS,
  RESEARCH_CHARACTER_QUERY_SUFFIXES,
  RESEARCH_FRESHNESS,
  RESEARCH_LIMITS,
  RESEARCH_SOURCE_IDS,
  RESEARCH_SOURCE_META,
  RESEARCH_SOURCE_STATUSES,
  judgeEvidenceCredibility,
  type EvidenceCredibility,
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
  includesTermVariant,
  normalizeResearchTerm,
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
  /** 由**发布域名**算出来（`judgeEvidenceCredibility`），⛔ 不由模型写。 */
  confidence: AssistantResearchConfidence
  /** 官方 / 官方转载 / 资料 / 玩家整理 —— 四档的那一档，卡片与工具环都读它。 */
  credibility: EvidenceCredibility
  /** 这一条答的是**这个角色**还是只答了作品。⛔ 不由模型写。 */
  scope: AssistantResearchScope
  /**
   * **几个互相独立的源说了同一件事**（§9.1 ③，commit #16）。⛔ 不由模型写。
   * `1` 就是「单源」——卡上要打标，模型引用时也该说「只有一个来源这么说」。
   */
  corroboration: number
  /** 上游给得出发布时间时原样带上（⛔ 不回落成 `retrievedAt`）。 */
  publishedAt?: string
  /**
   * **证据本编号**（§9.2）——扇出这一层给不出来（它一行库都不碰），由工具环在
   * 拿到号段之后补上。⛔ 别在这个文件里去查号：那就是把库拖进扇出层。
   */
  evidenceRef?: string
}

export interface AssistantResearchOutcome {
  /** 服务端真的发出去的那几条查询 —— 日志上「它到底查了什么」。 */
  queries: string[]
  /** 服务端真的打了哪几组源（模型没指定时由这里挑）。 */
  sources: AssistantResearchSource[]
  evidence: AssistantResearchEvidence[]
  /**
   * 上面那几条证据的**原件**，逐项同序（assistant-shell-v2 §7.3 证据本）。
   *
   * ⭐ 加它的判据只有一条：`evidence` 是**投影**（给模型读的那几栏），而证据本要
   * 存的是能点回原文的那一份 —— `sourceId` / `retrievedAt` / 全文摘录都在原件上，
   * 投影里一个都没有。⛔ 别让证据本去存投影：那样存下来的「证据」下一轮翻出来
   * 与模型这一轮看到的是同一段摘要，翻它就没有意义了。
   * ⚠ 这里仍然**一行库都不碰**：落库那一跳在 `assistant-evidence-book.service`。
   */
  items: EvidenceItem[]
  /** 每个源一条回执。⚠ 「打了但没料」与「源挂了」是两件事，都要说得出来。 */
  receipts: ResearchSourceReceipt[]
}

export interface RunAssistantResearchParams {
  goal: string
  entities?: readonly string[]
  sources?: readonly AssistantResearchSource[]
  /** 最多回几条证据。缺省走 `ASSISTANT_RESEARCH_LIMITS.maxEvidenceItems`。 */
  limit?: number
  /**
   * **改写那一步给的查询词**（§9.1 ①，commit #16）——中 / 英 / 日各一条。
   *
   * ⚠ 给了就**顶掉**确定性查询表里的那几条，⛔ 不是追加：那张表按「作品 + 角色」
   * 拼出来的三条与改写出来的三条问的是同一件事，两份并进去只会把每条查询的名额
   * 摊薄一半（`fetchOne` 按名次轮转取前 N）。
   * ⚠ `wikiQuery` / `character` / `work` **仍旧由确定性那条路算**：wiki 吃的是页名、
   * danbooru 吃的是角色 tag，改写出来的长查询喂给它们只会一条都命不中。
   */
  queries?: readonly string[]
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
 * ── 第一次修的是什么（2026-09-06）──────────────────────────────────
 * 🔬 owner 真机：`entities:['无限大','Ananta','时夜']` 进来，旧实现先拼一条
 * 「全部实体 + 目标」的长查询，再把实体逐个排在后面，最后 `slice(maxQueries=3)`
 * —— **正好把角色名切掉**，而 wiki 腿又取 `queries.at(-1)`，于是三个百科站全被
 * 拿去查「Ananta」。查错了名字，后面每一条证据都是错的。
 *
 * ── 第二次修的是什么（2026-09-07）──────────────────────────────────
 * 🔬 角色名没被切掉了，回来的 10 条**仍然全是游戏本身**。原因是查询的形状：
 * 「无限大」「时夜」「无限大 时夜」三条里，前两条一个查作品一个是通用词，
 * 第三条裸组合的首屏也是官网首页 / 维基条目 / 预约页。**问题不在查没查角色名，
 * 在没问「这个角色是谁」**。本轮实测（同一把 Serper key）：
 *  · 「无限大 时夜 角色 设定」→ 官网角色页 + 百度百科「角色设定」段；
 *  · 「Ananta 时夜 キャラクター」→ 官网日文角色页 + `gamerch.com` 的
 *    「ビジュアル：ダークトーンの髪に赤いメッシュ…」——**外貌那句话只在这条里**。
 *
 * ── 现在的形状 ────────────────────────────────────────────────────
 * 有角色名时，三条**全部是角色级**：作品+角色 / 中文限定 / 日文限定（别名优先，
 * 因为日文圈用的是原名 `Ananta`）。⛔ 不再单发一条只有作品名的查询 —— 作品级的
 * 条目照样会在这三条里出现（实测每条都带官网与维基），少的只是「只答作品」那半屏。
 * ⚠ 没有角色名时退回老形状（作品名 / 目标），⛔ 不编一个角色出来。
 */
export interface ResearchQueryPlan {
  /** 服务端真的发出去的那几条，顺序即优先级。 */
  queries: string[]
  /** wiki 腿吃的那一条 —— **作品 + 角色**，⛔ 不再是 `queries.at(-1)`。 */
  wikiQuery: string
  /** 判相关性 / 解析 Fandom 子站用的实体词（清洗过的原样实体）。 */
  entities: string[]
  /** 第一个实体 = 作品。没给实体时缺席。 */
  work?: string
  /**
   * 最后一个实体 = 角色。**它在不在决定三件事**：查询是不是角色级、danbooru
   * 查的是角色 tag 还是作品 tag、证据的 `scope` 判不判。
   */
  character?: string
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
  /** 中间那些是别名（`Ananta`）—— 日文圈用的就是原名，所以日文那条优先用它。 */
  const alias = cleanEntities.slice(1, -1)[0]

  const ordered =
    combo && character
      ? [
          combo,
          `${combo} ${RESEARCH_CHARACTER_QUERY_SUFFIXES.zh}`,
          `${alias ?? work} ${character} ${RESEARCH_CHARACTER_QUERY_SUFFIXES.ja}`,
        ]
      : [
          work,
          [...cleanEntities, cleanGoal].join(' ').trim(),
          ...cleanEntities.slice(1),
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
    ...(work ? { work } : {}),
    ...(character ? { character } : {}),
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
    /**
     * ⭐ **danbooru 查的是角色，不是作品**（2026-09-07 修）。
     *
     * 🔬 旧实现喂 `queries[0]`，而那一条是**作品名**：「无限大」经
     * `other_names_match` 命中的是 game tag `ananta`，于是回来的「共现标签」是
     * 整部作品 71 张样图的统计（`rabbit_ears 39/71` —— 那是别的角色的耳朵）。
     * 一条长得像答案的假证据，比查不到坏得多。
     * ⚠ 没给角色名时才退回作品名（那时问的本来就是作品）。
     */
    return runConnector(sourceId, () =>
      fetchDanbooruEvidence({
        query: plan.character ?? primary,
        ...(plan.character && plan.work ? { work: plan.work } : {}),
      }),
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

/**
 * 可信度分级 → 卡片上那三档。
 *
 * ⚠ **判据是域名不是源**（2026-09-07 改）：旧实现只看 `sourceTier`，于是
 * `ananta.163.com`（发行方自己的站）与一篇个人整理在卡片上都写着「资料」。
 * 官方那一档必须看得出来，而只有域名说得出「这是谁发的」。
 * ⚠ 四档压成三档是因为卡片只有三档皮肤：官方 → high，官方转载 / 资料 → medium，
 * 玩家整理（含**一切未知域名**）→ low。细的那一档跟着 `credibility` 一起走。
 */
export function confidenceOfCredibility(
  credibility: EvidenceCredibility,
): AssistantResearchConfidence {
  if (credibility === EVIDENCE_CREDIBILITY_IDS.official) {
    return ASSISTANT_RESEARCH_CONFIDENCE_IDS.high
  }
  if (credibility === EVIDENCE_CREDIBILITY_IDS.communityDigest) {
    return ASSISTANT_RESEARCH_CONFIDENCE_IDS.low
  }
  return ASSISTANT_RESEARCH_CONFIDENCE_IDS.medium
}

function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname || undefined
  } catch {
    return undefined
  }
}

/** 一条证据身上所有可以拿来判「说的是不是这个人」的文字。 */
function evidenceText(item: EvidenceItem): string {
  const parts = [item.title, item.url ? safeDecode(item.url) : '']
  if (item.kind === 'text') parts.push(item.excerpt)
  if (item.kind === 'tags') parts.push(item.tags.join(' '), item.provenance)
  return normalizeResearchTerm(parts.join(' '))
}

/** URL 里的中文是百分号编码的（`%E6%97%B6%E5%A4%9C`），不解就判不出角色名。 */
function safeDecode(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

/**
 * 这一条答的是**角色**还是只答了作品（2026-09-07）。
 *
 * ⚠ 判据是「角色名在不在这条证据的字里」—— 标题、摘要 / 标签、URL 三处任一。
 * 官网首页的摘要里出现「时夜 我负责出钱」时它**确实**在说这个角色，所以那条算
 * `character`；只写作品的条目算 `work`。
 * ⚠ 没给角色名时一律 `unknown`：⛔ 不拿一条空判据去标签所有证据（同
 * `isRelevantToTerms` 的纪律）。
 */
export function scopeOfEvidence(
  item: EvidenceItem,
  character: string | undefined,
  forced?: AssistantResearchScope,
): AssistantResearchScope {
  if (forced) return forced
  const term = character ? normalizeResearchTerm(character) : ''
  if (term.length < 2) return ASSISTANT_RESEARCH_SCOPE_IDS.unknown
  return includesTermVariant(evidenceText(item), term)
    ? ASSISTANT_RESEARCH_SCOPE_IDS.character
    : ASSISTANT_RESEARCH_SCOPE_IDS.work
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
  options: {
    /** 判 `scope` 用的角色名。缺省时 `scope` 恒为 `unknown`。 */
    character?: string
    /** 连接器已经确认过是角色级时钉死（danbooru 命中角色 tag 那一支）。 */
    forcedScope?: AssistantResearchScope
    /** 几个源说了同一件事（§9.1 ③）。缺省 `1` = 单源。 */
    corroboration?: number
  } = {},
): AssistantResearchEvidence {
  const publisher = hostnameOf(item.url) ?? item.sourceId.replace(/_/g, ' ')
  const credibility = judgeEvidenceCredibility(item.url)
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
    confidence: confidenceOfCredibility(credibility),
    credibility,
    scope: scopeOfEvidence(item, options.character, options.forcedScope),
    corroboration: Math.max(1, options.corroboration ?? 1),
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
  }
}

/**
 * 一条证据的**事实键** —— 判「两条说的是不是同一件事」。
 *
 * ⚠ 判据是**标题**，而且刻意保守：宁可把真的互相印证的两条判成两件事（各写
 * 「单源」），也不能把两条不相干的判成印证 —— 卡上那个「2 源印证」是用户拿来
 * 决定信不信的，虚高一次就再也不值钱了。
 * ⚠ 去掉 `bilibili · ` 这类源前缀：它是连接器加的装饰，不是标题的一部分。
 */
function factKeyOf(item: EvidenceItem): string {
  const stripped = item.title.replace(/^[^·]{1,16}·\s*/, '')
  return normalizeResearchTerm(stripped)
}

/**
 * **印证源数**（§9.1 ③）——同一事实被几个**互相独立的源**说过。
 *
 * ⚠ 数的是**去重前**的那一堆：`dedupe` 的全部工作就是把同一条留一份，在它之后
 * 数永远数出 1。
 * ⚠ 「独立」的判据是**域名**（取不到时退回 `sourceId`）：萌百与中文维基是两个域名
 * 所以算两个，同一个站的两页只算一个 —— 一个站自己说两遍不是印证。
 */
export function countCorroboration(
  items: readonly EvidenceItem[],
): Map<string, number> {
  const sourcesByKey = new Map<string, Set<string>>()
  for (const item of items) {
    const key = factKeyOf(item)
    if (!key) continue
    const source = hostnameOf(item.url) ?? item.sourceId
    const bucket = sourcesByKey.get(key)
    if (bucket) bucket.add(source)
    else sourcesByKey.set(key, new Set([source]))
  }
  return new Map(
    [...sourcesByKey.entries()].map(([key, sources]) => [key, sources.size]),
  )
}

/**
 * **结论一行**（§9.1 ④）——印证最多、层级最高的那一条怎么说。
 *
 * ⛔ **不另烧一次 LLM**：卡上那句话必须与下面列出来的来源逐字对得上，而一次
 * 自由生成对不上（同一份证据两次给出两句不同的结论，用户会以为查了两次）。
 * ⚠ 只从 `text` 档里挑：标签串（`粉发, 金瞳`）与图片占位不是一句可以读的话。
 */
export function summarizeResearchConclusion(
  evidence: readonly AssistantResearchEvidence[],
): string | undefined {
  const readable = evidence.filter(
    (item) => item.kind === 'text' && item.snippet.trim().length > 0,
  )
  if (readable.length === 0) return undefined
  const best = [...readable].sort((a, b) => {
    if (a.corroboration !== b.corroboration) {
      return b.corroboration - a.corroboration
    }
    return (
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
      SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]
    )
  })[0]
  return best?.snippet.slice(
    0,
    ASSISTANT_RESEARCH_LIMITS.maxEvidenceSnippetChars,
  )
}

/** 排序用的权重表（小 = 排前）。⛔ 不参与任何显示。 */
const CONFIDENCE_RANK: Record<AssistantResearchConfidence, number> = {
  [ASSISTANT_RESEARCH_CONFIDENCE_IDS.high]: 0,
  [ASSISTANT_RESEARCH_CONFIDENCE_IDS.medium]: 1,
  [ASSISTANT_RESEARCH_CONFIDENCE_IDS.low]: 2,
}

const SCOPE_RANK: Record<AssistantResearchScope, number> = {
  [ASSISTANT_RESEARCH_SCOPE_IDS.character]: 0,
  [ASSISTANT_RESEARCH_SCOPE_IDS.work]: 1,
  [ASSISTANT_RESEARCH_SCOPE_IDS.unknown]: 2,
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
  const deterministic = buildResearchQueryPlan(
    params.goal,
    params.entities ?? [],
  )
  /**
   * ⚠ 改写那一步给的查询**顶掉**确定性那几条，其余（wiki 页名、角色、作品）
   * 原样留着 —— 见 `RunAssistantResearchParams.queries` 的头注。
   */
  const plan: ResearchQueryPlan =
    params.queries && params.queries.length > 0
      ? {
          ...deterministic,
          queries: [...params.queries].slice(0, RESEARCH_LIMITS.maxQueries),
        }
      : deterministic
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

  const fetched = settled.flatMap((entry) => entry.items)
  /**
   * ⭐ **印证多的排前**（§9.1 ③）——排序本身就是判断力，不该交给用户逐条读。
   * ⚠ 印证数在**去重前**算，排序在去重后做，截断（`slice`）落在最后：⛔ 别先截
   * 再排，那会让第 9 条的「3 源印证」被一条单源的挤掉。
   */
  const corroboration = countCorroboration(fetched)
  const corroborationOf = (item: EvidenceItem): number =>
    corroboration.get(factKeyOf(item)) ?? 1
  const items = dedupe(fetched)
    .sort((a, b) => corroborationOf(b) - corroborationOf(a))
    .slice(0, limit)

  return {
    queries: plan.queries,
    sources: groups,
    items,
    /**
     * ⚠ danbooru 那一支**钉死角色级**：它现在只在确认到角色 tag（且该 tag 与
     * 作品共现）时才出证据，而那些证据的字面是英文 tag（`ichinose_tokiya`），
     * 中文角色名永远匹配不上 —— 让文本判据去判它只会把真的角色证据判成作品级。
     */
    evidence: items.map((item) =>
      toAssistantEvidence(item, {
        ...(plan.character ? { character: plan.character } : {}),
        ...(plan.character && item.sourceId === RESEARCH_SOURCE_IDS.danbooru
          ? { forcedScope: ASSISTANT_RESEARCH_SCOPE_IDS.character }
          : {}),
        corroboration: corroborationOf(item),
      }),
    ),
    receipts: settled.map((entry) => entry.receipt),
  }
}
