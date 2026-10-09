import 'server-only'

import { z } from 'zod'

import { CRON_HEARTBEAT, CRON_JOBS } from '@/constants/cron'
import {
  CIVITAI_LORA_PAGE_SIZE,
  CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
  CIVITAI_NAMED_BASE_MODEL_MEMBER_SET,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  getLoraContentTypeDefinition,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
  type LoraContentType,
  type LoraNsfwFilter,
} from '@/constants/lora'
import {
  buildCivitaiItemImageUrls,
  buildCivitaiVersionDownloadUrl,
  inferLoraType,
} from '@/lib/civitai-library-item'
import type { CronHeartbeat } from '@/lib/cron-heartbeat'
import { extractCivitaiTrigger } from '@/lib/lora-trigger-extract'
import {
  acceptedBaseModelNames,
  maxImageNsfwLevelFor,
} from '@/services/civitai-lora.service'
import type { CivitaiLoraLibraryItem, CivitaiLoraLibraryResult } from '@/types'

/**
 * Civitai LoRA 库的列表与搜索：只查我们自己的全量索引（Cloudflare D1，
 * `workers/civitai-index`，每天与 Civitai 对账一次）。
 *
 * 上游 meilisearch 把翻页与总数都封顶在 1000（2026-10-07），再在它前面叠
 * 快照 / 镜像 / REST 回落也只是在缺口上打补丁——所以列表不再碰上游，条目、
 * 总数、翻页都以索引为准。新上架的模型最迟一天后出现。
 */

// 索引查询本身几十毫秒；超时多半是 Cloudflare 那头偶发卡一下，短超时 + 重试一次
// 比干等 8 秒更稳（只读，重试安全）。
const CIVITAI_INDEX_TIMEOUT_MS = 4000
const CIVITAI_INDEX_ATTEMPTS = 2
/** 卡片上最多带几个标签（与旧的上游路径一致）。 */
const ITEM_MAX_TAGS = 8

const IndexRowSchema = z.object({
  modelId: z.number().int(),
  versionId: z.number().int(),
  versionName: z.string().nullable(),
  name: z.string(),
  creator: z.string().nullable(),
  creatorImage: z.string().nullable(),
  nsfw: z.boolean(),
  baseModel: z.string().nullable(),
  tags: z.array(z.string()),
  trainedWords: z.array(z.string()),
  hashAutoV3: z.string().nullable(),
  downloadCount: z.number(),
  thumbsUpCount: z.number(),
  images: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
      type: z.string().optional(),
      nsfwLevel: z.number().optional(),
      hash: z.string().optional(),
    }),
  ),
  permissions: z.object({
    allowCommercialUse: z.array(z.string()),
    allowDerivatives: z.boolean(),
    allowNoCredit: z.boolean(),
  }),
  createdAt: z.number(),
})

const IndexSearchResponseSchema = z.object({
  rows: z.array(IndexRowSchema),
  total: z.number().int().nonnegative(),
})

const IndexStatusSchema = z.object({
  last_completed_at: z.number().nullable(),
  last_error: z.string().nullable(),
})

type IndexRow = z.infer<typeof IndexRowSchema>

async function callIndex(path: string, body?: unknown): Promise<unknown> {
  const baseUrl = process.env.CIVITAI_INDEX_URL
  const token = process.env.CIVITAI_INDEX_TOKEN
  if (!baseUrl || !token) {
    throw new Error(
      'CIVITAI_INDEX_URL / CIVITAI_INDEX_TOKEN are not configured',
    )
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(new URL(path, baseUrl), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(CIVITAI_INDEX_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`Civitai index responded ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      const timedOut =
        error instanceof DOMException && error.name === 'TimeoutError'
      if (!timedOut || attempt >= CIVITAI_INDEX_ATTEMPTS) throw error
    }
  }
}

export interface ListCivitaiLorasInput {
  page?: number
  pageSize?: number
  search?: string
  baseModel?: CivitaiLoraBaseModel
  sort?: CivitaiLoraSort
  /** 三态分级，默认 'safe'。都是「存在」语义：安全 = 至少一张样例图不超过 Soft。 */
  nsfwFilter?: LoraNsfwFilter
  contentType?: LoraContentType
}

function indexSort(sort: CivitaiLoraSort, search: string) {
  if (sort === 'Most Downloaded') return 'downloads'
  if (sort === 'Newest') return 'newest'
  // 「推荐」：有搜索词按相关度，没有按点赞。
  return search ? 'relevance' : 'thumbs'
}

function indexNsfw(nsfwFilter: LoraNsfwFilter) {
  if (nsfwFilter === 'safe') {
    return { someImageAtMost: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL }
  }
  if (nsfwFilter === 'nsfwOnly') {
    return { someImageAbove: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL }
  }
  return {}
}

function indexBaseModels(baseModel: CivitaiLoraBaseModel) {
  if (baseModel === 'all') return {}
  // 「其他」= 不属于任何具名家族的底模。
  if (baseModel === 'other') {
    return { excludeBaseModels: [...CIVITAI_NAMED_BASE_MODEL_MEMBER_SET] }
  }
  return { baseModels: acceptedBaseModelNames(baseModel) ?? [baseModel] }
}

function indexContentType(contentType: LoraContentType) {
  if (contentType === 'all') return null
  const definition = getLoraContentTypeDefinition(contentType)
  return {
    tags: [...definition.civitaiTags],
    nameKeywords: [...definition.nameKeywords],
  }
}

function toHttpUrl(value: string | null): string | null {
  return value && /^https?:\/\//.test(value) ? value : null
}

function indexRowToLibraryItem(
  row: IndexRow,
  maxImageNsfwLevel: number,
): CivitaiLoraLibraryItem {
  const imageUrls = buildCivitaiItemImageUrls(row.images, maxImageNsfwLevel)
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
    baseModelFamily: row.baseModel ?? 'unknown',
    provider: 'civitai',
    triggerWord: triggerInfo.trigger,
    triggerAlternates: triggerInfo.alternates,
    recommendedPrompt: triggerInfo.recommendedPrompt,
    recommendedPromptAlternates: triggerInfo.recommendedPromptAlternates,
    triggerSource: triggerInfo.source,
    fileHashAutoV3: row.hashAutoV3,
    // 搜索索引里没有文件清单（上游搜索本来就不给），推荐卡上这栏是「未知」。
    fileSizeBytes: null,
    loraUrl: buildCivitaiVersionDownloadUrl(row.versionId),
    coverImageUrl: imageUrls.coverImageUrl,
    coverImageUrlOriginal: imageUrls.coverImageUrlOriginal,
    thumbImageUrl: imageUrls.thumbImageUrl,
    cardImageUrl: imageUrls.cardImageUrl,
    previewImageUrls: imageUrls.previewImageUrls,
    coverColor: imageUrls.coverColor,
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: new Date(row.createdAt).toISOString(),
    modelId: row.modelId,
    modelVersionId: row.versionId,
    versionName: row.versionName ?? '',
    creatorName: row.creator,
    creatorAvatarUrl: toHttpUrl(row.creatorImage),
    modelPageUrl: `https://civitai.com/models/${row.modelId}?modelVersionId=${row.versionId}`,
    tags: row.tags.slice(0, ITEM_MAX_TAGS),
    downloadCount: row.downloadCount,
    thumbsUpCount: row.thumbsUpCount,
    allowCommercialUse: row.permissions.allowCommercialUse,
    allowDerivatives: row.permissions.allowDerivatives,
    allowNoCredit: row.permissions.allowNoCredit,
    isNsfw: row.nsfw,
  }
}

export async function listCivitaiLoras(
  input: ListCivitaiLorasInput = {},
): Promise<CivitaiLoraLibraryResult> {
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? CIVITAI_LORA_PAGE_SIZE
  const search = input.search?.trim() ?? ''
  const nsfwFilter = input.nsfwFilter ?? DEFAULT_LORA_NSFW_FILTER

  const result = IndexSearchResponseSchema.parse(
    await callIndex('/search', {
      q: search,
      ...indexBaseModels(input.baseModel ?? 'all'),
      nsfw: indexNsfw(nsfwFilter),
      contentType: indexContentType(
        input.contentType ?? DEFAULT_LORA_CONTENT_TYPE,
      ),
      sort: indexSort(input.sort ?? 'Highest Rated', search),
      page,
      pageSize,
    }),
  )
  const maxImageNsfwLevel = maxImageNsfwLevelFor(nsfwFilter)

  return {
    items: result.rows.map((row) =>
      indexRowToLibraryItem(row, maxImageNsfwLevel),
    ),
    page,
    pageSize,
    total: result.total,
    hasNextPage: page * pageSize < result.total,
  }
}

/**
 * 索引每日同步的心跳，与 Vercel Cron 的心跳同一形状，`/api/health/crons` 一起报。
 * 索引连不上也算这条不健康（而不是「监控瞎了」）：连不上的时候库页同样打不开。
 */
export async function readCivitaiIndexHeartbeat(
  nowMs = Date.now(),
): Promise<CronHeartbeat> {
  const name = CRON_JOBS.CIVITAI_INDEX_SYNC
  try {
    const status = IndexStatusSchema.parse(await callIndex('/status'))
    const finishedAt = status.last_completed_at
    const ageMs = finishedAt === null ? null : nowMs - finishedAt
    const stale = ageMs === null || ageMs > CRON_HEARTBEAT.MAX_AGE_MS
    const ok = status.last_error === null
    return {
      name,
      lastRun:
        finishedAt === null
          ? null
          : {
              ok,
              detail: status.last_error,
              finishedAt: new Date(finishedAt).toISOString(),
            },
      ageMs,
      stale,
      healthy: !stale && ok,
    }
  } catch (error) {
    return {
      name,
      lastRun: {
        ok: false,
        detail: `Civitai index unreachable: ${error instanceof Error ? error.message : 'Unknown'}`,
        finishedAt: new Date(nowMs).toISOString(),
      },
      ageMs: 0,
      stale: false,
      healthy: false,
    }
  }
}
