import 'server-only'

import { z } from 'zod'

import {
  CIVITAI_LORA_PAGE_SIZE,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
} from '@/constants/lora'
import { logger } from '@/lib/logger'
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
    publishedAt: z.string().optional(),
    createdAt: z.string().optional(),
    trainedWords: z.array(z.string()).optional(),
    downloadUrl: z.string().url().optional(),
    files: z.array(CivitaiFileSchema).optional(),
    images: z.array(CivitaiImageSchema).optional(),
    stats: CivitaiStatsSchema.optional(),
  })
  .passthrough()

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
  }
}

async function fetchCivitaiPayload(url: URL): Promise<unknown> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('Civitai request timed out'))
    }, CIVITAI_REQUEST_TIMEOUT_MS)
  })

  const requestPromise = fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 300 },
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Civitai request failed with status ${response.status}`)
    }
    return response.json() as Promise<unknown>
  })

  try {
    return await Promise.race([requestPromise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

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

  url.searchParams.set('types', 'LORA')
  url.searchParams.set('limit', String(pageSize))
  url.searchParams.set('sort', sort)
  url.searchParams.set('nsfw', 'false')
  if (normalizedSearch) {
    url.searchParams.set('query', normalizedSearch)
    if (nextPageCursor) url.searchParams.set('cursor', nextPageCursor)
  } else {
    url.searchParams.set('page', String(page))
  }
  if (baseModel !== 'all') url.searchParams.set('baseModels', baseModel)

  try {
    const parsed = CivitaiModelsResponseSchema.parse(
      await fetchCivitaiPayload(url),
    )
    const items = parsed.items
      .map(toLibraryItem)
      .filter((item): item is CivitaiLoraLibraryItem => Boolean(item))
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
      hasNextPage:
        Boolean(nextCursor) ||
        Boolean(parsed.metadata?.nextPage) ||
        (!normalizedSearch && items.length >= pageSize),
      nextCursor,
    }
  } catch (error) {
    logger.warn('Civitai LoRA library request failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      page,
      cursor: normalizedSearch ? nextPageCursor || null : null,
      search: normalizedSearch || undefined,
      baseModel,
      sort,
    })
    throw error
  }
}
