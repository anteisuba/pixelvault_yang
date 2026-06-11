import 'server-only'

import { z } from 'zod'

import {
  CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  CIVITAI_LORA_BASE_MODEL_VALUES,
  CIVITAI_LORA_PAGE_SIZE,
  CIVITAI_LORA_SORT_VALUES,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
} from '@/constants/lora'
import {
  extractActivationSegment,
  summariseActivationSegments,
} from '@/lib/civitai-image-prompt-mine'
import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cleanRecommendedPrompt } from '@/lib/lora-trigger-clean'
import { extractCivitaiTrigger } from '@/lib/lora-trigger-extract'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import type {
  CivitaiImageRecipe,
  CivitaiLoraLibraryItem,
  CivitaiLoraLibraryResult,
  CivitaiMinedPromptsResult,
  CivitaiRecipeExtraLora,
  LoraAssetType,
} from '@/types'

const CIVITAI_MODELS_API = 'https://civitai.com/api/v1/models'
const CIVITAI_MODEL_VERSIONS_API = 'https://civitai.com/api/v1/model-versions'
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
    name: z.string().optional(),
    primary: z.boolean().optional(),
    downloadUrl: z.string().url().optional(),
    // Civitai returns multiple hash algorithms per file; AutoV3 is the one
    // that matches the `<lora:NAME:weight>` resources entry in user
    // generation metadata. Kept passthrough so future hash types come
    // through without schema churn.
    hashes: z.record(z.string(), z.string()).optional(),
  })
  .passthrough()

const CivitaiImageResourceSchema = z
  .object({
    hash: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    weight: z.number().optional(),
  })
  .passthrough()

// Newer onsite generations identify resources by Civitai version id instead
// of file hash — this is how we recover the LoRA's real weight when the
// legacy `resources` array only lists the checkpoint.
const CivitaiResourceByVersionSchema = z
  .object({
    type: z.string().optional(),
    weight: z.number().optional(),
    modelVersionId: z.number().optional(),
  })
  .passthrough()

const CivitaiImageMetaSchema = z
  .object({
    prompt: z.string().optional(),
    negativePrompt: z.string().optional(),
    resources: z.array(CivitaiImageResourceSchema).optional(),
    civitaiResources: z.array(CivitaiResourceByVersionSchema).optional(),
  })
  .passthrough()

const CivitaiImageSchema = z
  .object({
    url: z.string().url(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    nsfwLevel: z.number().optional(),
    hasMeta: z.boolean().optional(),
    hasPositivePrompt: z.boolean().optional(),
    meta: CivitaiImageMetaSchema.nullable().optional(),
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
    // Civitai 富文本 description — character LoRA 作者常把真正的激活
    // prompt 放在这里的 `<pre><code>` 块里（trainedWords 字段反而空着）。
    // 这是我们抢救「trainedWords 空但 LoRA 仍有可用 prompt」case 的关键
    // 数据源；进一步还可以走 /api/v1/images?modelId=X 拿用户生成统计。
    description: z.string().nullable().optional(),
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

const CivitaiModelVersionDetailSchema = z
  .object({
    id: z.number(),
    modelId: z.number().optional(),
    model: z
      .object({
        id: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

// ── 收藏自愈回填（解法一，docs/plans/lora-recipe-workflow.md）──────────
//
// 旧收藏行缺 civitaiModelId / civitaiFileHashAutoV3 / 封面（字段后加），
// 导致来源图挖掘 no-op。versionId 可从 loraUrl 恢复，其余标识由本函数
// 从 model-versions/:id 一次取回。

const CivitaiVersionBackfillSchema = CivitaiModelVersionSchema.extend({
  modelId: z.number().optional(),
})

export interface CivitaiVersionIdentifiers {
  modelId: number | null
  fileHashAutoV3: string | null
  coverImageUrl: string | null
}

// ── 一键补挂：按 hash / versionId 把"配方里的其它 LoRA"解析成可挂载项 ──
//
// by-hash 端点实测（2026-06-11）：返回完整 version 负载（modelId、
// model.{name,type}、downloadUrl、files、images、baseModel），hash 大小
// 写不敏感。解析后构造单版本伪 model 复用 toLibraryItem 的全套抽取
// （触发词/封面/家族/AutoV3），产出与社区库一致的可挂载条目。

const CivitaiVersionResolveSchema = CivitaiModelVersionSchema.extend({
  modelId: z.number().optional(),
  model: z
    .object({
      name: z.string().optional(),
      type: z.string().optional(),
    })
    .passthrough()
    .optional(),
})

export interface ResolveCivitaiLoraReference {
  hash?: string | null
  modelVersionId?: number | null
  /**
   * meta 里的 LoRA 名（≈ 文件名词干）。hash/versionId 都失败或缺失时的
   * 搜索兜底：query 搜索 → 候选版本文件名词干与 name 精确匹配（大小写
   * 不敏感）才算命中 — 不做模糊接受，避免挂错模型。
   */
  name?: string | null
}

const CIVITAI_RESOLVE_SEARCH_LIMIT = 10

async function resolveCivitaiLoraByLocator(
  hash: string | null | undefined,
  modelVersionId: number | null | undefined,
): Promise<CivitaiLoraLibraryItem | null> {
  const url = modelVersionId
    ? new URL(`${CIVITAI_MODEL_VERSIONS_API}/${modelVersionId}`)
    : hash
      ? new URL(`${CIVITAI_MODEL_VERSIONS_API}/by-hash/${hash.toLowerCase()}`)
      : null
  if (!url) return null

  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.resolveLoraReference',
    })
  } catch (error) {
    logger.warn('Civitai LoRA reference resolve failed', {
      hash: hash ?? null,
      modelVersionId: modelVersionId ?? null,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return null
  }

  const parsed = CivitaiVersionResolveSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn('Civitai LoRA reference response had unexpected shape', {
      hash: hash ?? null,
      modelVersionId: modelVersionId ?? null,
      issues: parsed.error.issues.map((issue) => issue.message).join('; '),
    })
    return null
  }

  const { modelId, model, ...version } = parsed.data
  return toLibraryItem({
    id: modelId ?? 0,
    name: model?.name ?? version.name,
    type: model?.type ?? 'LORA',
    tags: [],
    modelVersions: [version],
  })
}

/**
 * Civitai 搜索不拆 camelCase：query=EnchantingEyesIllustrious 命中 0，
 * query=Enchanting Eyes Illustrious 命中（实测 2026-06-11）。搜索词按
 * camel 边界和 -_ 分隔符拆词；点号保留（v1.1 拆开反而伤命中）。
 */
function nameToSearchQuery(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 词干比对键：小写 + 去空格/横线/下划线/点。仍是全长严格相等 — 只是
 * 容忍 meta 名与文件名之间的分隔符差异，不做前缀/包含式模糊匹配。
 */
function normalizeStemKey(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.]+/g, '')
}

/**
 * 名字搜索兜底。实测依据（2026-06-11）：图 meta 的 resources hash 常是
 * 作者本地文件（剪枝/转码副本）的 hash，by-hash 对不上 Civitai 索引；
 * 但 meta 名字 ≈ 上架文件的词干（如 "EnchantingEyesIllustrious" ↔
 * EnchantingEyesIllustrious.safetensors），词干精确匹配即可确定性定位。
 */
async function resolveCivitaiLoraByNameStem(
  name: string,
): Promise<CivitaiLoraLibraryItem | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const url = new URL(CIVITAI_MODELS_API)
  url.searchParams.set('types', 'LORA')
  url.searchParams.set('limit', String(CIVITAI_RESOLVE_SEARCH_LIMIT))
  url.searchParams.set('query', nameToSearchQuery(trimmed))

  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.resolveLoraByName',
    })
  } catch (error) {
    logger.warn('Civitai LoRA name search failed', {
      name: trimmed,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return null
  }

  const parsed = CivitaiModelsResponseSchema.safeParse(payload)
  if (!parsed.success) return null

  const target = normalizeStemKey(trimmed)
  for (const model of parsed.data.items) {
    for (const version of model.modelVersions ?? []) {
      const matched = version.files?.some(
        (file) =>
          file.name && normalizeStemKey(fileNameStem(file.name)) === target,
      )
      if (matched) {
        return toLibraryItem({ ...model, modelVersions: [version] })
      }
    }
  }
  return null
}

export async function resolveCivitaiLoraByReference({
  hash,
  modelVersionId,
  name,
}: ResolveCivitaiLoraReference): Promise<CivitaiLoraLibraryItem | null> {
  if (hash || modelVersionId) {
    const direct = await resolveCivitaiLoraByLocator(hash, modelVersionId)
    if (direct) return direct
  }
  if (name) {
    return resolveCivitaiLoraByNameStem(name)
  }
  return null
}

export async function fetchCivitaiVersionIdentifiers(
  modelVersionId: number,
): Promise<CivitaiVersionIdentifiers | null> {
  const url = new URL(`${CIVITAI_MODEL_VERSIONS_API}/${modelVersionId}`)

  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.backfillIdentifiers',
    })
  } catch (error) {
    logger.warn('Civitai identifier backfill fetch failed', {
      modelVersionId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return null
  }

  const parsed = CivitaiVersionBackfillSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn('Civitai identifier backfill response had unexpected shape', {
      modelVersionId,
      issues: parsed.error.issues.map((issue) => issue.message).join('; '),
    })
    return null
  }

  const primaryFile =
    parsed.data.files?.find((f) => f.primary && f.type === 'Model') ??
    parsed.data.files?.find((f) => f.type === 'Model')
  const fileHashAutoV3 = primaryFile?.hashes?.AutoV3
    ? primaryFile.hashes.AutoV3.toLowerCase()
    : null

  const coverOriginal =
    parsed.data.images?.find(
      (image) =>
        (image.nsfwLevel ?? 1) <= CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
    )?.url ?? null

  return {
    modelId: parsed.data.modelId ?? null,
    fileHashAutoV3,
    coverImageUrl: coverOriginal
      ? rewriteCivitaiImageUrl(coverOriginal, { width: CIVITAI_COVER_WIDTH })
      : null,
  }
}

export interface ListCivitaiLorasInput {
  page?: number
  pageSize?: number
  cursor?: string | null
  search?: string
  baseModel?: CivitaiLoraBaseModel
  sort?: CivitaiLoraSort
}

export interface CivitaiLoraPrewarmEntry {
  baseModel: CivitaiLoraBaseModel
  sort: CivitaiLoraSort
  ok: boolean
  itemCount: number
  hasNextPage: boolean
  nextCursor: string | null
  durationMs: number
  error?: string
}

export interface CivitaiLoraPrewarmResult {
  checkedAt: string
  total: number
  successCount: number
  failureCount: number
  entries: CivitaiLoraPrewarmEntry[]
}

const CIVITAI_SEARCH_BASE_MODEL_SCAN_LIMIT = 40
const CIVITAI_SEARCH_BASE_MODEL_MAX_SCAN_PAGES = 5

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

// 各场景下的目标渲染宽度（CSS px），用于把 Civitai 默认 `original=true` 的
// 大图（1–5 MB）改写成对应尺寸的 transform。Retina 屏 ×2 在大多数列表场景
// 已经够清；超出的 LCP/带宽成本远大于细节收益。
const CIVITAI_THUMB_WIDTH = 96 // 列表 row 40×40 缩略
const CIVITAI_COVER_WIDTH = 640 // Inspector aspect-video / AssetCard square
const CIVITAI_PREVIEW_WIDTH = 768 // 预留：未来的预览画廊 / 大图轮播

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
  const originalImageUrls = pickImages(version)
  const coverOriginal = originalImageUrls[0] ?? null
  const previewImageUrls = originalImageUrls.map((url) =>
    rewriteCivitaiImageUrl(url, { width: CIVITAI_PREVIEW_WIDTH }),
  )
  const coverImageUrl = coverOriginal
    ? rewriteCivitaiImageUrl(coverOriginal, { width: CIVITAI_COVER_WIDTH })
    : null
  const thumbImageUrl = coverOriginal
    ? rewriteCivitaiImageUrl(coverOriginal, { width: CIVITAI_THUMB_WIDTH })
    : null
  const baseModelFamily = version.baseModel?.trim() || 'unknown'
  // 触发词抽取的复杂度（拆 comma / 去 SD 语法 / 多 outfit / 从模型名兜底）
  // 全部封装在 `extractCivitaiTrigger`。旧实现取 trainedWords[0] 整段、然后
  // fallback 到 tags[0]（基本上是 'character'/'style' 分类标签），导致用户
  // 看到的触发词大概率是错的或污染的 — 见 lora-trigger-clean / -extract 的
  // 测试用例覆盖的 5 种真实模式。
  const triggerInfo = extractCivitaiTrigger({
    trainedWords: version.trainedWords,
    modelName: model.name,
    descriptionHtml: model.description ?? null,
  })

  // AutoV3 is the Civitai hash variant referenced by the `resources` array
  // in user generation metadata. Other hash types (AutoV1, SHA256, BLAKE3,
  // CRC32) won't match, so we surface AutoV3 specifically. Normalise to
  // lower-case because the prompt-side resource entries are lower-case.
  const primaryFile =
    version.files?.find((f) => f.primary && f.type === 'Model') ??
    version.files?.find((f) => f.type === 'Model')
  const fileHashAutoV3 = primaryFile?.hashes?.AutoV3
    ? primaryFile.hashes.AutoV3.toLowerCase()
    : null

  return {
    id: `civitai:${model.id}:${version.id}`,
    styleCode: `civitai-${version.id}`,
    name: model.name,
    source: 'imported',
    type: inferLoraType(tags, model.name),
    baseModelFamily,
    provider: 'civitai',
    triggerWord: triggerInfo.trigger,
    fileHashAutoV3,
    triggerAlternates: triggerInfo.alternates,
    recommendedPrompt: triggerInfo.recommendedPrompt,
    recommendedPromptAlternates: triggerInfo.recommendedPromptAlternates,
    triggerSource: triggerInfo.source,
    loraUrl,
    coverImageUrl,
    coverImageUrlOriginal: coverOriginal,
    thumbImageUrl,
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
      // Message must contain the substring 'timeout' so withRetry's
      // defaultIsRetryable treats this as transient and retries (~3×).
      // Without it ("timed out" ≠ "timeout"), retry silently no-ops and
      // a single Civitai blip surfaces to the user as 502.
      reject(new CivitaiFetchError('Civitai request timeout (timed out)'))
    }, CIVITAI_REQUEST_TIMEOUT_MS)
  })
  // When fetch wins the race, Promise.race ignores timeoutPromise but the
  // rejection still fires later and surfaces as "unhandled rejection".
  // The race result is the authoritative outcome; this catch just absorbs
  // the late reject so it doesn't pollute logs / test runners.
  timeoutPromise.catch(() => {})

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

export async function resolveCivitaiModelPageUrlByVersion(
  modelVersionId: number,
): Promise<string | null> {
  const url = new URL(`${CIVITAI_MODEL_VERSIONS_API}/${modelVersionId}`)
  const payload = await withRetry(() => fetchCivitaiPayload(url), {
    maxAttempts: 3,
    baseDelayMs: 400,
    maxDelayMs: 2000,
    label: 'civitai.resolveModelVersion',
  })
  const parsed = CivitaiModelVersionDetailSchema.safeParse(payload)

  if (!parsed.success) {
    logger.warn('Civitai model version response had an unexpected shape', {
      modelVersionId,
      issues: parsed.error.issues.map((issue) => issue.message).join('; '),
    })
    return null
  }

  const modelId = parsed.data.modelId ?? parsed.data.model?.id ?? null
  if (!modelId) {
    logger.warn('Civitai model version response did not include a model id', {
      modelVersionId,
    })
    return null
  }

  return `https://civitai.com/models/${modelId}?modelVersionId=${modelVersionId}`
}

function parseNextCursor(
  metadata: z.infer<typeof CivitaiModelsResponseSchema>['metadata'],
): string | null {
  return metadata?.nextCursor === undefined || metadata.nextCursor === null
    ? null
    : String(metadata.nextCursor)
}

function filterByBaseModelFamily(
  items: CivitaiLoraLibraryItem[],
  baseModel: CivitaiLoraBaseModel,
): CivitaiLoraLibraryItem[] {
  if (baseModel === 'all') return items
  const accepted = new Set<string>(CIVITAI_BASE_MODEL_FAMILY_MEMBERS[baseModel])
  return items.filter((item) => accepted.has(item.baseModelFamily))
}

function appendUniqueLibraryItems(
  target: CivitaiLoraLibraryItem[],
  incoming: CivitaiLoraLibraryItem[],
): void {
  const seen = new Set(target.map((item) => item.id))
  for (const item of incoming) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    target.push(item)
  }
}

function dedupeLibraryItems(
  items: CivitaiLoraLibraryItem[],
): CivitaiLoraLibraryItem[] {
  const result: CivitaiLoraLibraryItem[] = []
  appendUniqueLibraryItems(result, items)
  return result
}

function appendBaseModelFamilyParams(
  url: URL,
  baseModel: Exclude<CivitaiLoraBaseModel, 'all'>,
): void {
  CIVITAI_BASE_MODEL_FAMILY_MEMBERS[baseModel].forEach((familyMember) => {
    url.searchParams.append('baseModels', familyMember)
  })
}

async function fetchCivitaiLoraPage(url: URL): Promise<{
  items: CivitaiLoraLibraryItem[]
  total: number | null
  nextCursor: string | null
  hasNextPage: boolean
}> {
  const payload = await withRetry(() => fetchCivitaiPayload(url), {
    maxAttempts: 3,
    baseDelayMs: 400,
    maxDelayMs: 2000,
    label: 'civitai.listLoras',
  })
  const parsed = CivitaiModelsResponseSchema.parse(payload)
  const items = dedupeLibraryItems(
    parsed.items
      .map(toLibraryItem)
      .filter((item): item is CivitaiLoraLibraryItem => Boolean(item)),
  )

  return {
    items,
    total: parsed.metadata?.totalItems ?? null,
    nextCursor: parseNextCursor(parsed.metadata),
    hasNextPage:
      Boolean(parsed.metadata?.nextCursor) ||
      Boolean(parsed.metadata?.nextPage),
  }
}

async function listSearchedBaseModelCivitaiLoras({
  page,
  pageSize,
  search,
  baseModel,
  sort,
}: {
  page: number
  pageSize: number
  search: string
  baseModel: Exclude<CivitaiLoraBaseModel, 'all'>
  sort: CivitaiLoraSort
}): Promise<CivitaiLoraLibraryResult> {
  const end = page * pageSize
  const start = end - pageSize
  const collected: CivitaiLoraLibraryItem[] = []
  let upstreamCursor: string | null = null
  let scannedPages = 0
  let upstreamHasNextPage = true

  while (
    collected.length <= end &&
    upstreamHasNextPage &&
    scannedPages < CIVITAI_SEARCH_BASE_MODEL_MAX_SCAN_PAGES
  ) {
    const url = new URL(CIVITAI_MODELS_API)
    url.searchParams.set('types', 'LORA')
    url.searchParams.set('limit', String(CIVITAI_SEARCH_BASE_MODEL_SCAN_LIMIT))
    url.searchParams.set('sort', sort)
    url.searchParams.set('nsfw', 'false')
    url.searchParams.set('query', search)
    if (upstreamCursor) url.searchParams.set('cursor', upstreamCursor)
    appendBaseModelFamilyParams(url, baseModel)

    const result = await fetchCivitaiLoraPage(url)
    appendUniqueLibraryItems(
      collected,
      filterByBaseModelFamily(result.items, baseModel),
    )
    upstreamCursor = result.nextCursor
    upstreamHasNextPage = result.hasNextPage && Boolean(upstreamCursor)
    scannedPages += 1
  }

  const hasBufferedNextPage = collected.length > end
  const hasNextPage =
    hasBufferedNextPage ||
    (upstreamHasNextPage &&
      scannedPages < CIVITAI_SEARCH_BASE_MODEL_MAX_SCAN_PAGES)

  return {
    items: collected.slice(start, end),
    page,
    pageSize,
    total: null,
    hasNextPage,
    nextCursor: hasNextPage ? `search-scan:${page + 1}` : null,
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
  if (normalizedSearch && baseModel !== 'all') {
    return listSearchedBaseModelCivitaiLoras({
      page,
      pageSize,
      search: normalizedSearch,
      baseModel,
      sort,
    })
  }

  const upstreamLimit = pageSize

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
  if (baseModel !== 'all') {
    appendBaseModelFamilyParams(url, baseModel)
  }
  // Keep non-search filtering upstream so Civitai applies sort over the full
  // result set before pagination. Search + baseModel uses the scan path above
  // because Civitai under-fills `query + baseModels` at small limits.

  try {
    // Civitai's public API blips with intermittent 5xx/timeouts — withRetry
    // wraps three attempts with exponential backoff. Our CivitaiFetchError
    // carries `.status` so the default retry classifier lets 4xx fail fast
    // (a bad query won't get better by hammering it).
    const result = await fetchCivitaiLoraPage(url)
    const filteredItems = filterByBaseModelFamily(result.items, baseModel)

    const items = filteredItems.slice(0, pageSize)

    return {
      items,
      page,
      pageSize,
      total: result.total,
      // When a filter is on, upstream pagination is the only reliable signal —
      // even if this page yielded 0 filtered items, the next upstream page
      // might still have matches. Trust upstream's nextCursor / nextPage.
      hasNextPage:
        result.hasNextPage ||
        (!normalizedSearch && result.items.length >= upstreamLimit),
      nextCursor: result.nextCursor,
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

const CIVITAI_LORA_PREWARM_CONCURRENCY = 3

export async function prewarmCivitaiLoraLibrary(): Promise<CivitaiLoraPrewarmResult> {
  const tasks = CIVITAI_LORA_BASE_MODEL_VALUES.flatMap((baseModel) =>
    CIVITAI_LORA_SORT_VALUES.map((sort) => ({ baseModel, sort })),
  )
  const entries: CivitaiLoraPrewarmEntry[] = new Array(tasks.length)
  let nextTaskIndex = 0

  async function runNextTask(): Promise<void> {
    while (nextTaskIndex < tasks.length) {
      const taskIndex = nextTaskIndex
      nextTaskIndex += 1
      const task = tasks[taskIndex]
      if (!task) return

      const startedAt = Date.now()
      try {
        const result = await listCivitaiLoras({
          page: 1,
          pageSize: CIVITAI_LORA_PAGE_SIZE,
          baseModel: task.baseModel,
          sort: task.sort,
        })
        entries[taskIndex] = {
          baseModel: task.baseModel,
          sort: task.sort,
          ok: true,
          itemCount: result.items.length,
          hasNextPage: result.hasNextPage,
          nextCursor: result.nextCursor,
          durationMs: Date.now() - startedAt,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown prewarm failure'
        entries[taskIndex] = {
          baseModel: task.baseModel,
          sort: task.sort,
          ok: false,
          itemCount: 0,
          hasNextPage: false,
          nextCursor: null,
          durationMs: Date.now() - startedAt,
          error: message,
        }
        logger.warn('Civitai LoRA prewarm task failed', {
          baseModel: task.baseModel,
          sort: task.sort,
          error: message,
        })
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CIVITAI_LORA_PREWARM_CONCURRENCY, tasks.length) },
      () => runNextTask(),
    ),
  )

  const completedEntries = entries.filter(
    (entry): entry is CivitaiLoraPrewarmEntry => Boolean(entry),
  )
  const successCount = completedEntries.filter((entry) => entry.ok).length
  const failureCount = completedEntries.length - successCount

  if (failureCount > 0) {
    logger.warn('Civitai LoRA prewarm completed with failures', {
      total: completedEntries.length,
      successCount,
      failureCount,
    })
  }

  return {
    checkedAt: new Date().toISOString(),
    total: completedEntries.length,
    successCount,
    failureCount,
    entries: completedEntries,
  }
}

// ─── Phase 2: recover source prompts + per-image recipes ───────────────
//
// Source confidence order (verified live 2026-06-11, see
// docs/plans/lora-recipe-workflow.md):
//   1. /api/v1/model-versions/:id images[].meta — the LoRA page source/
//      reference images; ≥96 % carry a full recipe (prompt, negativePrompt,
//      seed, steps, cfgScale, Size, resources) in sampled top LoRAs.
//   2. /api/v1/images?modelVersionId= — community generations. `withMeta`
//      defaults to FALSE: without it `meta` is always null (this was the
//      old "community meta is mostly missing" misdiagnosis). Query by
//      modelVersionId (modelId-only risks Cloudflare timeouts per official
//      docs) and browsingLevel=1 (legacy `nsfw=false` behaves erratically).
//   3. Author description/trainedWords stay on the library item; they are
//      author-filled hints, not source-image prompts.
//
// Two views are produced from the same data:
//   outfits — prompt-deduped text view (legacy consumers, chip selector)
//   recipes — per-image full-parameter view (M2 source-image grid →
//             "一键同款"), capped at CIVITAI_IMAGES_RECIPE_CAP

const CIVITAI_IMAGES_API = 'https://civitai.com/api/v1/images'
const CIVITAI_IMAGES_SAMPLE_LIMIT = 30
const CIVITAI_IMAGES_OUTFIT_CAP = 6
const CIVITAI_IMAGES_RECIPE_CAP = 12
// /api/v1/images browsingLevel bitmask: 1 = SFW only.
const CIVITAI_IMAGES_BROWSING_LEVEL_SFW = 1
// model-versions images[] use the numeric nsfwLevel scale; ≤2 ≈ SFW/Soft.
const CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL = 2

const CivitaiImageMetaInnerSchema = z
  .object({
    prompt: z.string().optional(),
    resources: z.array(CivitaiImageResourceSchema).optional(),
    civitaiResources: z.array(CivitaiResourceByVersionSchema).optional(),
  })
  .passthrough()

// Civitai's /images endpoint returns two different `meta` shapes depending
// on which query params you pass (verified live):
//   - Single layer (when modelVersionId + sort are set):
//       img.meta = { prompt, resources, ... }
//   - Double-nested (when only modelId is set):
//       img.meta = { id, meta: { prompt, resources, ... } }
// We pass through both layers so the consumer can try inner-then-outer.
const CivitaiImageItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    url: z.string().url().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    meta: z
      .object({
        prompt: z.string().optional(),
        resources: z.array(CivitaiImageResourceSchema).optional(),
        civitaiResources: z.array(CivitaiResourceByVersionSchema).optional(),
        meta: CivitaiImageMetaInnerSchema.optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

const CivitaiImagesResponseSchema = z
  .object({
    items: z.array(CivitaiImageItemSchema),
  })
  .passthrough()

// ── meta → recipe field extraction ──────────────────────────────────────
//
// Civitai image meta is uploader-supplied A1111-style data: numbers arrive
// as numbers OR strings, key casing varies ("clipSkip" vs "Clip skip",
// "Size"). Extraction is defensive coercion, never validation — a recipe
// with a weird cfgScale should still surface; the mapping layer
// (civitai-recipe-to-generation) decides what is applicable.

function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function coerceInteger(value: unknown): number | undefined {
  const parsed = coerceFiniteNumber(value)
  if (parsed === undefined) return undefined
  return Number.isInteger(parsed) ? parsed : Math.round(parsed)
}

function coerceTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

type RecipeMetaParams = Pick<
  CivitaiImageRecipe,
  | 'negativePrompt'
  | 'seed'
  | 'steps'
  | 'cfgScale'
  | 'sampler'
  | 'clipSkip'
  | 'sizeRaw'
  | 'checkpoint'
>

function extractRecipeMetaParams(
  meta: Record<string, unknown>,
): RecipeMetaParams {
  return {
    negativePrompt: coerceTrimmedString(meta.negativePrompt),
    seed: coerceInteger(meta.seed),
    steps: coerceInteger(meta.steps),
    cfgScale: coerceFiniteNumber(meta.cfgScale),
    sampler: coerceTrimmedString(meta.sampler),
    clipSkip: coerceInteger(meta.clipSkip ?? meta['Clip skip']),
    sizeRaw: coerceTrimmedString(meta.Size ?? meta.size),
    checkpoint: coerceTrimmedString(meta.Model),
  }
}

type CivitaiImageResource = z.infer<typeof CivitaiImageResourceSchema>
type CivitaiResourceByVersion = z.infer<typeof CivitaiResourceByVersionSchema>

interface RecipeLoraResources {
  loraWeight?: number
  extraLoras?: CivitaiRecipeExtraLora[]
}

// SD WebUI in-prompt LoRA syntax: `<lora:name:weight>` (weight optional,
// defaults to 1; can be negative for slider LoRAs). RAW prompt only — the
// cleaned recipe prompt has these stripped.
const PROMPT_LORA_TAG_RE = /<lora:([^:>]+?)(?::\s*(-?\d+(?:\.\d+)?))?\s*>/gi

interface PromptLoraTag {
  name: string
  weight?: number
}

function parsePromptLoraTags(rawPrompt: string): PromptLoraTag[] {
  const tags: PromptLoraTag[] = []
  for (const match of rawPrompt.matchAll(PROMPT_LORA_TAG_RE)) {
    const name = match[1]?.trim()
    if (!name) continue
    const weight = match[2] !== undefined ? Number(match[2]) : undefined
    tags.push({
      name,
      weight:
        weight !== undefined && Number.isFinite(weight) ? weight : undefined,
    })
  }
  return tags
}

/** "add-detail-xl.safetensors" → "add-detail-xl" (in-prompt tag name). */
function fileNameStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase()
}

interface RecipeLoraSignalInput {
  /** RAW (pre-clean) prompt — needed for `<lora:..>` tag parsing. */
  rawPrompt: string
  resources: readonly CivitaiImageResource[] | undefined
  civitaiResources: readonly CivitaiResourceByVersion[] | undefined
  targetHashLower: string | null
  targetModelVersionId: number | null
  /** Lower-cased name hints for the target LoRA's in-prompt tag (file stems). */
  targetNameHints: readonly string[]
}

/**
 * Recover "the target LoRA's real weight in this image" plus "other LoRAs
 * stacked on the same image" from the three places Civitai meta encodes
 * resource usage (verified live 2026-06-11):
 *   1. `resources[].hash` — legacy A1111 metas; often lists ONLY the
 *      checkpoint, so a miss here is normal.
 *   2. `civitaiResources[].modelVersionId` — newer onsite generations.
 *   3. `<lora:name:weight>` tags in the raw prompt — matched against the
 *      version's file-name stems, or assumed when it is the only tag.
 * Non-empty `extraLoras` means mounting only the target LoRA cannot fully
 * reproduce the image — the UI must surface that instead of letting the
 * user blame themselves for a mismatch.
 */
function resolveRecipeLoraSignals({
  rawPrompt,
  resources,
  civitaiResources,
  targetHashLower,
  targetModelVersionId,
  targetNameHints,
}: RecipeLoraSignalInput): RecipeLoraResources {
  const matchedResource = targetHashLower
    ? resources?.find((r) => r.hash?.toLowerCase() === targetHashLower)
    : undefined
  const matchedByVersion =
    targetModelVersionId !== null
      ? civitaiResources?.find(
          (r) =>
            r.modelVersionId === targetModelVersionId &&
            (r.type ?? 'lora').toLowerCase() === 'lora',
        )
      : undefined

  const promptTags = parsePromptLoraTags(rawPrompt)
  const knownTargetNames = new Set<string>(targetNameHints)
  if (matchedResource?.name) {
    knownTargetNames.add(matchedResource.name.toLowerCase())
  }
  let targetTag = promptTags.find((tag) =>
    knownTargetNames.has(tag.name.toLowerCase()),
  )
  // A model version's own gallery image with exactly one LoRA tag is, in
  // practice, that LoRA — accept it when nothing identified the tag by name.
  if (!targetTag && promptTags.length === 1) targetTag = promptTags[0]

  const loraWeight =
    matchedResource?.weight ?? matchedByVersion?.weight ?? targetTag?.weight

  // Extras carry their locator (hash / modelVersionId) whenever the meta
  // had one — that is what powers "一键补挂": hash → by-hash endpoint,
  // modelVersionId → /:id. Prompt-tag extras only have a name (cannot be
  // auto-located).
  const extras: CivitaiRecipeExtraLora[] = []
  const seenNames = new Set<string>()
  const seenVersionIds = new Set<number>()
  for (const r of resources ?? []) {
    if (r === matchedResource || (r.type ?? '').toLowerCase() !== 'lora') {
      continue
    }
    const key = r.name?.toLowerCase()
    if (key) {
      if (seenNames.has(key) || knownTargetNames.has(key)) continue
      seenNames.add(key)
    }
    extras.push({
      name: r.name,
      weight: r.weight,
      hash: r.hash?.toLowerCase(),
    })
  }
  for (const r of civitaiResources ?? []) {
    if (r === matchedByVersion) continue
    if ((r.type ?? '').toLowerCase() !== 'lora') continue
    if (r.modelVersionId === undefined) continue
    if (
      targetModelVersionId !== null &&
      r.modelVersionId === targetModelVersionId
    ) {
      continue
    }
    if (seenVersionIds.has(r.modelVersionId)) continue
    seenVersionIds.add(r.modelVersionId)
    extras.push({ weight: r.weight, modelVersionId: r.modelVersionId })
  }
  for (const tag of promptTags) {
    if (tag === targetTag) continue
    const key = tag.name.toLowerCase()
    if (seenNames.has(key) || knownTargetNames.has(key)) continue
    seenNames.add(key)
    extras.push({ name: tag.name, weight: tag.weight })
  }

  return {
    loraWeight,
    extraLoras: extras.length > 0 ? extras : undefined,
  }
}

async function fetchModelVersionSourceRecipes(
  modelId: number,
  modelVersionId: number,
  targetHashLower: string | null,
): Promise<CivitaiImageRecipe[]> {
  const url = new URL(`${CIVITAI_MODEL_VERSIONS_API}/${modelVersionId}`)

  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 2000,
      label: 'civitai.mineModelVersionPrompts',
    })
  } catch (error) {
    logger.warn('Civitai model version prompt fetch failed', {
      modelId,
      modelVersionId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return []
  }

  const parsed = CivitaiModelVersionSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn(
      'Civitai model version prompt response had an unexpected shape',
      {
        modelId,
        modelVersionId,
        issues: parsed.error.issues.map((issue) => issue.message).join('; '),
      },
    )
    return []
  }

  // In-prompt `<lora:NAME:..>` tags use the file name stem — collect every
  // file's stem as a name hint so multi-tag prompts can identify our tag.
  const targetNameHints = (parsed.data.files ?? [])
    .map((file) => (file.name ? fileNameStem(file.name) : null))
    .filter((stem): stem is string => Boolean(stem))

  const recipes: CivitaiImageRecipe[] = []
  for (const image of parsed.data.images ?? []) {
    if ((image.nsfwLevel ?? 1) > CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL) {
      continue
    }
    const rawPrompt = image.meta?.prompt ?? ''
    const prompt = cleanRecommendedPrompt(rawPrompt)
    if (!prompt) continue
    recipes.push({
      imageUrl: image.url,
      width: image.width,
      height: image.height,
      source: 'model_version_image',
      prompt,
      ...extractRecipeMetaParams(image.meta ?? {}),
      ...resolveRecipeLoraSignals({
        rawPrompt,
        resources: image.meta?.resources,
        civitaiResources: image.meta?.civitaiResources,
        targetHashLower,
        targetModelVersionId: modelVersionId,
        targetNameHints,
      }),
    })
    if (recipes.length >= CIVITAI_IMAGES_RECIPE_CAP) break
  }

  return recipes
}

/**
 * Derive the legacy prompt-deduped outfit view from per-image recipes so
 * existing consumers (chip selector, workbench inspector) keep working
 * unchanged while the grid consumes `recipes`.
 */
function deriveOutfitsFromRecipes(
  recipes: readonly CivitaiImageRecipe[],
): CivitaiMinedPromptsResult['outfits'] {
  const seen = new Set<string>()
  const outfits: CivitaiMinedPromptsResult['outfits'] = []
  for (const recipe of recipes) {
    const key = recipe.prompt.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    outfits.push({
      label: '',
      prompt: recipe.prompt,
      sampleCount: 1,
      source: recipe.source,
    })
    if (outfits.length >= CIVITAI_IMAGES_OUTFIT_CAP) break
  }
  return outfits
}

export interface MineCivitaiUserPromptsInput {
  modelId: number
  modelVersionId?: number
  /** Lower-case AutoV3 hash of the primary LoRA file. */
  fileHashAutoV3: string
}

export async function mineCivitaiUserPrompts({
  modelId,
  modelVersionId,
  fileHashAutoV3,
}: MineCivitaiUserPromptsInput): Promise<CivitaiMinedPromptsResult> {
  const targetHash = fileHashAutoV3.toLowerCase()

  if (modelVersionId !== undefined) {
    const sourceRecipes = await fetchModelVersionSourceRecipes(
      modelId,
      modelVersionId,
      targetHash,
    )
    if (sourceRecipes.length > 0) {
      return {
        outfits: deriveOutfitsFromRecipes(sourceRecipes),
        totalSampled: sourceRecipes.length,
        recipes: sourceRecipes,
      }
    }
  }

  const url = new URL(CIVITAI_IMAGES_API)
  // Query by modelVersionId alone when we have it — modelId-only queries on
  // popular models risk Cloudflare timeouts (official docs) and return a
  // different, often empty result set. modelId stays the fallback for
  // legacy favorites that never persisted a version id.
  if (modelVersionId !== undefined) {
    url.searchParams.set('modelVersionId', String(modelVersionId))
  } else {
    url.searchParams.set('modelId', String(modelId))
  }
  url.searchParams.set('limit', String(CIVITAI_IMAGES_SAMPLE_LIMIT))
  // withMeta defaults to false — without it the API strips `meta` entirely
  // and every image looks recipe-less (verified live 2026-06-11).
  url.searchParams.set('withMeta', 'true')
  // browsingLevel bitmask supersedes the legacy `nsfw` param, whose
  // combinations with sort/model filters return erratic/empty result sets.
  url.searchParams.set(
    'browsingLevel',
    String(CIVITAI_IMAGES_BROWSING_LEVEL_SFW),
  )
  // 'Most Reactions' biases toward generations the community judged good,
  // which tend to carry well-formed activation prompts. Civitai's default
  // sort is Newest, which surfaces lots of partial / broken prompts.
  url.searchParams.set('sort', 'Most Reactions')

  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 2000,
      label: 'civitai.mineUserPrompts',
    })
  } catch (error) {
    logger.warn('Civitai images fetch failed', {
      modelId,
      modelVersionId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    throw error
  }

  const parsed = CivitaiImagesResponseSchema.parse(payload)

  const segments: string[] = []
  const recipes: CivitaiImageRecipe[] = []
  let consideredCount = 0
  for (const item of parsed.items) {
    // Civitai serves both `meta.{prompt,resources}` (single layer) and
    // `meta.meta.{prompt,resources}` (double-nested) depending on query
    // params. Try inner first, then outer — whichever has a non-empty
    // prompt wins.
    const inner = item.meta?.meta
    const outer = item.meta
    const sdMeta =
      inner?.prompt && inner.prompt.trim().length > 0
        ? inner
        : outer?.prompt && outer.prompt.trim().length > 0
          ? outer
          : null
    if (!sdMeta) continue
    const prompt = sdMeta.prompt?.trim()
    if (!prompt) continue
    consideredCount += 1
    const matched = sdMeta.resources?.find(
      (r) => r.hash && r.hash.toLowerCase() === targetHash,
    )
    if (!matched) continue

    // Per-image recipe: the FULL prompt + params, paired to the image —
    // "一键同款" wants everything the uploader used, not just the
    // activation segment.
    const cleanedPrompt = cleanRecommendedPrompt(prompt)
    if (
      item.url &&
      cleanedPrompt &&
      recipes.length < CIVITAI_IMAGES_RECIPE_CAP
    ) {
      recipes.push({
        imageUrl: item.url,
        width: item.width,
        height: item.height,
        source: 'community_image',
        prompt: cleanedPrompt,
        ...extractRecipeMetaParams(sdMeta),
        ...resolveRecipeLoraSignals({
          rawPrompt: prompt,
          resources: sdMeta.resources,
          civitaiResources: sdMeta.civitaiResources,
          targetHashLower: targetHash,
          targetModelVersionId: modelVersionId ?? null,
          targetNameHints: [],
        }),
      })
    }

    // Outfit segment clustering needs the in-prompt LoRA tag name.
    if (!matched.name) continue
    const seg = extractActivationSegment(prompt, matched.name)
    if (seg) segments.push(seg)
  }

  const summarised = summariseActivationSegments(segments)
    .slice(0, CIVITAI_IMAGES_OUTFIT_CAP)
    .map((s) => ({
      label: '',
      prompt: s.prompt,
      sampleCount: s.sampleCount,
      source: 'community_image' as const,
    }))

  return {
    outfits: summarised,
    totalSampled: consideredCount,
    recipes,
  }
}
