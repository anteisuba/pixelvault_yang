import 'server-only'

import {
  DANBOORU_REQUEST,
  RESEARCH_LIMITS,
  RESEARCH_SOURCE_IDS,
} from '@/constants/research'
import type { EvidenceItem } from '@/types/research'
import {
  clampExcerpt,
  evidenceId,
  evidenceTier,
  researchFetchJson,
  type ConnectorResult,
} from '@/services/research/connector-runtime'

/**
 * Danbooru 连接器 —— 角色的**可直接进提示词**的那一半证据。
 *
 * 为什么它值一个专用连接器（切片 0 实证）：两臂都答错的「长离发色」，danbooru
 * 100 张样本的共现 tag 里 `pink_hair(80)` 直接给对；而且鸣潮 11 个角色 tag 全覆盖，
 * **建 tag 早于角色上线两个月**（社区按预告建），所以「新角色覆盖滞后」不是风险项。
 *
 * 🔬 中文名 ↔ tag 对齐**有现成字段**，不用自建映射表：
 * `wiki_pages.json` 的 `other_names` 自带中日英别名
 * （长离 = `["Changli","長離","长离","长离(鳴潮)","チョウリ"]`），
 * 且 `search[other_names_match]=长离` 直接反查得到 tag 名（2026-08-20 实测）。
 *
 * 输出三类证据：别名（tags）· 共现外观 tag（tags）· 立绘样图 URL（image，**只存
 * URL 不下载** —— 用户挑中要用的才转存 R2，见 §3.1）。
 */

interface DanbooruWikiPage {
  id?: number
  title?: string
  body?: string
  other_names?: string[]
}

interface DanbooruTag {
  name?: string
  post_count?: number
  category?: number
}

interface DanbooruPost {
  id?: number
  rating?: string
  large_file_url?: string
  preview_file_url?: string
  file_url?: string
  tag_string_general?: string
}

function danbooruUrl(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params)
  return `${DANBOORU_REQUEST.baseUrl}${path}?${search.toString()}`
}

/** 一个 tag 的 danbooru 分类（4 = 角色，3 = 版权/作品）。查不到时 null。 */
async function fetchTagCategory(tag: string): Promise<number | null> {
  const tags = await researchFetchJson<DanbooruTag[]>(
    RESEARCH_SOURCE_IDS.danbooru,
    danbooruUrl('/tags.json', { 'search[name]': tag, limit: '1' }),
  ).catch((): DanbooruTag[] => [])
  return tags[0]?.category ?? null
}

/**
 * 这个角色 tag 是不是**这部作品**里的那个人。
 *
 * 🔬 2026-09-07 实测：查「时夜」的英文写法 `Tokiya`，模糊匹配回的是
 * `ichinose_tokiya`（《歌之王子殿下》的一之濑时也）—— 一条长得完全像答案的
 * 假证据。判据只能是**共现**：这个角色 tag 与作品的版权 tag 同时出现在同一张图上。
 * ⚠ 匿名用户一次只能查两个 tag，所以这一跳恰好是上限，⛔ 别再往里加第三个。
 */
async function coOccursWithWork(
  tag: string,
  workTag: string,
): Promise<boolean> {
  const posts = await researchFetchJson<DanbooruPost[]>(
    RESEARCH_SOURCE_IDS.danbooru,
    danbooruUrl('/posts.json', { tags: `${tag} ${workTag}`, limit: '1' }),
  ).catch((): DanbooruPost[] => [])
  return posts.length > 0
}

/** ASCII 名走 name_matches 模糊，中日文名走 other_names_match —— 两条都试。 */
async function resolveCharacterTag(query: string): Promise<string | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  // ① 别名反查（中文/日文名的正路，ASCII 名也常命中）
  const wikiPages = await researchFetchJson<DanbooruWikiPage[]>(
    RESEARCH_SOURCE_IDS.danbooru,
    danbooruUrl('/wiki_pages.json', {
      'search[other_names_match]': trimmed,
      limit: String(DANBOORU_REQUEST.maxTagCandidates),
    }),
  )
  const aliasHit = wikiPages.find((page) => page.title)?.title
  if (aliasHit) return aliasHit

  // ② tag 名模糊匹配（只在 character 分类里找）
  const slug = trimmed.toLowerCase().replace(/\s+/g, '_')
  if (!/^[\w()'.\-*]+$/.test(slug)) return null

  const tags = await researchFetchJson<DanbooruTag[]>(
    RESEARCH_SOURCE_IDS.danbooru,
    danbooruUrl('/tags.json', {
      'search[name_matches]': `*${slug}*`,
      'search[category]': String(DANBOORU_REQUEST.characterTagCategory),
      'search[order]': 'count',
      limit: String(DANBOORU_REQUEST.maxTagCandidates),
    }),
  )
  const best = tags
    .filter((tag) => tag.name)
    .sort((a, b) => (b.post_count ?? 0) - (a.post_count ?? 0))[0]
  return best?.name ?? null
}

async function fetchTagWiki(tag: string): Promise<DanbooruWikiPage | null> {
  const pages = await researchFetchJson<DanbooruWikiPage[]>(
    RESEARCH_SOURCE_IDS.danbooru,
    danbooruUrl('/wiki_pages.json', { 'search[title]': tag, limit: '1' }),
  )
  return pages[0] ?? null
}

export async function fetchDanbooruEvidence(params: {
  /** 要查的**那个人**（给了 `work` 时）或那部作品（没给时）。 */
  query: string
  /**
   * 作品名。**给了它就等于说「`query` 是这部作品里的角色」**，于是这里多做两件事：
   *  ① 解析出来的 tag 必须是角色分类（category 4）——否则回来的是 game tag 的
   *    全作品统计（🔬 owner 真机：`ananta` 的 71 张样本里 `rabbit_ears 39/71`
   *    是别人的耳朵）；
   *  ② 该角色 tag 必须与作品的版权 tag 共现（🔬 `Tokiya` → `ichinose_tokiya`）。
   * ⚠ 两条任一不过就**不出证据**，并在 `unrelated` 里说清楚是哪一条不过 ——
   * 「danbooru 上没有这个角色」与「danbooru 挂了」是两件事。
   */
  work?: string
}): Promise<ConnectorResult> {
  const tag = await resolveCharacterTag(params.query)
  const workTag = params.work ? await resolveCharacterTag(params.work) : null

  if (!tag) {
    if (!params.work) return { items: [] }
    return {
      items: [],
      unrelated: workTag
        ? `danbooru has no character tag for "${params.query}"; only the work tag "${workTag}" exists, and its posts describe the whole title, not this character`
        : `danbooru has no character tag for "${params.query}"`,
    }
  }

  if (params.work) {
    const category = await fetchTagCategory(tag)
    if (category !== DANBOORU_REQUEST.characterTagCategory) {
      return {
        items: [],
        unrelated: `danbooru resolved "${params.query}" to "${tag}", which is not a character tag (category ${category ?? 'unknown'}) — that would have been a whole-title tag statistic, not this character`,
      }
    }
    if (workTag && workTag !== tag && !(await coOccursWithWork(tag, workTag))) {
      return {
        items: [],
        unrelated: `danbooru's "${tag}" never appears together with "${workTag}", so it is a character from another work, not "${params.query}" of ${params.work}`,
      }
    }
  }

  const [wiki, posts] = await Promise.all([
    fetchTagWiki(tag).catch(() => null),
    researchFetchJson<DanbooruPost[]>(
      RESEARCH_SOURCE_IDS.danbooru,
      danbooruUrl('/posts.json', {
        tags: tag,
        limit: String(DANBOORU_REQUEST.consensusSampleSize),
      }),
    ).catch((): DanbooruPost[] => []),
  ])

  const retrievedAt = new Date().toISOString()
  const tier = evidenceTier(RESEARCH_SOURCE_IDS.danbooru)
  const wikiUrl = `${DANBOORU_REQUEST.baseUrl}/wiki_pages/${encodeURIComponent(tag)}`
  const items: EvidenceItem[] = []

  // ① 角色 tag 本身 + 别名 —— 「中文名对应哪个 tag」这件事本身就是常被问的事实
  const aliases = (wiki?.other_names ?? []).filter(Boolean)
  items.push({
    kind: 'tags',
    id: evidenceId(RESEARCH_SOURCE_IDS.danbooru, `${tag}:identity`),
    sourceId: RESEARCH_SOURCE_IDS.danbooru,
    sourceTier: tier,
    retrievedAt,
    title: `danbooru · ${tag}`,
    url: wikiUrl,
    lang: 'en',
    tags: [tag, ...aliases].slice(0, RESEARCH_LIMITS.maxTagsPerItem),
    provenance: 'danbooru wiki_pages.other_names（角色 tag 与各语言别名）',
  })

  if (wiki?.body?.trim()) {
    items.push({
      kind: 'text',
      id: evidenceId(RESEARCH_SOURCE_IDS.danbooru, `${tag}:wiki`),
      sourceId: RESEARCH_SOURCE_IDS.danbooru,
      sourceTier: tier,
      retrievedAt,
      title: `danbooru wiki · ${tag}`,
      url: wikiUrl,
      lang: 'en',
      excerpt: clampExcerpt(wiki.body),
    })
  }

  // ② 共现 tag = 社区共识的外观。带出现次数，让模型能看出「80/100」和「3/100」
  //    不是一回事 —— 去掉计数就等于把强弱证据拍平成同一句话。
  const sampleSize = posts.length
  if (sampleSize > 0) {
    const frequency = new Map<string, number>()
    for (const post of posts) {
      for (const raw of (post.tag_string_general ?? '').split(' ')) {
        if (!raw) continue
        frequency.set(raw, (frequency.get(raw) ?? 0) + 1)
      }
    }
    const top = [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, DANBOORU_REQUEST.consensusTopN)
    if (top.length > 0) {
      items.push({
        kind: 'tags',
        id: evidenceId(RESEARCH_SOURCE_IDS.danbooru, `${tag}:consensus`),
        sourceId: RESEARCH_SOURCE_IDS.danbooru,
        sourceTier: tier,
        retrievedAt,
        title: `danbooru · ${tag} · 共现标签（${sampleSize} 张样本）`,
        url: `${DANBOORU_REQUEST.baseUrl}/posts?tags=${encodeURIComponent(tag)}`,
        lang: 'en',
        tags: top.map(([name, count]) => `${name} (${count}/${sampleSize})`),
        provenance: `danbooru posts.json ${sampleSize} 张样本的 tag 共现统计`,
      })
    }

    // ③ 立绘样图：**只存 URL 不下载**。全年龄档，避免把 NSFW 样图塞进证据卡。
    const samples = posts
      .filter(
        (post) =>
          post.rating === DANBOORU_REQUEST.safeRating &&
          (post.large_file_url || post.file_url),
      )
      .slice(0, DANBOORU_REQUEST.maxSampleImages)
    for (const post of samples) {
      const imageUrl = post.large_file_url ?? post.file_url
      if (!imageUrl || !post.id) continue
      items.push({
        kind: 'image',
        id: evidenceId(RESEARCH_SOURCE_IDS.danbooru, `post:${post.id}`),
        sourceId: RESEARCH_SOURCE_IDS.danbooru,
        sourceTier: tier,
        retrievedAt,
        title: `danbooru post #${post.id} · ${tag}`,
        url: `${DANBOORU_REQUEST.baseUrl}/posts/${post.id}`,
        lang: 'en',
        imageUrl,
      })
    }
  }

  return { items }
}
