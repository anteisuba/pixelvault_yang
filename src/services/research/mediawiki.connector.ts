import 'server-only'

import {
  buildFandomSite,
  FANDOM_WIKIS,
  MEDIAWIKI_CONTENT_ROUTES,
  MEDIAWIKI_SITES,
  RESEARCH_LIMITS,
  RESEARCH_SOURCE_IDS,
  type MediaWikiSiteCapability,
  type ResearchSourceId,
} from '@/constants/research'
import { logger } from '@/lib/logger'
import type { EvidenceItem } from '@/types/research'
import type { ResearchQuery } from '@/types/research'
import {
  clampExcerpt,
  evidenceId,
  evidenceTier,
  researchFetchJson,
  ResearchSourceError,
  type ConnectorResult,
} from '@/services/research/connector-runtime'

/**
 * MediaWiki 家族连接器（萌娘百科 / 维基百科中文 / Fandom）。
 *
 * ⚠ **传输层同构，能力层不同构**（切片 0 实测）。所以这里没有「一条取正文的路」，
 * 只有**按站能力表 + 降级链**——表在 `constants/research.ts` 的 `MEDIAWIKI_SITES`，
 * 逐格照抄实测结果：
 *
 * | 站 | 搜索 | 正文 | 额外 |
 * | --- | --- | --- | --- |
 * | 萌百 | opensearch + generator=search（⛔ `list=search` 被封） | extracts | categories → `kind:'tags'` · pageimages → `kind:'image'` |
 * | zhwiki | opensearch | extracts | —— |
 * | Fandom | opensearch | revisions → parse（未装 TextExtracts） | —— |
 *
 * 另外两条实现前提，两条都踩过：
 *
 * 1. ⚠ **MediaWiki 的「拒绝」是 HTTP 200 + body 里的 `error.code`**（如
 *    `action-notallowed`），不是 4xx。只看状态码会把「这个源被封了」（=failed，
 *    该换源）当成「查到了空结果」（=no_evidence，该告诉用户没搜到）。
 * 2. ⚠ **页名按站各自解析**：zh.wikipedia 上「鸣潮」不存在，条目是繁体「鳴潮」；
 *    萌百是简体。跨站查同一个 IP 必须各自过一次 opensearch，不能拿一个页名打全族。
 */

// ─── MediaWiki 响应形状（只挑用得上的字段，多余的忽略）───────────

interface MediaWikiError {
  error?: { code?: string; info?: string }
}

interface MediaWikiPage {
  pageid?: number
  title?: string
  missing?: boolean
  index?: number
  extract?: string
  categories?: { title?: string }[]
  original?: { source?: string; width?: number; height?: number }
  revisions?: { slots?: { main?: { content?: string } } }[]
}

interface MediaWikiQueryResponse extends MediaWikiError {
  query?: { pages?: MediaWikiPage[] }
}

interface MediaWikiParseResponse extends MediaWikiError {
  parse?: { title?: string; wikitext?: string }
}

type OpenSearchResponse = [string, string[], string[], string[]]

/**
 * 把 MediaWiki 的「200 + error.code」翻成真正的失败。
 * **这是 §3.4 第 1 闸在连接器侧的落点**，每个请求都要过。
 */
function assertNoMediaWikiError(
  sourceId: ResearchSourceId,
  payload: MediaWikiError,
): void {
  const code = payload?.error?.code
  if (!code) return
  throw new ResearchSourceError(
    sourceId,
    `MediaWiki rejected the call: ${code}${
      payload.error?.info ? ` — ${payload.error.info}` : ''
    }`,
  )
}

function buildApiUrl(
  site: MediaWikiSiteCapability,
  params: Record<string, string>,
): string {
  const search = new URLSearchParams({ format: 'json', ...params })
  return `${site.api}?${search.toString()}`
}

function pageUrl(site: MediaWikiSiteCapability, title: string): string {
  return `${site.pageUrlPrefix}${encodeURIComponent(title.replace(/ /g, '_'))}`
}

// ─── 页名解析：opensearch → generator=search ────────────────────

async function resolveTitle(
  site: MediaWikiSiteCapability,
  query: string,
): Promise<string | null> {
  if (site.supportsOpenSearch) {
    const payload = await researchFetchJson<
      OpenSearchResponse | MediaWikiError
    >(
      site.sourceId,
      buildApiUrl(site, { action: 'opensearch', search: query, limit: '5' }),
      { timeoutMs: RESEARCH_LIMITS.mediaWikiTimeoutMs },
    )
    // opensearch 出的是数组；出对象只可能是 error 信封。
    if (!Array.isArray(payload)) {
      assertNoMediaWikiError(site.sourceId, payload)
    } else {
      const title = payload[1]?.[0]
      if (title) return title
    }
  }

  if (!site.supportsGeneratorSearch) return null

  // ⛔ 这里用的是 `generator=search`，**不是** `list=search`。萌百把标准写法封了，
  //    照 MediaWiki 官方文档写会得到 action-notallowed。
  const payload = await researchFetchJson<MediaWikiQueryResponse>(
    site.sourceId,
    buildApiUrl(site, {
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '5',
      formatversion: '2',
    }),
    { timeoutMs: RESEARCH_LIMITS.mediaWikiTimeoutMs },
  )
  assertNoMediaWikiError(site.sourceId, payload)

  const pages = payload.query?.pages ?? []
  // generator 出的 pages 不按相关性排序，`index` 才是搜索名次。
  const best = [...pages].sort(
    (a, b) =>
      (a.index ?? Number.MAX_SAFE_INTEGER) -
      (b.index ?? Number.MAX_SAFE_INTEGER),
  )[0]
  return best?.title ?? null
}

// ─── 正文：按站降级链 ───────────────────────────────────────────

/** wikitext → 可读摘录。只做最低限度的去标记，够当证据引文即可。 */
function flattenWikitext(wikitext: string): string {
  return wikitext
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[\[(?:File|Image|文件|档案):[^\]]*\]\]/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface MediaWikiDetail {
  title: string
  text?: string
  categories: string[]
  image?: { url: string; width?: number; height?: number }
}

async function fetchDetail(
  site: MediaWikiSiteCapability,
  title: string,
): Promise<MediaWikiDetail> {
  const detail: MediaWikiDetail = { title, categories: [] }

  for (const route of site.contentRoutes) {
    try {
      if (route === MEDIAWIKI_CONTENT_ROUTES.extracts) {
        // 萌百可以把 extracts / categories / pageimages 合成一次请求（实测通）。
        // ⚠ 不加 `exintro` —— 长离的 intro 只有 20 字，全文 2775 字。
        const props = ['extracts']
        if (site.supportsCategories) props.push('categories')
        if (site.supportsPageImages) props.push('pageimages')

        const payload = await researchFetchJson<MediaWikiQueryResponse>(
          site.sourceId,
          buildApiUrl(site, {
            action: 'query',
            prop: props.join('|'),
            explaintext: '1',
            redirects: '1',
            titles: title,
            formatversion: '2',
            ...(site.supportsCategories
              ? { cllimit: '500', clshow: '!hidden' }
              : {}),
            ...(site.supportsPageImages ? { piprop: 'original' } : {}),
          }),
          { timeoutMs: RESEARCH_LIMITS.mediaWikiTimeoutMs },
        )
        assertNoMediaWikiError(site.sourceId, payload)
        const page = payload.query?.pages?.[0]
        if (page?.missing) return detail
        if (page?.title) detail.title = page.title
        if (page?.extract) detail.text = page.extract
        detail.categories = (page?.categories ?? [])
          .map((entry) => entry.title?.replace(/^Category:/i, '') ?? '')
          .filter(Boolean)
        if (page?.original?.source) {
          detail.image = {
            url: page.original.source,
            ...(page.original.width ? { width: page.original.width } : {}),
            ...(page.original.height ? { height: page.original.height } : {}),
          }
        }
      } else if (route === MEDIAWIKI_CONTENT_ROUTES.revisions) {
        const payload = await researchFetchJson<MediaWikiQueryResponse>(
          site.sourceId,
          buildApiUrl(site, {
            action: 'query',
            prop: 'revisions',
            rvprop: 'content',
            rvslots: 'main',
            redirects: '1',
            titles: title,
            formatversion: '2',
          }),
          { timeoutMs: RESEARCH_LIMITS.mediaWikiTimeoutMs },
        )
        assertNoMediaWikiError(site.sourceId, payload)
        const page = payload.query?.pages?.[0]
        if (page?.missing) return detail
        if (page?.title) detail.title = page.title
        const content = page?.revisions?.[0]?.slots?.main?.content
        if (content) detail.text = flattenWikitext(content)
      } else {
        const payload = await researchFetchJson<MediaWikiParseResponse>(
          site.sourceId,
          buildApiUrl(site, {
            action: 'parse',
            page: title,
            prop: 'wikitext',
            formatversion: '2',
          }),
          { timeoutMs: RESEARCH_LIMITS.mediaWikiTimeoutMs },
        )
        assertNoMediaWikiError(site.sourceId, payload)
        if (payload.parse?.title) detail.title = payload.parse.title
        if (payload.parse?.wikitext) {
          detail.text = flattenWikitext(payload.parse.wikitext)
        }
      }

      if (detail.text) return detail
    } catch (error) {
      // 降级链的意义就在这：这条路被封了就走下一条，全封了才算这个源坏了。
      logger.info('MediaWiki content route unavailable, degrading', {
        sourceId: site.sourceId,
        route,
        error: error instanceof Error ? error.message : String(error),
      })
      if (route === site.contentRoutes[site.contentRoutes.length - 1])
        throw error
    }
  }

  return detail
}

// ─── 公开入口 ───────────────────────────────────────────────────

export function getMediaWikiSite(
  sourceId: ResearchSourceId,
): MediaWikiSiteCapability | undefined {
  return MEDIAWIKI_SITES.find((site) => site.sourceId === sourceId)
}

// ─── 归一化与相关性 ─────────────────────────────────────────────

/**
 * 比对用的归一化：全角→半角（NFKC）、小写、去掉空白与标点。
 *
 * ⚠ **不做简繁转换**：本仓没有现成的转换表，硬塞一张手抄的表迟早漂。单字差异
 * 由下面 `sameShapeVariant` 的一位容差兜住（「鸣潮」↔「鳴潮」正是这一类），
 * ⛔ 别把它扩成「差几个字都算」—— 那就等于没有这道闸。
 */
export function normalizeResearchTerm(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(
      /[·・．.,，、:：;；!！?？'"'"“”「」『』()（）\[\]【】<>《》\/\\_-]+/g,
      '',
    )
}

/**
 * 同长、至多差一个字符 —— 简繁异体的形状（「鸣潮」/「鳴潮」）。
 * ⚠ 只在长度 ≥ 2 时启用：一个字的「至多差一个」就是「随便什么字都行」。
 */
function sameShapeVariant(a: string, b: string): boolean {
  if (a.length < 2 || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i] && (diff += 1) > 1) return false
  }
  return diff === 1
}

/** 查询串 → 比对用的实体词（空白切分，⛔ 不切 CJK：那要分词器）。 */
export function researchTermsOf(
  query: string,
  entities: readonly string[] = [],
): string[] {
  const raw = entities.length > 0 ? [...entities] : query.split(/[\s\u3000]+/)
  const terms = raw
    .map((term) => normalizeResearchTerm(term))
    // 一个字的实体做不了判据（「时」能命中半个中文维基）。
    .filter((term) => term.length >= 2)
  return [...new Set(terms)]
}

/**
 * **搜到的到底是不是它**（2026-09-06 新增的第三态）。
 *
 * 🔬 owner 真机：查「无限大 时夜」，三个 wiki 的模糊搜索分别把《时之歌》《夜王》
 * 《鸣潮》当第一条返回 —— 而连接器一律当 `ok` 交了出去。**模糊搜索永远有第一条**，
 * 所以「有没有结果」不是判据，「结果里有没有它」才是。
 *
 * 判据：页名或**导语**（正文开头一段）与任一实体词有重叠。⛔ 不看全文 ——
 * 一篇长条目里蹭到两个字是常态，那样这道闸等于不存在。
 */
export function isRelevantToTerms(params: {
  terms: readonly string[]
  title: string
  lead?: string
}): boolean {
  // ⚠ 没有可用实体词时**不判**：宁可放行，也不要拿一条空判据去删证据。
  if (params.terms.length === 0) return true

  const title = normalizeResearchTerm(params.title)
  const lead = normalizeResearchTerm(
    (params.lead ?? '').slice(0, RESEARCH_LIMITS.relevanceLeadChars),
  )

  return params.terms.some(
    (term) =>
      title.includes(term) ||
      term.includes(title) ||
      sameShapeVariant(term, title) ||
      lead.includes(term),
  )
}

/**
 * 实体词 → Fandom 子站。**表里没有就返回 null**（调用方标 `skipped`）。
 *
 * ⛔ 不退回任何一个具体子域：那正是「问什么都答鸣潮」的来源。
 */
export function resolveFandomSite(
  terms: readonly string[],
): MediaWikiSiteCapability | null {
  const normalized = terms.map((term) => normalizeResearchTerm(term))
  for (const wiki of FANDOM_WIKIS) {
    const aliases = wiki.aliases.map((alias) => normalizeResearchTerm(alias))
    const hit = normalized.some((term) =>
      aliases.some((alias) => term.includes(alias) || alias.includes(term)),
    )
    if (hit) return buildFandomSite(wiki)
  }
  return null
}

/**
 * 源 id + 实体词 → 真要打的那个站。
 * ⚠ Fandom 走 `resolveFandomSite`（按作品解析），其余走定址表。
 */
export function resolveMediaWikiSite(
  sourceId: ResearchSourceId,
  terms: readonly string[],
): MediaWikiSiteCapability | null {
  if (sourceId === RESEARCH_SOURCE_IDS.fandom) return resolveFandomSite(terms)
  return getMediaWikiSite(sourceId) ?? null
}

/** 从规划器产出的查询里挑一条最适合这个站的（萌百中文 / Fandom 英文）。 */
export function pickQueryForSite(
  site: MediaWikiSiteCapability,
  queries: readonly ResearchQuery[],
): string | null {
  const langMatch = queries.find((query) => query.lang === site.queryLanguage)
  return (langMatch ?? queries[0])?.text ?? null
}

/**
 * 打一个 MediaWiki 站，出 EvidenceItem[]。
 *
 * 抛错 = 这个源坏了（被封 / 全链失败）；返回空数组 = 这个源没料。**两者不同**，
 * 由 `runConnector` 翻成 `failed` / `empty` 两种回执。
 */
export async function fetchMediaWikiEvidence(params: {
  site: MediaWikiSiteCapability
  query: string
  /** 判相关性用的实体词；缺省时按空白切 `query`。见 `isRelevantToTerms`。 */
  entities?: readonly string[]
}): Promise<ConnectorResult> {
  const { site, query } = params
  const title = await resolveTitle(site, query)
  if (!title) return { items: [] }

  const detail = await fetchDetail(site, title)

  /**
   * ⛔ **不相关的页一个字都不交出去**（第三态 `unrelated`）。返回空 items +
   * `unrelated` 说明，`runConnector` 据此出回执 —— 与「没料」分得开，模型于是
   * 知道该换名字重查，而不是照着一部别的作品写设定。
   */
  const terms = researchTermsOf(query, params.entities ?? [])
  if (!isRelevantToTerms({ terms, title: detail.title, lead: detail.text })) {
    return {
      items: [],
      unrelated: `${site.label} returned "${detail.title}", which does not match ${terms.join(' / ')}`,
    }
  }

  const retrievedAt = new Date().toISOString()
  const url = pageUrl(site, detail.title)
  const tier = evidenceTier(site.sourceId)
  const items: EvidenceItem[] = []

  if (detail.text) {
    items.push({
      kind: 'text',
      id: evidenceId(site.sourceId, `${detail.title}:text`),
      sourceId: site.sourceId,
      sourceTier: tier,
      retrievedAt,
      title: `${site.label} · ${detail.title}`,
      url,
      lang: site.queryLanguage,
      excerpt: clampExcerpt(detail.text),
    })
  }

  // 🔬 分类 = **已经结构化的外观标签**，不需要再过一次 LLM 提取。长离的
  //    「粉发 · 挑染 · 金瞳 · 下双马尾」就是分类名直出 —— 切片 0 里两臂都答错的
  //    那道题，这一条直接给对。少一次提取就少一处幻觉面。
  if (detail.categories.length > 0) {
    items.push({
      kind: 'tags',
      id: evidenceId(site.sourceId, `${detail.title}:tags`),
      sourceId: site.sourceId,
      sourceTier: tier,
      retrievedAt,
      title: `${site.label} · ${detail.title} · 分类标签`,
      url,
      lang: site.queryLanguage,
      tags: detail.categories.slice(0, RESEARCH_LIMITS.maxTagsPerItem),
      provenance: `${site.label} prop=categories`,
    })
  }

  if (detail.image) {
    items.push({
      kind: 'image',
      id: evidenceId(site.sourceId, `${detail.title}:image`),
      sourceId: site.sourceId,
      sourceTier: tier,
      retrievedAt,
      title: `${site.label} · ${detail.title} · 主图`,
      url,
      lang: site.queryLanguage,
      imageUrl: detail.image.url,
      ...(detail.image.width ? { width: detail.image.width } : {}),
      ...(detail.image.height ? { height: detail.image.height } : {}),
    })
  }

  return { items }
}
