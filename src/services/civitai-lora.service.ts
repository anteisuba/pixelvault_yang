import 'server-only'

import { z } from 'zod'

import {
  CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  CIVITAI_LORA_PAGE_SIZE,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
} from '@/constants/lora'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import type {
  CivitaiLoraLibraryItem,
  CivitaiLoraLibraryResult,
  LoraAssetType,
} from '@/types'

const CIVITAI_MODELS_API = 'https://civitai.com/api/v1/models'
const CIVITAI_REQUEST_TIMEOUT_MS = 8000

const CivitaiStatsSchema = z
  .object({
    downloadCount: z.number().optional(),
    thumbsUpCount: z.number().optional(),
  })
  .passthrough()

const CivitaiFileSchema = z
  .object({
    type: z.string().optional(),
    primary: z.boolean().optional(),
    downloadUrl: z.string().url().optional(),
  })
  .passthrough()

const CivitaiImageSchema = z
  .object({
    url: z.string().url(),
    nsfwLevel: z.number().optional(),
  })
  .passthrough()

const CivitaiModelVersionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    baseModel: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    trainedWords: z.array(z.string()).optional(),
    downloadUrl: z.string().url().optional(),
    files: z.array(CivitaiFileSchema).optional(),
    images: z.array(CivitaiImageSchema).optional(),
    stats: CivitaiStatsSchema.optional(),
  })
  .passthrough()

// Civitai 把 allowCommercialUse 序列化成 PostgreSQL array literal 字符串，例如
// '{Image,RentCivit,Rent}' 或空集合 '{}'，不是 JSON array。preprocess 在 Zod
// 校验前把它归一成 string[]，同时兼容未来 Civitai 改成真正 JSON array 的可能。
function parseAllowCommercialUse(value: unknown): unknown {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return value
  const inner = trimmed.slice(1, -1).trim()
  if (inner === '') return []
  return inner
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const CivitaiModelSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    type: z.string(),
    tags: z.array(z.string()).optional(),
    creator: z
      .object({
        username: z.string().optional(),
        image: z.string().url().nullable().optional(),
      })
      .nullable()
      .optional(),
    stats: CivitaiStatsSchema.optional(),
    modelVersions: z.array(CivitaiModelVersionSchema).optional(),
    allowCommercialUse: z.preprocess(
      parseAllowCommercialUse,
      z.array(z.string()).optional(),
    ),
    allowDerivatives: z.boolean().optional(),
  })
  .passthrough()

const CivitaiModelsResponseSchema = z
  .object({
    items: z.array(CivitaiModelSchema),
    metadata: z
      .object({
        totalItems: z.number().optional(),
        nextPage: z.string().nullable().optional(),
        nextCursor: z.union([z.string(), z.number()]).nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export interface ListCivitaiLorasInput {
  page?: number
  pageSize?: number
  cursor?: string | null
  search?: string
  baseModel?: CivitaiLoraBaseModel
  sort?: CivitaiLoraSort
}

function pickDownloadUrl(
  version: z.infer<typeof CivitaiModelVersionSchema>,
): string | null {
  const primaryModelFile = version.files?.find(
    (file) => file.primary && file.type === 'Model' && file.downloadUrl,
  )
  const firstModelFile = version.files?.find(
    (file) => file.type === 'Model' && file.downloadUrl,
  )
  return (
    primaryModelFile?.downloadUrl ??
    firstModelFile?.downloadUrl ??
    version.downloadUrl ??
    null
  )
}

function pickImages(
  version: z.infer<typeof CivitaiModelVersionSchema>,
): string[] {
  return (
    version.images
      ?.filter((image) => (image.nsfwLevel ?? 1) <= 2)
      .map((image) => image.url)
      .slice(0, 6) ?? []
  )
}

function inferLoraType(tags: string[], name: string): LoraAssetType {
  const haystack = `${name} ${tags.join(' ')}`.toLowerCase()
  if (
    haystack.includes('character') ||
    haystack.includes('person') ||
    haystack.includes('subject')
  ) {
    return 'subject'
  }
  return 'style'
}

function toLibraryItem(
  model: z.infer<typeof CivitaiModelSchema>,
): CivitaiLoraLibraryItem | null {
  if (model.type.toUpperCase() !== 'LORA') return null

  const version = model.modelVersions?.find((candidate) =>
    Boolean(pickDownloadUrl(candidate)),
  )
  if (!version) return null

  const loraUrl = pickDownloadUrl(version)
  if (!loraUrl) return null

  const tags = model.tags ?? []
  const previewImageUrls = pickImages(version)
  const baseModelFamily = version.baseModel?.trim() || 'unknown'
  const triggerWord =
    version.trainedWords?.find((word) => word.trim().length > 0)?.trim() ??
    tags.find((tag) => tag.trim().length > 0)?.trim() ??
    'lora'

  return {
    id: `civitai:${model.id}:${version.id}`,
    styleCode: `civitai-${version.id}`,
    name: model.name,
    source: 'imported',
    type: inferLoraType(tags, model.name),
    baseModelFamily,
    provider: 'civitai',
    triggerWord,
    loraUrl,
    coverImageUrl: previewImageUrls[0] ?? null,
    previewImageUrls,
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt:
      version.publishedAt ?? version.createdAt ?? new Date(0).toISOString(),
    modelId: model.id,
    modelVersionId: version.id,
    versionName: version.name,
    creatorName: model.creator?.username ?? null,
    creatorAvatarUrl: model.creator?.image ?? null,
    modelPageUrl: `https://civitai.com/models/${model.id}?modelVersionId=${version.id}`,
    tags: tags.slice(0, 8),
    downloadCount:
      version.stats?.downloadCount ?? model.stats?.downloadCount ?? 0,
    thumbsUpCount:
      version.stats?.thumbsUpCount ?? model.stats?.thumbsUpCount ?? 0,
    allowCommercialUse: model.allowCommercialUse ?? [],
    allowDerivatives: model.allowDerivatives ?? false,
  }
}

/**
 * Error wrapper that carries the HTTP status (when applicable) so
 * `withRetry`'s default retryability check can distinguish retryable
 * 5xx/429 from terminal 4xx without having to grep error messages.
 */
class CivitaiFetchError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'CivitaiFetchError'
    this.status = status
  }
}

async function fetchCivitaiPayload(url: URL): Promise<unknown> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new CivitaiFetchError('Civitai request timed out'))
    }, CIVITAI_REQUEST_TIMEOUT_MS)
  })

  const requestPromise = fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 300 },
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      throw new CivitaiFetchError(
        `Civitai request failed with status ${response.status}`,
        response.status,
      )
    }
    return response.json() as Promise<unknown>
  })

  try {
    return await Promise.race([requestPromise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

// 用 baseModel filter 时把 upstream limit 放大，因为客户端过滤会丢掉一部分。
// 4× 是经验值：搜 "Wuthering Waves" 时 Illustrious 占比 ~30%（9/30），4× 能让
// 客户端在一次 upstream 请求里大概率攒满 pageSize。
const UPSTREAM_OVERFETCH_MULTIPLIER = 4

export async function listCivitaiLoras({
  page = 1,
  pageSize = CIVITAI_LORA_PAGE_SIZE,
  cursor,
  search,
  baseModel = 'all',
  sort = 'Highest Rated',
}: ListCivitaiLorasInput = {}): Promise<CivitaiLoraLibraryResult> {
  const url = new URL(CIVITAI_MODELS_API)
  const normalizedSearch = search?.trim() ?? ''
  const nextPageCursor = cursor?.trim() ?? ''
  const upstreamLimit =
    baseModel === 'all' ? pageSize : pageSize * UPSTREAM_OVERFETCH_MULTIPLIER

  url.searchParams.set('types', 'LORA')
  url.searchParams.set('limit', String(upstreamLimit))
  url.searchParams.set('sort', sort)
  url.searchParams.set('nsfw', 'false')
  if (normalizedSearch) {
    url.searchParams.set('query', normalizedSearch)
  } else {
    url.searchParams.set('page', String(page))
  }
  if (nextPageCursor) url.searchParams.set('cursor', nextPageCursor)
  // Intentionally not setting `baseModels` — Civitai's filter has a coverage
  // bug that drops most matching LoRAs (see CIVITAI_BASE_MODEL_FAMILY_MEMBERS).
  // We over-fetch and filter on baseModelFamily below.

  try {
    // Civitai's public API blips with intermittent 5xx/timeouts — withRetry
    // wraps three attempts with exponential backoff. Our CivitaiFetchError
    // carries `.status` so the default retry classifier lets 4xx fail fast
    // (a bad query won't get better by hammering it).
    const payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 2000,
      label: 'civitai.listLoras',
    })
    const parsed = CivitaiModelsResponseSchema.parse(payload)
    const allItems = parsed.items
      .map(toLibraryItem)
      .filter((item): item is CivitaiLoraLibraryItem => Boolean(item))

    const filteredItems =
      baseModel === 'all'
        ? allItems
        : (() => {
            const accepted = new Set<string>(
              CIVITAI_BASE_MODEL_FAMILY_MEMBERS[baseModel],
            )
            return allItems.filter((item) => accepted.has(item.baseModelFamily))
          })()

    const items = filteredItems.slice(0, pageSize)
    const nextCursor =
      parsed.metadata?.nextCursor === undefined ||
      parsed.metadata.nextCursor === null
        ? null
        : String(parsed.metadata.nextCursor)

    return {
      items,
      page,
      pageSize,
      total: parsed.metadata?.totalItems ?? null,
      // When a filter is on, upstream pagination is the only reliable signal —
      // even if this page yielded 0 filtered items, the next upstream page
      // might still have matches. Trust upstream's nextCursor / nextPage.
      hasNextPage:
        Boolean(nextCursor) ||
        Boolean(parsed.metadata?.nextPage) ||
        (!normalizedSearch && allItems.length >= upstreamLimit),
      nextCursor,
    }
  } catch (error) {
    logger.warn('Civitai LoRA library request failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      page,
      cursor: nextPageCursor || null,
      search: normalizedSearch || undefined,
      baseModel,
      sort,
    })
    throw error
  }
}
