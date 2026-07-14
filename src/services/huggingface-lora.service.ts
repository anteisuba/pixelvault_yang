import 'server-only'

import { z } from 'zod'

import {
  HUGGINGFACE_LORA_ALLOWED_EXTENSION,
  HUGGINGFACE_LORA_ANIMA_ADAPTER_FILTER,
  HUGGINGFACE_LORA_API_BASE_URL,
  HUGGINGFACE_LORA_BASE_MODEL_FAMILY,
  HUGGINGFACE_LORA_CURATED_ANIMA_REPOS,
  HUGGINGFACE_LORA_DETAIL_CONCURRENCY,
  HUGGINGFACE_LORA_MAX_FILE_BYTES,
  HUGGINGFACE_LORA_MAX_CURSOR_SCANS,
  type HuggingFaceLoraFamily,
} from '@/constants/lora'
import { logger } from '@/lib/logger'
import { safeFetch } from '@/lib/url-guard'
import { withRetry } from '@/lib/with-retry'
import type {
  HuggingFaceLoraSearchItem,
  HuggingFaceLoraSearchQuery,
  HuggingFaceLoraSearchResult,
  LoraAssetType,
} from '@/types'
import { HuggingFaceLoraSearchResultSchema } from '@/types'

const HuggingFaceSiblingSchema = z
  .object({
    rfilename: z.string().min(1),
    size: z.number().int().nonnegative().optional(),
  })
  .passthrough()

const HuggingFaceWidgetSchema = z
  .object({
    output: z
      .object({
        url: z.string().url().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()

// Hugging Face exposes gated as `false`, `"auto"`, or `"manual"` in the
// Hub model API. Normalize all gated states to the boolean used by our
// discovery result so one unrelated repository cannot invalidate the whole
// response array.
const HuggingFaceGatedSchema = z
  .union([z.boolean(), z.enum(['auto', 'manual'])])
  .transform((value) => value !== false)

const HuggingFaceCardDataSchema = z
  .object({
    base_model: z.union([z.string(), z.array(z.string())]).nullish(),
    instance_prompt: z.string().nullish(),
    trigger_word: z.string().nullish(),
    trigger_words: z.union([z.string(), z.array(z.string())]).nullish(),
    activation_word: z.string().nullish(),
    license: z.string().nullish(),
    widget: z.array(HuggingFaceWidgetSchema).nullish(),
  })
  .passthrough()

const HuggingFaceModelSchema = z
  .object({
    id: z.string().min(1),
    sha: z.string().min(1).optional(),
    gated: HuggingFaceGatedSchema.default(false),
    private: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    likes: z.number().int().nonnegative().default(0),
    downloads: z.number().int().nonnegative().default(0),
    pipeline_tag: z.string().optional(),
    cardData: HuggingFaceCardDataSchema.nullish(),
    siblings: z.array(HuggingFaceSiblingSchema).default([]),
  })
  .passthrough()

const HUGGINGFACE_REQUEST_TIMEOUT_MS = 15_000

function buildHuggingFaceResolveUrl(
  repoId: string,
  revision: string,
  filename: string,
): string {
  const encodedFilename = filename
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `https://huggingface.co/${repoId}/resolve/${encodeURIComponent(revision)}/${encodedFilename}`
}

function getModelName(repoId: string): string {
  return repoId.split('/').at(-1)?.replace(/[-_]+/g, ' ').trim() || repoId
}

function getLicense(
  tags: readonly string[],
  cardData: z.infer<typeof HuggingFaceCardDataSchema> | null | undefined,
): string | null {
  if (cardData?.license?.trim()) return cardData.license.trim()
  const licenseTag = tags.find((tag) =>
    tag.toLowerCase().startsWith('license:'),
  )
  return licenseTag ? licenseTag.slice('license:'.length) : null
}

function getTriggerWord(
  cardData: z.infer<typeof HuggingFaceCardDataSchema> | null | undefined,
): string {
  const candidates: string[] = []
  const append = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    if (!trimmed || /^none$/i.test(trimmed) || trimmed === '-') return
    candidates.push(trimmed)
  }

  append(cardData?.trigger_word)
  append(cardData?.activation_word)
  if (Array.isArray(cardData?.trigger_words)) {
    append(cardData.trigger_words.filter(Boolean).join(', '))
  } else {
    append(cardData?.trigger_words)
  }
  append(cardData?.instance_prompt)

  // A repository name is not a trigger word. Returning an empty string keeps
  // no-trigger style/slider LoRAs from silently polluting the generation
  // prompt after import.
  return candidates[0] ?? ''
}

function isCuratedAnimaLoraRepo(repoId: string): boolean {
  return HUGGINGFACE_LORA_CURATED_ANIMA_REPOS.some(
    (candidate) => candidate.toLowerCase() === repoId.toLowerCase(),
  )
}

function matchesRepositorySearch(
  model: z.infer<typeof HuggingFaceModelSchema>,
  search: string,
): boolean {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const haystack = [
    model.id,
    getModelName(model.id),
    ...model.tags,
    ...model.siblings.map((file) => file.rfilename),
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

function getBaseModelText(
  cardData: z.infer<typeof HuggingFaceCardDataSchema> | null | undefined,
): string {
  const baseModel = cardData?.base_model
  return Array.isArray(baseModel) ? baseModel.join(' ') : (baseModel ?? '')
}

function isAnimaDitBaseModelReference(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false

  const modelName = normalized.split('/').at(-1) ?? normalized
  // Animagine and Anima Pencil are SDXL families despite sharing the `anima`
  // substring. They must never be surfaced in the Anima DiT library.
  if (modelName.includes('animagine') || modelName.includes('pencil')) {
    return false
  }

  return (
    modelName === 'anima' ||
    modelName.startsWith('anima_') ||
    modelName.startsWith('anima-') ||
    modelName.startsWith('anima ') ||
    modelName.endsWith('_anima') ||
    modelName.endsWith('-anima') ||
    modelName === 'animayume' ||
    /(^|[^a-z])anima$/.test(modelName)
  )
}

function inferLoraType(tags: readonly string[]): LoraAssetType {
  const normalized = tags.map((tag) => tag.toLowerCase())
  return normalized.some((tag) =>
    ['character', 'subject', 'concept', 'person'].some((token) =>
      tag.includes(token),
    ),
  )
    ? 'subject'
    : 'style'
}

function modelHasBaseFamily(
  model: z.infer<typeof HuggingFaceModelSchema>,
  baseModelFamily: string,
): boolean {
  if (baseModelFamily === 'all') return true
  const repositoryFamily = inferBaseModelFamily(model)
  return (
    repositoryFamily === baseModelFamily ||
    model.siblings.some(
      (file) =>
        file.rfilename
          .toLowerCase()
          .endsWith(HUGGINGFACE_LORA_ALLOWED_EXTENSION) &&
        inferFileBaseModelFamily(file.rfilename, repositoryFamily) ===
          baseModelFamily,
    )
  )
}

function inferBaseModelFamily(
  model: z.infer<typeof HuggingFaceModelSchema>,
): Exclude<HuggingFaceLoraFamily, 'all'> {
  if (isCuratedAnimaLoraRepo(model.id)) {
    return HUGGINGFACE_LORA_BASE_MODEL_FAMILY
  }
  const baseModelReferences = [
    ...model.tags
      .filter((tag) => tag.toLowerCase().startsWith('base_model:'))
      .map((tag) => tag.slice('base_model:'.length)),
    getBaseModelText(model.cardData),
  ]
  if (baseModelReferences.some(isAnimaDitBaseModelReference)) {
    return HUGGINGFACE_LORA_BASE_MODEL_FAMILY
  }
  const haystack = [
    model.id,
    model.pipeline_tag ?? '',
    ...model.tags,
    ...baseModelReferences,
  ]
    .join(' ')
    .toLowerCase()
  if (haystack.includes('illustrious') || haystack.includes('noobai')) {
    return 'illustrious'
  }
  if (haystack.includes('pony')) return 'pony'
  if (haystack.includes('qwen-image') || haystack.includes('qwen_image')) {
    return 'qwen-image'
  }
  if (haystack.includes('z-image') || haystack.includes('z_image')) {
    return 'z-image'
  }
  if (haystack.includes('flux')) return 'flux'
  if (
    haystack.includes('stable-diffusion-v1-5') ||
    haystack.includes('stable-diffusion-1.5') ||
    haystack.includes('sd 1.5') ||
    haystack.includes('sd1.5') ||
    haystack.includes('sd15')
  ) {
    return 'sd15'
  }
  if (haystack.includes('sdxl') || haystack.includes('stable-diffusion-xl')) {
    return 'sdxl'
  }
  return 'other'
}

function inferFileBaseModelFamily(
  filename: string,
  fallback: Exclude<HuggingFaceLoraFamily, 'all'>,
): Exclude<HuggingFaceLoraFamily, 'all'> {
  const value = filename.toLowerCase()
  if (
    value.includes('illustrious') ||
    value.includes('noobai') ||
    /(^|[_-])ilv(?:0?1|10)?([_.-]|$)/.test(value)
  ) {
    return 'illustrious'
  }
  if (value.includes('pony')) return 'pony'
  if (value.includes('qwen-image') || value.includes('qwen_image')) {
    return 'qwen-image'
  }
  if (value.includes('z-image') || value.includes('z_image')) return 'z-image'
  if (value.includes('flux')) return 'flux'
  if (value.includes('animagine') || value.includes('anmg')) return 'sdxl'
  if (
    value.includes('sd15') ||
    value.includes('sd1.5') ||
    value.includes('sd_1.5')
  ) {
    return 'sd15'
  }
  if (value.includes('sdxl')) return 'sdxl'
  return fallback
}

function isSupportedDiffusionLora(
  model: z.infer<typeof HuggingFaceModelSchema>,
): boolean {
  if (isCuratedAnimaLoraRepo(model.id)) return true

  const haystack = [
    model.id,
    model.pipeline_tag ?? '',
    ...model.tags,
    getBaseModelText(model.cardData),
  ]
    .join(' ')
    .toLowerCase()
  const pipelineTag = model.pipeline_tag?.trim().toLowerCase() ?? ''
  const normalizedTags = model.tags.map((tag) => tag.trim().toLowerCase())
  if (
    [
      'text-to-video',
      'image-to-video',
      'video-to-video',
      'text-generation',
      'text-to-speech',
      'automatic-speech-recognition',
      'audio-to-audio',
    ].includes(pipelineTag) ||
    normalizedTags.some((tag) =>
      ['video', 'audio', 'text-generation', 'text-to-speech'].includes(tag),
    )
  ) {
    return false
  }
  if (
    ['controlnet', 'lllite', 'ip-adapter', 't2i-adapter', 'text-encoder'].some(
      (token) => haystack.includes(token),
    )
  ) {
    return false
  }

  // `filter=lora` is global across the Hub and includes LLM, audio and video
  // adapters. Require image-diffusion evidence before admitting a repository
  // to the PixelVault image LoRA library.
  return (
    [
      'diffusers',
      'text-to-image',
      'image-to-image',
      'stable-diffusion',
      'sdxl',
      'illustrious',
      'noobai',
      'pony',
      'flux',
      'qwen-image',
      'qwen_image',
      'z-image',
      'z_image',
      'animagine',
    ].some((token) => haystack.includes(token)) ||
    getBaseModelReferences(model).some(isAnimaDitBaseModelReference)
  )
}

function getBaseModelReferences(
  model: z.infer<typeof HuggingFaceModelSchema>,
): string[] {
  return [
    ...model.tags
      .filter((tag) => tag.toLowerCase().startsWith('base_model:'))
      .map((tag) => tag.slice('base_model:'.length)),
    getBaseModelText(model.cardData),
  ].filter(Boolean)
}

function hasExplicitLoraTag(
  model: z.infer<typeof HuggingFaceModelSchema>,
): boolean {
  return model.tags.some((tag) => tag.trim().toLowerCase() === 'lora')
}

function isPotentialLoraCandidate(
  model: z.infer<typeof HuggingFaceModelSchema>,
  baseModelFamily: string,
): boolean {
  return (
    !model.private &&
    !model.gated &&
    (hasExplicitLoraTag(model) || isCuratedAnimaLoraRepo(model.id)) &&
    isSupportedDiffusionLora(model) &&
    modelHasBaseFamily(model, baseModelFamily) &&
    model.siblings.some((file) =>
      file.rfilename.toLowerCase().endsWith(HUGGINGFACE_LORA_ALLOWED_EXTENSION),
    )
  )
}

function needsFileSizeHydration(
  model: z.infer<typeof HuggingFaceModelSchema>,
): boolean {
  return model.siblings.some(
    (file) =>
      file.rfilename
        .toLowerCase()
        .endsWith(HUGGINGFACE_LORA_ALLOWED_EXTENSION) &&
      file.size === undefined,
  )
}

function encodeRepoId(repoId: string): string {
  return repoId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function fetchHuggingFaceModelDetail(
  repoId: string,
): Promise<z.infer<typeof HuggingFaceModelSchema>> {
  const url = `${HUGGINGFACE_LORA_API_BASE_URL}/models/${encodeRepoId(repoId)}?blobs=true`
  return withRetry(
    async () => {
      const response = await safeFetch(url, {
        allowedProtocols: ['https:'],
        signal: AbortSignal.timeout(HUGGINGFACE_REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`Hugging Face model detail failed (${response.status})`)
      }
      const payload = await response.json()
      const parsed = HuggingFaceModelSchema.safeParse(payload)
      if (!parsed.success) {
        throw new Error('Hugging Face returned unsupported model metadata')
      }
      return parsed.data
    },
    {
      maxAttempts: 2,
      baseDelayMs: 500,
      label: 'huggingface.loraDetail',
    },
  )
}

async function hydrateCandidateFileSizes(
  models: readonly z.infer<typeof HuggingFaceModelSchema>[],
): Promise<z.infer<typeof HuggingFaceModelSchema>[]> {
  const hydrated: z.infer<typeof HuggingFaceModelSchema>[] = []
  for (
    let index = 0;
    index < models.length;
    index += HUGGINGFACE_LORA_DETAIL_CONCURRENCY
  ) {
    const batch = models.slice(
      index,
      index + HUGGINGFACE_LORA_DETAIL_CONCURRENCY,
    )
    const settled = await Promise.all(
      batch.map(async (model) => {
        if (!needsFileSizeHydration(model)) return model
        try {
          return await fetchHuggingFaceModelDetail(model.id)
        } catch (error) {
          logger.warn('Hugging Face LoRA metadata verification failed', {
            repoId: model.id,
            error: error instanceof Error ? error.message : 'Unknown',
          })
          return null
        }
      }),
    )
    hydrated.push(
      ...settled.filter(
        (model): model is z.infer<typeof HuggingFaceModelSchema> =>
          model !== null,
      ),
    )
  }
  return hydrated
}

function toSearchItem(
  model: z.infer<typeof HuggingFaceModelSchema>,
  baseModelFamily: string,
): HuggingFaceLoraSearchItem | null {
  if (!isPotentialLoraCandidate(model, baseModelFamily)) {
    return null
  }

  const repositoryFamily = inferBaseModelFamily(model)
  const files = model.siblings
    .filter(
      (file) =>
        file.rfilename
          .toLowerCase()
          .endsWith(HUGGINGFACE_LORA_ALLOWED_EXTENSION) &&
        file.size !== undefined &&
        file.size <= HUGGINGFACE_LORA_MAX_FILE_BYTES,
    )
    .map((file) => ({
      filename: file.rfilename,
      downloadUrl: buildHuggingFaceResolveUrl(
        model.id,
        model.sha ?? 'main',
        file.rfilename,
      ),
      sizeBytes: file.size ?? null,
      baseModelFamily: inferFileBaseModelFamily(
        file.rfilename,
        repositoryFamily,
      ),
    }))
    .filter(
      (file) =>
        baseModelFamily === 'all' || file.baseModelFamily === baseModelFamily,
    )

  if (files.length === 0) {
    return null
  }

  const coverImageUrl = model.cardData?.widget
    ?.map((widget) => widget.output?.url)
    .find((url): url is string => Boolean(url))

  return {
    repoId: model.id,
    name: getModelName(model.id),
    modelPageUrl: `https://huggingface.co/${model.id}`,
    revision: model.sha ?? 'main',
    files,
    triggerWord: getTriggerWord(model.cardData),
    type: inferLoraType(model.tags),
    baseModelFamily: repositoryFamily,
    coverImageUrl: coverImageUrl ?? null,
    tags: model.tags,
    downloads: model.downloads,
    likes: model.likes,
    license: getLicense(model.tags, model.cardData),
    gated: model.gated,
    private: model.private,
  }
}

async function fetchHuggingFaceModelList(input: {
  filter: string
  search: string
  limit: number
  cursor?: string
}): Promise<{
  models: z.infer<typeof HuggingFaceModelSchema>[]
  nextCursor: string | null
}> {
  const params = new URLSearchParams({
    filter: input.filter,
    full: 'true',
    limit: String(input.limit),
    sort: 'downloads',
    direction: '-1',
  })
  if (input.search) params.set('search', input.search)
  if (input.cursor) params.set('cursor', input.cursor)

  const url = `${HUGGINGFACE_LORA_API_BASE_URL}/models?${params.toString()}`

  return withRetry(
    async () => {
      const response = await safeFetch(url, {
        allowedProtocols: ['https:'],
        signal: AbortSignal.timeout(HUGGINGFACE_REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`Hugging Face model search failed (${response.status})`)
      }

      const payload = await response.json()
      const parsed = z.array(HuggingFaceModelSchema).safeParse(payload)
      if (!parsed.success) {
        throw new Error('Hugging Face returned an unsupported model response')
      }
      return {
        models: parsed.data,
        nextCursor: parseNextCursor(response.headers?.get?.('link') ?? null),
      }
    },
    {
      maxAttempts: 2,
      baseDelayMs: 500,
      label: 'huggingface.loraSearch',
    },
  )
}

function parseNextCursor(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  for (const segment of linkHeader.split(',')) {
    const match = segment.match(/<([^>]+)>\s*;\s*rel="?next"?/i)
    if (!match?.[1]) continue
    try {
      const url = new URL(match[1])
      if (url.origin !== 'https://huggingface.co') return null
      return url.searchParams.get('cursor')
    } catch {
      return null
    }
  }
  return null
}

async function fetchCuratedAnimaLoraRepos(
  search: string,
): Promise<z.infer<typeof HuggingFaceModelSchema>[]> {
  const settled = await Promise.all(
    HUGGINGFACE_LORA_CURATED_ANIMA_REPOS.map(async (repoId) => {
      try {
        const model = await fetchHuggingFaceModelDetail(repoId)
        return matchesRepositorySearch(model, search) ? model : null
      } catch (error) {
        logger.warn('Curated Hugging Face LoRA repository unavailable', {
          repoId,
          error: error instanceof Error ? error.message : 'Unknown',
        })
        return null
      }
    }),
  )
  return settled.filter(
    (model): model is z.infer<typeof HuggingFaceModelSchema> => model !== null,
  )
}

function getDiscoveryFilter(baseModelFamily: string): string {
  return baseModelFamily === HUGGINGFACE_LORA_BASE_MODEL_FAMILY
    ? HUGGINGFACE_LORA_ANIMA_ADAPTER_FILTER
    : 'lora'
}

/**
 * Search public HF model repositories and expose concrete SafeTensors files
 * that the LoRA library can import. Pagination follows the Hub's official
 * `Link: rel=next` cursor. Fetching exactly the number of still-needed models
 * per scan prevents accepted repositories from being skipped when local image
 * and compatibility filters remove entries from a Hub page.
 */
export async function searchHuggingFaceLoras(
  query: HuggingFaceLoraSearchQuery,
): Promise<HuggingFaceLoraSearchResult> {
  try {
    const page = query.page ?? 1
    const items: HuggingFaceLoraSearchItem[] = []
    const seenRepoIds = new Set<string>()
    let nextCursor = query.cursor ?? null

    const includeCuratedAnima =
      page === 1 &&
      !query.cursor &&
      (query.baseModelFamily === 'all' ||
        query.baseModelFamily === HUGGINGFACE_LORA_BASE_MODEL_FAMILY)
    if (includeCuratedAnima) {
      const curatedModels = await fetchCuratedAnimaLoraRepos(query.search)
      for (const model of curatedModels) {
        const item = toSearchItem(model, query.baseModelFamily)
        if (!item || items.length >= query.limit) continue
        items.push(item)
        seenRepoIds.add(item.repoId.toLowerCase())
      }
    }

    for (
      let scan = 0;
      scan < HUGGINGFACE_LORA_MAX_CURSOR_SCANS && items.length < query.limit;
      scan += 1
    ) {
      const remaining = query.limit - items.length
      const hubPage = await fetchHuggingFaceModelList({
        filter: getDiscoveryFilter(query.baseModelFamily),
        search: query.search,
        limit: remaining,
        cursor: nextCursor ?? undefined,
      })
      nextCursor = hubPage.nextCursor

      const candidates = hubPage.models.filter(
        (model) =>
          !seenRepoIds.has(model.id.toLowerCase()) &&
          isPotentialLoraCandidate(model, query.baseModelFamily),
      )
      const verifiedModels = await hydrateCandidateFileSizes(candidates)
      for (const model of verifiedModels) {
        const item = toSearchItem(model, query.baseModelFamily)
        if (!item || items.length >= query.limit) continue
        items.push(item)
        seenRepoIds.add(item.repoId.toLowerCase())
      }

      if (!nextCursor || hubPage.models.length === 0) break
    }

    const result = {
      items,
      total: null,
      page,
      limit: query.limit,
      hasNextPage: Boolean(nextCursor),
      nextCursor,
    }
    return HuggingFaceLoraSearchResultSchema.parse(result)
  } catch (error) {
    logger.warn('Hugging Face LoRA search failed', {
      search: query.search,
      baseModelFamily: query.baseModelFamily,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    throw error
  }
}
