import 'server-only'

import {
  CIVITAI_LORA_PAGE_SIZE,
  CIVITAI_LORA_SEARCH_MAX_FETCH_LIMIT,
  CIVITAI_LORA_SEARCH_OVERFETCH_BUFFER,
  CIVITAI_MIRROR_SYNC_STATE_ID,
  CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  LORA_CONTENT_TYPES,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
  type LoraContentType,
  type LoraNsfwFilter,
} from '@/constants/lora'
import {
  buildCivitaiItemImageUrls,
  buildCivitaiVersionDownloadUrl,
  inferLoraType,
  type CivitaiCdnImage,
} from '@/lib/civitai-library-item'
import { db } from '@/lib/db'
import { extractCivitaiTrigger } from '@/lib/lora-trigger-extract'
import { logger } from '@/lib/logger'
import type { CivitaiLoraLibraryItem, CivitaiLoraLibraryResult } from '@/types'
import type { Prisma } from '@/lib/generated/prisma/client'

/**
 * L3 本地目录镜像的读取面。
 *
 * 定位是**兜底层不是主查询层**：上游健康时一律走上游，结果与今天逐字段一
 * 致；只有上游不可用时才由这里接管。这么定是因为镜像只覆盖 top 100k /
 * 642k——让它当主路径的话，长尾搜索会静默变少（上游有 500 条、本地只有
 * 30 条），拿一次可见的功能退化去换我们并不需要的速度。当兜底层则零退化，
 * 而且它能回答**从没搜过的词**，这正是 L2 快照填不了的洞。
 *
 * 这个模块刻意不 import civitai-lora.service：那边要 import 这里做降级，
 * 反向依赖会成环。共享的造 item 零件都在 @/lib/civitai-library-item。
 */

/** 上游 nsfw 三态在本地的等价条件。 */
function nsfwWhere(
  nsfwFilter: LoraNsfwFilter,
): Prisma.CivitaiLoraMirrorWhereInput {
  if (nsfwFilter === 'safe') {
    return {
      nsfwLevelMax: { lte: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL },
      // 名字本身命中 NSFW 关键词的第二道防线，与上游 filterSearchHitsByNsfw
      // 同语义（落库时已经算好，查询时不必再扫字符串）。
      nsfwNamed: false,
    }
  }
  if (nsfwFilter === 'nsfwOnly') {
    return { nsfwLevelMax: { gt: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL } }
  }
  return {}
}

function contentTypeWhere(
  contentType: LoraContentType,
): Prisma.CivitaiLoraMirrorWhereInput | null {
  if (contentType === 'all') return null
  const definition = LORA_CONTENT_TYPES.find((type) => type.id === contentType)
  if (!definition) return null
  const clauses: Prisma.CivitaiLoraMirrorWhereInput[] = []
  if (definition.civitaiTags.length > 0) {
    clauses.push({ tags: { hasSome: [...definition.civitaiTags] } })
  }
  for (const keyword of definition.nameKeywords) {
    clauses.push({ name: { contains: keyword, mode: 'insensitive' } })
  }
  return clauses.length > 0 ? { OR: clauses } : null
}

/**
 * 本地排序。'Highest Rated' 在上游是 meilisearch 的相关性序，本地复制不了
 * 那个算法——退化成按下载量降序，并在结果里如实标 sortFellBackToRelevance
 * 让 UI 把排序控件降级显示，不假装我们排得和 Civitai 一样。
 */
function orderBy(
  sort: CivitaiLoraSort,
): Prisma.CivitaiLoraMirrorOrderByWithRelationInput[] {
  if (sort === 'Newest') return [{ createdAt: 'desc' }, { modelId: 'desc' }]
  if (sort === 'Most Downloaded') {
    return [{ downloadCount: 'desc' }, { modelId: 'desc' }]
  }
  return [{ thumbsUpCount: 'desc' }, { downloadCount: 'desc' }]
}

/**
 * 名称匹配分层，与上游路径（rankSearchHitsByNameMatch）同一套语义。
 *
 * 兜底层必须和主路径排得一样——上游一挂顺序就突然变样，比慢更让人不安。
 * 分层在 JS 里做而不是下推 SQL：Prisma 的 orderBy 表达不了 CASE WHEN，而
 * 镜像本身就是按下载量截断的 top N，低下载量的完全匹配根本不在库里，过取
 * 一个前缀窗口再分层足够。
 */
function normalizeSearchName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function nameMatchTier(name: string, search: string): number {
  const haystack = normalizeSearchName(name)
  const needle = normalizeSearchName(search)
  if (!needle) return 3
  if (haystack === needle) return 0
  if (haystack.startsWith(needle)) return 1
  if (haystack.includes(needle)) return 2
  return 3
}

function mirrorRowToLibraryItem(
  row: {
    modelId: number
    versionId: number
    versionName: string | null
    name: string
    creator: string | null
    baseModel: string | null
    tags: string[]
    trainedWords: string[]
    hashAutoV3: string | null
    downloadCount: number
    thumbsUpCount: number
    images: unknown
    createdAt: Date
  },
  maxImageNsfwLevel: number,
): CivitaiLoraLibraryItem {
  const images = Array.isArray(row.images)
    ? (row.images as CivitaiCdnImage[])
    : []
  const imageUrls = buildCivitaiItemImageUrls(images, maxImageNsfwLevel)
  const triggerInfo = extractCivitaiTrigger({
    trainedWords: row.trainedWords,
    modelName: row.name,
    descriptionHtml: null,
  })

  return {
    id: `civitai:${row.modelId}:${row.versionId}`,
    styleCode: `civitai-${row.versionId}`,
    name: row.name,
    source: 'imported',
    type: inferLoraType(row.tags, row.name),
    baseModelFamily: row.baseModel?.trim() || 'unknown',
    provider: 'civitai',
    triggerWord: triggerInfo.trigger,
    triggerAlternates: triggerInfo.alternates,
    recommendedPrompt: triggerInfo.recommendedPrompt,
    recommendedPromptAlternates: triggerInfo.recommendedPromptAlternates,
    triggerSource: triggerInfo.source,
    fileHashAutoV3: row.hashAutoV3,
    loraUrl: buildCivitaiVersionDownloadUrl(row.versionId),
    coverImageUrl: imageUrls.coverImageUrl,
    coverImageUrlOriginal: imageUrls.coverImageUrlOriginal,
    thumbImageUrl: imageUrls.thumbImageUrl,
    cardImageUrl: imageUrls.cardImageUrl,
    previewImageUrls: imageUrls.previewImageUrls,
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: row.createdAt.toISOString(),
    modelId: row.modelId,
    modelVersionId: row.versionId,
    versionName: row.versionName ?? 'v1',
    creatorName: row.creator ?? 'unknown',
    creatorAvatarUrl: null,
    modelPageUrl: `https://civitai.com/models/${row.modelId}?modelVersionId=${row.versionId}`,
    tags: row.tags,
    downloadCount: row.downloadCount,
    thumbsUpCount: row.thumbsUpCount,
    allowCommercialUse: [],
    allowDerivatives: false,
  }
}

export interface SearchCivitaiMirrorInput {
  page?: number
  pageSize?: number
  search?: string
  baseModel?: CivitaiLoraBaseModel
  acceptedBaseModelNames?: readonly string[] | null
  sort?: CivitaiLoraSort
  nsfwFilter?: LoraNsfwFilter
  contentType?: LoraContentType
  maxImageNsfwLevel: number
}

/**
 * 查本地镜像。返回 null = 镜像还没建好或这个查询本地一条都没有，调用方据
 * 此继续往下一级降级，而不是把「本地没有」当成「真的没有」端给用户。
 */
export async function searchCivitaiMirror(
  input: SearchCivitaiMirrorInput,
): Promise<CivitaiLoraLibraryResult | null> {
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? CIVITAI_LORA_PAGE_SIZE
  const search = input.search?.trim() ?? ''
  const sort = input.sort ?? 'Highest Rated'
  const nsfwFilter = input.nsfwFilter ?? DEFAULT_LORA_NSFW_FILTER
  const contentType = input.contentType ?? DEFAULT_LORA_CONTENT_TYPE

  const and: Prisma.CivitaiLoraMirrorWhereInput[] = [nsfwWhere(nsfwFilter)]
  if (search) {
    // 名称模糊匹配走 pg_trgm GIN；tag 精确命中走数组 GIN。上游 meilisearch
    // 是 typo-tolerant 的全文匹配，这是本地能给出的最接近的等价物。
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { tags: { hasSome: [search.toLowerCase()] } },
      ],
    })
  }
  if (input.acceptedBaseModelNames && input.acceptedBaseModelNames.length > 0) {
    and.push({ baseModel: { in: [...input.acceptedBaseModelNames] } })
  }
  const typeClause = contentTypeWhere(contentType)
  if (typeClause) and.push(typeClause)

  const where: Prisma.CivitaiLoraMirrorWhereInput = { AND: and }

  try {
    // 分层重排要看到整个前缀窗口才成立——只在当页内重排的话，靠后的完全
    // 匹配翻页后反而更靠后。与上游路径同一套范式。
    const windowStart = (page - 1) * pageSize
    const windowEnd = page * pageSize
    const fetchLimit = Math.min(
      windowEnd + CIVITAI_LORA_SEARCH_OVERFETCH_BUFFER,
      CIVITAI_LORA_SEARCH_MAX_FETCH_LIMIT,
    )
    const [total, rows] = await Promise.all([
      db.civitaiLoraMirror.count({ where }),
      db.civitaiLoraMirror.findMany({
        where,
        orderBy: orderBy(sort),
        take: fetchLimit,
        select: {
          modelId: true,
          versionId: true,
          versionName: true,
          name: true,
          creator: true,
          baseModel: true,
          tags: true,
          trainedWords: true,
          hashAutoV3: true,
          downloadCount: true,
          thumbsUpCount: true,
          images: true,
          createdAt: true,
        },
      }),
    ])

    if (total === 0) return null

    const ranked = search
      ? [...rows].sort(
          (a, b) =>
            nameMatchTier(a.name, search) - nameMatchTier(b.name, search),
        )
      : rows

    return {
      items: ranked
        .slice(windowStart, windowEnd)
        .map((row) => mirrorRowToLibraryItem(row, input.maxImageNsfwLevel)),
      page,
      pageSize,
      total,
      hasNextPage: windowEnd < total,
      nextCursor: null,
      // 本地按 offset 分页，与 meilisearch 路径同一种范式。
      offsetPaginationSupported: true,
      // 本地排不出 Civitai 的 Highest Rated，如实标出来让 UI 降级显示。
      sortFellBackToRelevance: sort === 'Highest Rated',
    }
  } catch (error) {
    logger.warn('Civitai mirror search failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      search,
    })
    return null
  }
}

/**
 * 镜像最近一次完整刷新的时刻。UI 的「离线数据 · X 分钟前」用它——用镜像
 * 兜底时，"多旧"指的是镜像的新鲜度，不是当下这一刻。
 */
export async function readCivitaiMirrorFreshness(): Promise<Date | null> {
  try {
    const state = await db.civitaiMirrorSyncState.findUnique({
      where: { id: CIVITAI_MIRROR_SYNC_STATE_ID },
      select: { lastCompletedAt: true },
    })
    return state?.lastCompletedAt ?? null
  } catch {
    return null
  }
}
