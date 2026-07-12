import 'server-only'

import { Buffer } from 'node:buffer'

import { z } from 'zod'

import {
  CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  CIVITAI_LORA_BASE_MODEL_VALUES,
  CIVITAI_NAMED_BASE_MODEL_MEMBER_SET,
  CIVITAI_OTHER_BASE_MODEL_MEMBERS,
  CIVITAI_LORA_PAGE_SIZE,
  CIVITAI_LORA_SORT_VALUES,
  DEFAULT_LORA_NSFW_FILTER,
  isNsfwNamedModel,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
  type CivitaiSearchBackend,
  type LoraNsfwFilter,
} from '@/constants/lora'
import {
  extractActivationSegment,
  summariseActivationSegments,
} from '@/lib/civitai-image-prompt-mine'
import { toCivitaiModelSearchQuery } from '@/lib/civitai-lora-reference'
import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cleanRecommendedPrompt } from '@/lib/lora-trigger-clean'
import { civitaiDescriptionToText } from '@/lib/civitai-description-parse'
import { extractCivitaiTrigger } from '@/lib/lora-trigger-extract'
import { logger } from '@/lib/logger'
import { repairUtf8Mojibake } from '@/lib/text-encoding-repair'
import { withRetry } from '@/lib/with-retry'
import type {
  CivitaiImageRecipe,
  CivitaiLoraLibraryItem,
  CivitaiLoraLibraryResult,
  CivitaiMinedPromptsResult,
  CivitaiPreviewImage,
  CivitaiRecipeExtraLora,
  LoraAssetType,
} from '@/types'

const CIVITAI_MODELS_API = 'https://civitai.com/api/v1/models'
const CIVITAI_MODEL_VERSIONS_API = 'https://civitai.com/api/v1/model-versions'
const CIVITAI_MODEL_SEARCH_API = 'https://search-new.civitai.com/multi-search'
const CIVITAI_MODEL_SEARCH_INDEX = 'models_v9'
// Public browser key shipped by civitai.com for its own search UI. This is not
// a private secret; keep it scoped to the read-only model search fallback.
const CIVITAI_MODEL_SEARCH_PUBLIC_KEY =
  '8c46eb2508e21db1e9828a97968d91ab1ca1caa5f70a00e88a2ba1e286603b61'
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

const CivitaiImageDimensionSchema = z.preprocess(
  (value) => (value === 0 || value === null ? undefined : value),
  z.number().int().positive().optional(),
)

const CivitaiImageSchema = z
  .object({
    url: z.string().url(),
    // 'image' | 'video' — Civitai 允许视频当模型封面。<img> 渲染不了 video/mp4
    // （transform 段对视频不转码、连 anim=false 也照样回 video/mp4，实测），
    // 所以选封面时必须跳过 type=video 的条目。optional：老响应/fixture 不带
    // type 时视为 image，不误伤。
    type: z.string().optional(),
    width: CivitaiImageDimensionSchema,
    height: CivitaiImageDimensionSchema,
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
    // civitai 模型级 NSFW 标记（与图片级 nsfwLevel 分开）——P1-6 三态里
    // 「仅 NSFW」档用它做客户端二次过滤。
    nsfw: z.boolean().optional(),
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

const CivitaiSearchVersionFileSchema = z
  .object({
    name: z.string().optional(),
  })
  .passthrough()

const CivitaiSearchVersionSchema = z
  .object({
    id: z.number(),
    name: z.string().optional(),
    baseModel: z.string().nullable().optional(),
    files: z.array(CivitaiSearchVersionFileSchema).optional(),
    // B11：meilisearch 版本对象里有这两个，但从不带 files[].downloadUrl —
    // 触发词/下载量可以直接用，下载链接必须另外二段解析（见
    // fetchCivitaiSearchVersionDownloadUrl）。
    trainedWords: z.array(z.string()).optional(),
    metrics: CivitaiStatsSchema.optional(),
    createdAt: z.string().optional(),
  })
  .passthrough()

// B11：meilisearch 图片对象没有拼好的完整 URL，只有 CDN 路径的两段
// （id 对应文件名、url 对应 uuid 目录）——真实 URL 由
// buildCivitaiSearchImageOriginalUrl 用固定 bucket 拼出来，实测同一
// bucket 在不同模型/作者间一致（Cloudflare Images 账号级路径，非按图分配）。
const CivitaiSearchImageSchema = z
  .object({
    id: z.number(),
    url: z.string(),
    // meilisearch 索引同样带 'image' | 'video'（网页版靠它渲染视频角标）。
    type: z.string().optional(),
    nsfwLevel: z.number().optional(),
  })
  .passthrough()

const CivitaiSearchUserSchema = z
  .object({
    username: z.string().optional(),
    image: z.string().nullable().optional(),
  })
  .passthrough()

const CivitaiSearchPermissionsSchema = z
  .object({
    allowCommercialUse: z.array(z.string()).optional(),
    allowDerivatives: z.boolean().optional(),
  })
  .passthrough()

const CivitaiSearchTagSchema = z
  .object({
    name: z.string(),
  })
  .passthrough()

const CivitaiSearchHitSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    type: z.string().optional(),
    // hit.version = civitai 挑的"这次命中要展示的版本"（其余版本在
    // versions[] 里，B11 只用这一个，与 versions[0] 保持一致但不假设顺序）。
    version: CivitaiSearchVersionSchema.optional(),
    versions: z.array(CivitaiSearchVersionSchema).optional(),
    createdAt: z.string().optional(),
    nsfw: z.boolean().optional(),
    metrics: CivitaiStatsSchema.optional(),
    user: CivitaiSearchUserSchema.nullable().optional(),
    permissions: CivitaiSearchPermissionsSchema.optional(),
    tags: z.array(CivitaiSearchTagSchema).optional(),
    images: z.array(CivitaiSearchImageSchema).optional(),
  })
  .passthrough()

const CivitaiModelSearchResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          hits: z.array(CivitaiSearchHitSchema).optional(),
          estimatedTotalHits: z.number().optional(),
        })
        .passthrough(),
    ),
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
  /**
   * 主 LoRA 的底模 family。只用于搜索兜底的候选过滤，避免把 SDXL/Flux 等
   * 同名或近名 LoRA 自动挂到 Illustrious 配方里。
   */
  baseModelFamily?: string | null
}

const CIVITAI_RESOLVE_SEARCH_LIMIT = 10
const CIVITAI_WEB_RESOLVE_SEARCH_LIMIT = 50
const CIVITAI_WEB_RESOLVE_VERSION_FETCH_LIMIT = 48
const CIVITAI_WEB_RESOLVE_VERSION_FETCH_BATCH_SIZE = 6

interface ResolveCivitaiLoraLocatorOptions {
  exactNameKey?: string
  baseModelFamily?: string | null
}

interface CivitaiSearchVersionCandidate {
  versionId: number
}

async function resolveCivitaiLoraByLocator(
  hash: string | null | undefined,
  modelVersionId: number | null | undefined,
  options: ResolveCivitaiLoraLocatorOptions = {},
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
  if (
    options.baseModelFamily &&
    !baseModelMatchesCandidate(version.baseModel, options.baseModelFamily)
  ) {
    return null
  }
  if (
    options.exactNameKey &&
    !searchVersionHasExactFileStem(version, options.exactNameKey)
  ) {
    return null
  }

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
/**
 * 词干比对键：小写 + 去空格/横线/下划线/点。仍是全长严格相等 — 只是
 * 容忍 meta 名与文件名之间的分隔符差异，不做前缀/包含式模糊匹配。
 * （导出给本地库匹配复用 — 同一把尺子量本地行和 Civitai 文件名。）
 */
export function normalizeLoraNameKey(value: string): string {
  return repairUtf8Mojibake(value)
    .toLowerCase()
    .replace(/[\s\-_.]+/g, '')
}

type CivitaiKnownBaseModelFamily =
  keyof typeof CIVITAI_BASE_MODEL_FAMILY_MEMBERS

const CIVITAI_BASE_MODEL_FAMILY_ALIASES: Record<
  string,
  CivitaiKnownBaseModelFamily
> = {
  flux: 'Flux.1 D',
  flux1: 'Flux.1 D',
  sdxl: 'SDXL 1.0',
  sd15: 'SD 1.5',
  sd1: 'SD 1.5',
  illustriousxl: 'Illustrious',
}

function toBaseModelKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? normalizeLoraNameKey(trimmed) : null
}

function acceptedBaseModelKeys(
  baseModelFamily: string | null | undefined,
): Set<string> | null {
  const requestedKey = toBaseModelKey(baseModelFamily)
  if (!requestedKey) return null

  const aliasFamily = CIVITAI_BASE_MODEL_FAMILY_ALIASES[requestedKey]
  if (aliasFamily) {
    return new Set(
      [aliasFamily, ...CIVITAI_BASE_MODEL_FAMILY_MEMBERS[aliasFamily]].map(
        normalizeLoraNameKey,
      ),
    )
  }

  for (const [family, members] of Object.entries(
    CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  )) {
    const keys = [family, ...members].map(normalizeLoraNameKey)
    if (keys.includes(requestedKey)) return new Set(keys)
  }

  return new Set([requestedKey])
}

function acceptedBaseModelNames(
  baseModelFamily: string | null | undefined,
): string[] | null {
  const requestedKey = toBaseModelKey(baseModelFamily)
  if (!requestedKey) return null

  const aliasFamily = CIVITAI_BASE_MODEL_FAMILY_ALIASES[requestedKey]
  if (aliasFamily) {
    return Array.from(
      new Set([aliasFamily, ...CIVITAI_BASE_MODEL_FAMILY_MEMBERS[aliasFamily]]),
    )
  }

  for (const [family, members] of Object.entries(
    CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  )) {
    const keys = [family, ...members].map(normalizeLoraNameKey)
    if (keys.includes(requestedKey)) {
      return Array.from(new Set([family, ...members]))
    }
  }

  return [baseModelFamily?.trim() ?? requestedKey].filter(Boolean)
}

function buildCivitaiSearchFilters(
  baseModelFamily: string | null | undefined,
): string[] {
  const filters = ['type = LoRA']
  // 'other' 兜底桶：meilisearch 支持 NOT IN，直接把所有 named family 成员
  // 取补集（REST 路径做不到这点，见 appendBaseModelFamilyParams）。
  if (baseModelFamily === 'other') {
    const quoted = [...CIVITAI_NAMED_BASE_MODEL_MEMBER_SET]
      .map((name) => JSON.stringify(name))
      .join(', ')
    filters.push(`versions.baseModel NOT IN [${quoted}]`)
    return filters
  }
  const baseModelNames = acceptedBaseModelNames(baseModelFamily)
  if (baseModelNames && baseModelNames.length > 0) {
    const quoted = baseModelNames.map((name) => JSON.stringify(name)).join(', ')
    filters.push(`versions.baseModel IN [${quoted}]`)
  }
  return filters
}

// Issue B（docs/plans/lora-search-image-audit-2026-07.md）：push the P1-6
// tri-state down into the meilisearch source filter instead of post-
// filtering a fetched page (which used to shrink `nsfwOnly` pages to ~half
// and let NSFW LoRAs leak into `safe`). `nsfwLevel` is a per-model ARRAY
// (every image's level, e.g. `[1,4]`) and meilisearch's array filter
// semantics are existential — `nsfwLevel > N` matches if ANY element is >N.
// `NOT nsfwLevel > N` is therefore the true logical negation: ALL elements
// are <=N. Live-verified 2026-07-11 against search-new.civitai.com: for one
// sample query, `nsfwLevel > 2` returned 22265 hits and `NOT nsfwLevel > 2`
// returned 7165 — they sum to exactly the unfiltered total (29430), i.e. a
// clean, non-overlapping bipartition (not an approximation).
//
// Threshold 2 (not the plan's initial suggestion of 1) is chosen to match
// the file's existing `CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL` = 2
// ("safe" cover ceiling already treats None(1)+Soft(2) as safe elsewhere in
// this file). Using a different threshold for nsfwOnly vs. safe would leave
// a gap where a level-2-only model matches both `nsfwLevel > 1` (nsfwOnly)
// and `NOT nsfwLevel > 2` (safe) — same threshold keeps the two tri-state
// filters an exact partition of each other.
//
// Also live-verified: Civitai's own `nsfw` boolean is unreliable in BOTH
// directions (e.g. a "girl handjob POV" hit with nsfwLevel:[16] — XXX-only —
// was flagged `nsfw:false`; several models with only None/Soft images were
// flagged `nsfw:true`). That's why this pushes the *level* array down
// instead of trying to filter on `nsfw` (which meilisearch also rejects —
// "Attribute `nsfw` is not filterable", confirmed via a live 400).
function appendNsfwSearchFilter(
  filters: string[],
  nsfwFilter: LoraNsfwFilter,
): void {
  if (nsfwFilter === 'safe') {
    filters.push(
      `NOT nsfwLevel > ${CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL}`,
    )
  } else if (nsfwFilter === 'nsfwOnly') {
    filters.push(`nsfwLevel > ${CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL}`)
  }
  // 'unrestricted' adds no clause — matches existing behavior.
}

function baseModelMatchesCandidate(
  candidateBaseModel: string | null | undefined,
  requestedBaseModelFamily: string | null | undefined,
): boolean {
  const acceptedKeys = acceptedBaseModelKeys(requestedBaseModelFamily)
  if (!acceptedKeys) return true
  const candidateKey = toBaseModelKey(candidateBaseModel)
  return candidateKey !== null && acceptedKeys.has(candidateKey)
}

// 只按文件名比对，跟调用方是 REST 版本对象还是 meilisearch 版本对象无关——
// 参数类型故意收窄到实际用到的形状，别绑死某一份 schema（两处调用方各用
// 各的 schema，字段集合并不完全相同）。
function searchVersionHasExactFileStem(
  version: { files?: { name?: string }[] },
  targetNameKey: string,
): boolean {
  return (
    version.files?.some(
      (file) =>
        file.name &&
        normalizeLoraNameKey(fileNameStem(file.name)) === targetNameKey,
    ) ?? false
  )
}

async function resolveFirstExactCivitaiVersionCandidate(
  candidates: readonly CivitaiSearchVersionCandidate[],
  targetNameKey: string,
  baseModelFamily: string | null | undefined,
): Promise<CivitaiLoraLibraryItem | null> {
  const capped = candidates.slice(0, CIVITAI_WEB_RESOLVE_VERSION_FETCH_LIMIT)
  for (
    let start = 0;
    start < capped.length;
    start += CIVITAI_WEB_RESOLVE_VERSION_FETCH_BATCH_SIZE
  ) {
    const batch = capped.slice(
      start,
      start + CIVITAI_WEB_RESOLVE_VERSION_FETCH_BATCH_SIZE,
    )
    const resolved = await Promise.all(
      batch.map((candidate) =>
        resolveCivitaiLoraByLocator(undefined, candidate.versionId, {
          exactNameKey: targetNameKey,
          baseModelFamily,
        }),
      ),
    )
    const match = resolved.find(
      (item): item is CivitaiLoraLibraryItem => item !== null,
    )
    if (match) return match
  }
  return null
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
  url.searchParams.set('query', toCivitaiModelSearchQuery(trimmed))

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

  const target = normalizeLoraNameKey(trimmed)
  for (const model of parsed.data.items) {
    for (const version of model.modelVersions ?? []) {
      const matched = version.files?.some(
        (file) =>
          file.name && normalizeLoraNameKey(fileNameStem(file.name)) === target,
      )
      if (matched) {
        return toLibraryItem({ ...model, modelVersions: [version] })
      }
    }
  }
  return null
}

async function resolveCivitaiLoraByWebSearchNameStem(
  name: string,
  baseModelFamily: string | null | undefined,
): Promise<CivitaiLoraLibraryItem | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const url = new URL(CIVITAI_MODEL_SEARCH_API)
  const body = {
    queries: [
      {
        indexUid: CIVITAI_MODEL_SEARCH_INDEX,
        q: toCivitaiModelSearchQuery(trimmed),
        limit: CIVITAI_WEB_RESOLVE_SEARCH_LIMIT,
        offset: 0,
        filter: buildCivitaiSearchFilters(baseModelFamily),
      },
    ],
  }

  let payload: unknown
  try {
    payload = await withRetry(
      () =>
        fetchCivitaiPayload(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CIVITAI_MODEL_SEARCH_PUBLIC_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
      {
        maxAttempts: 2,
        baseDelayMs: 400,
        maxDelayMs: 1500,
        label: 'civitai.resolveLoraByWebSearchName',
      },
    )
  } catch (error) {
    logger.warn('Civitai LoRA web search fallback failed', {
      name: trimmed,
      baseModelFamily: baseModelFamily ?? null,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return null
  }

  const parsed = CivitaiModelSearchResponseSchema.safeParse(payload)
  if (!parsed.success) return null

  const target = normalizeLoraNameKey(trimmed)
  const candidates: CivitaiSearchVersionCandidate[] = []
  const seenVersionIds = new Set<number>()
  for (const result of parsed.data.results) {
    for (const hit of result.hits ?? []) {
      if (hit.type && hit.type.toUpperCase() !== 'LORA') continue
      for (const version of hit.versions ?? []) {
        if (!baseModelMatchesCandidate(version.baseModel, baseModelFamily)) {
          continue
        }
        const hasSearchFileNames = (version.files?.length ?? 0) > 0
        if (
          hasSearchFileNames &&
          !searchVersionHasExactFileStem(version, target)
        ) {
          continue
        }
        if (seenVersionIds.has(version.id)) continue
        seenVersionIds.add(version.id)
        candidates.push({ versionId: version.id })
      }
    }
  }

  return resolveFirstExactCivitaiVersionCandidate(
    candidates,
    target,
    baseModelFamily,
  )
}

export async function resolveCivitaiLoraByReference({
  hash,
  modelVersionId,
  name,
  baseModelFamily,
}: ResolveCivitaiLoraReference): Promise<CivitaiLoraLibraryItem | null> {
  if (hash || modelVersionId) {
    const direct = await resolveCivitaiLoraByLocator(hash, modelVersionId)
    if (direct) return direct
  }
  if (name) {
    const official = await resolveCivitaiLoraByNameStem(name)
    if (official) return official
    return resolveCivitaiLoraByWebSearchNameStem(name, baseModelFamily)
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

  // 回填的是用户已收藏的这把 LoRA 的封面（无三态语境）——放到 XXX 与
  // toLibraryItem 的默认一致，否则 NSFW 收藏行永远补不回封面。视频封面
  // 跳过（isStaticCivitaiImage 定义处有实测说明）。
  const coverOriginal =
    parsed.data.images?.find(
      (image) =>
        isStaticCivitaiImage(image) &&
        (image.nsfwLevel ?? 1) <=
          CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL_PERMISSIVE,
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
  /** P1-6：三态分级，默认 'safe'。search 路径下推到 meilisearch 的
   *  `nsfwLevel` source filter（'safe' 用 `NOT nsfwLevel > N`，'nsfwOnly'
   *  用 `nsfwLevel > N`，'unrestricted' 不加）；REST 浏览路径用同一天花板
   *  客户端扫描 images[]（见 appendNsfwSearchFilter / fetchCivitaiLoraPage
   *  的注释，Issue B，docs/plans/lora-search-image-audit-2026-07.md）。 */
  nsfwFilter?: LoraNsfwFilter
  /**
   * Issue C（docs/plans/lora-search-image-audit-2026-07.md）：调用方（搜索
   * 分页 hook）在同一次搜索会话内锁定的后端选择——首页决定 meilisearch 还
   * 是 REST 后，后续页把这里传回来，让服务端跳过另一条路径，不再中途切
   * 换分页范式（meilisearch=offset，REST 回落=cursor scan，混用会导致翻
   * 页重复/错位）。仅在 `search` 非空时生效；不传 = 自由选择（当前会话
   * 首页的行为）。
   */
  source?: CivitaiSearchBackend
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
const CIVITAI_SEARCH_BASE_MODEL_MAX_SCAN_PAGES = 10
const CIVITAI_SEARCH_SCAN_CURSOR_PREFIX = 'search-scan:v1:'
const CIVITAI_LEGACY_SEARCH_SCAN_CURSOR_PREFIX = 'search-scan:'

const CivitaiSearchScanCursorSchema = z.object({
  upstreamCursor: z.string().nullable(),
  skippedItemIds: z.array(z.string()).max(CIVITAI_SEARCH_BASE_MODEL_SCAN_LIMIT),
})

type CivitaiSearchScanCursor = z.infer<typeof CivitaiSearchScanCursorSchema>

function parseCivitaiSearchScanCursor(
  cursor: string | null | undefined,
): CivitaiSearchScanCursor {
  const normalizedCursor = cursor?.trim()
  if (!normalizedCursor) {
    return { upstreamCursor: null, skippedItemIds: [] }
  }
  if (!normalizedCursor.startsWith(CIVITAI_SEARCH_SCAN_CURSOR_PREFIX)) {
    if (normalizedCursor.startsWith(CIVITAI_LEGACY_SEARCH_SCAN_CURSOR_PREFIX)) {
      return { upstreamCursor: null, skippedItemIds: [] }
    }
    return { upstreamCursor: normalizedCursor, skippedItemIds: [] }
  }

  try {
    const encoded = normalizedCursor.slice(
      CIVITAI_SEARCH_SCAN_CURSOR_PREFIX.length,
    )
    const payload: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    )
    const parsed = CivitaiSearchScanCursorSchema.safeParse(payload)
    if (parsed.success) return parsed.data
  } catch {
    // Invalid or stale cursors restart the bounded search scan safely.
  }

  return { upstreamCursor: null, skippedItemIds: [] }
}

function createCivitaiSearchScanCursor(state: CivitaiSearchScanCursor): string {
  const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString(
    'base64url',
  )
  return `${CIVITAI_SEARCH_SCAN_CURSOR_PREFIX}${encoded}`
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

// Shared by toLibraryItem (which version becomes the library item) and the
// REST-path nsfw-level check (fetchCivitaiLoraPage) — both need "the same
// version the card actually shows", so this selection lives in one place.
function pickUsableModelVersion(
  model: z.infer<typeof CivitaiModelSchema>,
): z.infer<typeof CivitaiModelVersionSchema> | null {
  return (
    model.modelVersions?.find((candidate) =>
      Boolean(pickDownloadUrl(candidate)),
    ) ?? null
  )
}

// 各场景下的目标渲染宽度（CSS px），用于把 Civitai 默认 `original=true` 的
// 大图（1–5 MB）改写成对应尺寸的 transform。Retina 屏 ×2 在大多数列表场景
// 已经够清；超出的 LCP/带宽成本远大于细节收益。
const CIVITAI_THUMB_WIDTH = 96 // 列表 row 40×40 缩略；挂载栈 chip / facepile 用
// 公开库封面网格卡（~166–221px CSS，retina 需 ~400 物理 px）。此前网格误用了
// 96 档缩略图（P0-3：96px 拉伸到 ~200px 卡上系统性发糊），640 档又是给抽屉
// 大图用的、网格 30 张同屏时流量翻倍——450 是网格卡专用的中间档。
const CIVITAI_CARD_WIDTH = 450
const CIVITAI_COVER_WIDTH = 640 // Inspector aspect-video / AssetCard square
const CIVITAI_PREVIEW_WIDTH = 768 // 预留：未来的预览画廊 / 大图轮播

/**
 * 封面/来源图只能是静态图：Civitai 允许视频当封面，但 `<img>` 渲染不了
 * video/mp4（transform 段对视频不转码、`anim=false` 也照样回 video/mp4，
 * 2026-07-11 实测）。只有明确标 `type: 'video'` 才跳过——缺省视为 image，
 * 老响应/测试 fixture 不受影响。
 */
function isStaticCivitaiImage(image: { type?: string }): boolean {
  return (image.type ?? 'image').toLowerCase() !== 'video'
}

function pickImages(
  version: z.infer<typeof CivitaiModelVersionSchema>,
  maxNsfwLevel: number,
): string[] {
  return (
    version.images
      ?.filter(
        (image) =>
          isStaticCivitaiImage(image) && (image.nsfwLevel ?? 1) <= maxNsfwLevel,
      )
      .map((image) => image.url)
      .slice(0, 6) ?? []
  )
}

// Issue B REST-path counterpart to appendNsfwSearchFilter's meilisearch
// `nsfwLevel > N` clause: REST has no pushable per-image-level filter, so
// this scans the version's own (unceiled) images array client-side. Mirrors
// the same existential semantics ("ANY image exceeds the ceiling") used by
// the meilisearch array filter, so REST and search behave the same way for
// the same data. Deliberately NOT reused from pickImages's output — that's
// already ceiling-filtered (would make this always false for 'safe', where
// the ceiling equals the very threshold we're checking against).
function versionHasNsfwLevelAbove(
  version: { images?: { nsfwLevel?: number }[] },
  ceiling: number,
): boolean {
  return (
    version.images?.some((image) => (image.nsfwLevel ?? 1) > ceiling) ?? false
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
  // 默认放到 XXX：resolve-by-hash / by-name 是"挂载用户指定的这把 LoRA"，
  // 无三态语境，应无条件出封面。list 路径显式传按 nsfwFilter 算好的天花板。
  maxImageNsfwLevel: number = CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL_PERMISSIVE,
): CivitaiLoraLibraryItem | null {
  if (model.type.toUpperCase() !== 'LORA') return null

  const version = pickUsableModelVersion(model)
  if (!version) return null

  const loraUrl = pickDownloadUrl(version)
  if (!loraUrl) return null

  const tags = model.tags ?? []
  const originalImageUrls = pickImages(version, maxImageNsfwLevel)
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
  const cardImageUrl = coverOriginal
    ? rewriteCivitaiImageUrl(coverOriginal, { width: CIVITAI_CARD_WIDTH })
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
    cardImageUrl,
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
    isNsfw: model.nsfw ?? false,
  }
}

// ── B11：搜索路径切 civitai 自家 meilisearch（真排序）────────────────────
//
// REST `/api/v1/models` 带 `query` 时忽略 `sort`（官方 issue civitai/civitai
// #1848，我们自己 curl 对照实验也证实）。civitai 网页版自己的搜索走这个
// meilisearch 端点，排序字段实测（2026-07-04）全部生效。

// Cloudflare Images 账号级 bucket——同一 bucket 在两个完全无关模型/作者的
// 封面图之间保持一致（不是按图分配），实测对照 REST 响应确认。
const CIVITAI_SEARCH_IMAGE_BUCKET = 'xG1nkqKTMzGDvpLrqFT7WA'

function buildCivitaiSearchImageOriginalUrl(image: {
  id: number
  url: string
}): string {
  return `https://image.civitai.com/${CIVITAI_SEARCH_IMAGE_BUCKET}/${image.url}/original=true/${image.id}.jpeg`
}

// 排序映射——三档实测（curl 对照，2026-07-04）：不传 sort 就是 meilisearch
// 相关性序（与 REST 搜索结果逐条一致，说明 REST 内部就是这条相关性序）；
// 其余两档严格降序。
const CIVITAI_SEARCH_SORT_MAP: Record<CivitaiLoraSort, string[] | undefined> = {
  'Highest Rated': undefined,
  'Most Downloaded': ['metrics.downloadCount:desc'],
  Newest: ['createdAt:desc'],
}

// meilisearch hit 里没有 files[]/downloadUrl（实测确认，与 REST 的
// modelVersions[].files 不同）——每个 hit 都要单独二段解析。批量大小跟
// resolveFirstExactCivitaiVersionCandidate 的批量常量保持一致的节流力度。
const CIVITAI_SEARCH_HIT_RESOLVE_BATCH_SIZE = 6

async function fetchCivitaiSearchVersionDownloadUrl(
  versionId: number,
): Promise<string | null> {
  const url = new URL(`${CIVITAI_MODEL_VERSIONS_API}/${versionId}`)
  try {
    const payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.searchVersionDownloadUrl',
    })
    const parsed = CivitaiVersionResolveSchema.safeParse(payload)
    if (!parsed.success) return null
    return pickDownloadUrl(parsed.data)
  } catch (error) {
    logger.warn('Civitai search hit version download-url resolve failed', {
      versionId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return null
  }
}

async function hitToLibraryItem(
  hit: z.infer<typeof CivitaiSearchHitSchema>,
  maxImageNsfwLevel: number,
): Promise<CivitaiLoraLibraryItem | null> {
  if (hit.type && hit.type.toUpperCase() !== 'LORA') return null
  // hit.version = civitai 挑的"这次命中要展示的版本"；versions[0] 兜底
  // 未必所有 hit 都带 version 字段。
  const version = hit.version ?? hit.versions?.[0]
  if (!version) return null

  const loraUrl = await fetchCivitaiSearchVersionDownloadUrl(version.id)
  if (!loraUrl) return null

  const tags = (hit.tags ?? []).map((tag) => tag.name)
  const originalImageUrls = (hit.images ?? [])
    .filter(
      (image) =>
        isStaticCivitaiImage(image) &&
        (image.nsfwLevel ?? 1) <= maxImageNsfwLevel,
    )
    .slice(0, 6)
    .map((image) => buildCivitaiSearchImageOriginalUrl(image))
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
  const cardImageUrl = coverOriginal
    ? rewriteCivitaiImageUrl(coverOriginal, { width: CIVITAI_CARD_WIDTH })
    : null
  const baseModelFamily = version.baseModel?.trim() || 'unknown'

  const triggerInfo = extractCivitaiTrigger({
    trainedWords: version.trainedWords,
    modelName: hit.name,
    // meilisearch hit 没有 description 字段（实测确认）——outfit 多段
    // prompt 抽取在搜索结果里天然缺失，mined-prompts phase-2 enrichment
    // 之后按需补，不在本批范围内。
    descriptionHtml: null,
  })

  return {
    id: `civitai:${hit.id}:${version.id}`,
    styleCode: `civitai-${version.id}`,
    name: hit.name,
    source: 'imported',
    type: inferLoraType(tags, hit.name),
    baseModelFamily,
    provider: 'civitai',
    triggerWord: triggerInfo.trigger,
    // meilisearch 版本对象没有 files[].hashes，AutoV3 拿不到——挂载栈的
    // hash 匹配对搜索结果里的条目退化为 no-op，不影响下载/挂载本身。
    fileHashAutoV3: null,
    triggerAlternates: triggerInfo.alternates,
    recommendedPrompt: triggerInfo.recommendedPrompt,
    recommendedPromptAlternates: triggerInfo.recommendedPromptAlternates,
    triggerSource: triggerInfo.source,
    loraUrl,
    coverImageUrl,
    coverImageUrlOriginal: coverOriginal,
    thumbImageUrl,
    cardImageUrl,
    previewImageUrls,
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: version.createdAt ?? hit.createdAt ?? new Date(0).toISOString(),
    modelId: hit.id,
    modelVersionId: version.id,
    versionName: version.name ?? '',
    creatorName: hit.user?.username ?? null,
    creatorAvatarUrl: hit.user?.image ?? null,
    modelPageUrl: `https://civitai.com/models/${hit.id}?modelVersionId=${version.id}`,
    tags: tags.slice(0, 8),
    downloadCount:
      version.metrics?.downloadCount ?? hit.metrics?.downloadCount ?? 0,
    thumbsUpCount:
      version.metrics?.thumbsUpCount ?? hit.metrics?.thumbsUpCount ?? 0,
    allowCommercialUse: hit.permissions?.allowCommercialUse ?? [],
    allowDerivatives: hit.permissions?.allowDerivatives ?? false,
    isNsfw: hit.nsfw ?? false,
  }
}

async function hitsToLibraryItems(
  hits: readonly z.infer<typeof CivitaiSearchHitSchema>[],
  maxImageNsfwLevel: number,
): Promise<CivitaiLoraLibraryItem[]> {
  const resolved: CivitaiLoraLibraryItem[] = []
  for (
    let start = 0;
    start < hits.length;
    start += CIVITAI_SEARCH_HIT_RESOLVE_BATCH_SIZE
  ) {
    const batch = hits.slice(
      start,
      start + CIVITAI_SEARCH_HIT_RESOLVE_BATCH_SIZE,
    )
    const items = await Promise.all(
      batch.map((hit) => hitToLibraryItem(hit, maxImageNsfwLevel)),
    )
    for (const item of items) {
      if (item) resolved.push(item)
    }
  }
  return dedupeLibraryItems(resolved)
}

// Issue B: nsfwOnly no longer post-filters by `hit.nsfw` — that boolean is
// unreliable (live-verified false negatives: e.g. a hit with nsfwLevel
// [16] — XXX-only — flagged `nsfw:false`) and, more importantly, the source
// query (appendNsfwSearchFilter) already restricts the page to
// `nsfwLevel > CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL`; post-filtering
// again on top of that is what caused a fetched page of 12 to shrink to ~6
// (Issue B's core symptom). `safe` keeps the name-keyword pass as a cheap
// defense-in-depth layer alongside the source-level `NOT nsfwLevel > N`
// filter (catches the rare case where a name itself signals NSFW despite
// clean image levels — this never shrinks a page meaningfully since only a
// handful of keywords are checked).
function filterSearchHitsByNsfw(
  hits: readonly z.infer<typeof CivitaiSearchHitSchema>[],
  nsfwFilter: LoraNsfwFilter,
): readonly z.infer<typeof CivitaiSearchHitSchema>[] {
  if (nsfwFilter === 'safe') {
    return hits.filter((hit) => !isNsfwNamedModel(hit.name))
  }
  return hits
}

async function listCivitaiLorasBySearch({
  page,
  pageSize,
  search,
  baseModel,
  sort,
  nsfwFilter,
}: {
  page: number
  pageSize: number
  search: string
  baseModel: CivitaiLoraBaseModel
  sort: CivitaiLoraSort
  nsfwFilter: LoraNsfwFilter
}): Promise<CivitaiLoraLibraryResult> {
  const offset = (page - 1) * pageSize
  const url = new URL(CIVITAI_MODEL_SEARCH_API)
  const filters = buildCivitaiSearchFilters(
    baseModel === 'all' ? null : baseModel,
  )
  // Issue B: nsfw tri-state pushed down to the source filter so a fetched
  // page is already the right shape — no more post-filter shrinkage.
  appendNsfwSearchFilter(filters, nsfwFilter)
  const body = {
    queries: [
      {
        indexUid: CIVITAI_MODEL_SEARCH_INDEX,
        q: search,
        limit: pageSize,
        offset,
        filter: filters,
        sort: CIVITAI_SEARCH_SORT_MAP[sort],
      },
    ],
  }

  const payload = await withRetry(
    () =>
      fetchCivitaiPayload(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CIVITAI_MODEL_SEARCH_PUBLIC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.searchLoras',
    },
  )

  // 解析失败/形状异常直接抛出——调用方 listCivitaiLoras 捕获后回落 REST，
  // 不在这里吞掉错误（吞了调用方就没法区分"真的没结果"和"端点坏了"）。
  const parsed = CivitaiModelSearchResponseSchema.parse(payload)
  const result = parsed.results[0]
  const hits = result?.hits ?? []
  const filteredHits = filterSearchHitsByNsfw(hits, nsfwFilter)
  const items = await hitsToLibraryItems(
    filteredHits,
    maxImageNsfwLevelFor(nsfwFilter),
  )

  const estimatedTotal = result?.estimatedTotalHits ?? null

  return {
    items,
    page,
    pageSize,
    total: estimatedTotal,
    hasNextPage:
      estimatedTotal !== null
        ? offset + hits.length < estimatedTotal
        : hits.length >= pageSize,
    nextCursor: null,
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

interface CivitaiFetchOptions {
  method?: 'GET' | 'POST'
  headers?: HeadersInit
  body?: BodyInit | null
}

async function fetchCivitaiPayload(
  url: URL,
  options: CivitaiFetchOptions = {},
): Promise<unknown> {
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

  const headers = new Headers(options.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  const requestPromise = fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body,
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

// 2026-07-02 定位到真正的分页 bug：schema 里 metadata.nextPage（下一页完整
// URL）一直存在，但这里只读 metadata.nextCursor——如果 Civitai 对纯浏览
// （无 query）请求只在 nextPage 里带 cursor、不单独给 nextCursor 字段（这类
// API 很常见），我们就永远拿不到真 cursor，之前几轮"page/cursor 参数怎么
// 组合"全都无效，因为 cursorByPageRef 里存的其实一直是 null——不管发不发
// page，实际发出去的都是同一个"没有 cursor"的请求，Civitai 自然一直吐同一
// 页。这里补上从 nextPage URL 里回抠 cursor 参数的兜底。
function parseNextCursor(
  metadata: z.infer<typeof CivitaiModelsResponseSchema>['metadata'],
): string | null {
  if (metadata?.nextCursor !== undefined && metadata.nextCursor !== null) {
    return String(metadata.nextCursor)
  }
  if (metadata?.nextPage) {
    try {
      const cursorFromNextPage = new URL(metadata.nextPage).searchParams.get(
        'cursor',
      )
      if (cursorFromNextPage) return cursorFromNextPage
    } catch {
      // metadata.nextPage 不是合法 URL——极少见，忽略走 null。
    }
  }
  return null
}

function filterByBaseModelFamily(
  items: CivitaiLoraLibraryItem[],
  baseModel: CivitaiLoraBaseModel,
): CivitaiLoraLibraryItem[] {
  if (baseModel === 'all') return items
  // 'other' = 兜底桶：不属于任何 named family 的 baseModel（Wan/Hunyuan
  // Video、Flux.2、Pony V7、SD 3.5 等长尾）全部归这里，保证 Civitai 任何
  // baseModel 值都能被过滤到。
  if (baseModel === 'other') {
    return items.filter(
      (item) => !CIVITAI_NAMED_BASE_MODEL_MEMBER_SET.has(item.baseModelFamily),
    )
  }
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
  if (baseModel === 'other') {
    CIVITAI_OTHER_BASE_MODEL_MEMBERS.forEach((familyMember) => {
      url.searchParams.append('baseModels', familyMember)
    })
    return
  }
  CIVITAI_BASE_MODEL_FAMILY_MEMBERS[baseModel].forEach((familyMember) => {
    url.searchParams.append('baseModels', familyMember)
  })
}

async function resolveCivitaiRestCursorForPage({
  page,
  pageSize,
  baseModel,
  sort,
  nsfwFilter,
}: {
  page: number
  pageSize: number
  baseModel: CivitaiLoraBaseModel
  sort: CivitaiLoraSort
  nsfwFilter: LoraNsfwFilter
}): Promise<string | null> {
  let cursor: string | null = null

  for (let currentPage = 1; currentPage < page; currentPage += 1) {
    const url = new URL(CIVITAI_MODELS_API)
    url.searchParams.set('types', 'LORA')
    url.searchParams.set('limit', String(pageSize))
    url.searchParams.set('sort', sort)
    url.searchParams.set('nsfw', String(nsfwFilter !== 'safe'))
    if (cursor) {
      url.searchParams.set('cursor', cursor)
    } else {
      url.searchParams.set('page', '1')
    }
    if (baseModel !== 'all') {
      appendBaseModelFamilyParams(url, baseModel)
    }

    const result = await fetchCivitaiLoraPage(url, nsfwFilter)
    cursor = result.nextCursor
    if (!cursor) return null
  }

  return cursor
}

async function fetchCivitaiLoraPage(
  url: URL,
  // P1-6 三态，REST 浏览路径与 appendNsfwSearchFilter（meilisearch 搜索路
  // 径）对齐语义（Issue B）：
  //   'safe'     排除「名字带 NSFW 关键词」*或*「任意图片超出安全天花板
  //              CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL」的条目。
  //   'nsfwOnly' 反过来只留「civitai 的 model.nsfw 标记为真」*或*「任意
  //              图片超出安全天花板」的条目。
  //   'unrestricted' 不做客户端过滤。
  // 两个信号（名字关键词/model.nsfw 布尔）都单独不可靠（实测过双向误判，
  // 见 appendNsfwSearchFilter 注释），REST 又没有可下推的按图 nsfwLevel
  // 过滤——OR 组合两个信号缩小漏判面，同时保留旧信号让已有测试期望的
  // fixture（无 images 数组时）继续按原有的关键词/布尔判据工作。
  nsfwFilter: LoraNsfwFilter = DEFAULT_LORA_NSFW_FILTER,
): Promise<{
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
  const imageNsfwCeiling = maxImageNsfwLevelFor(nsfwFilter)
  const mappedItems = parsed.items
    .map((model) => {
      const item = toLibraryItem(model, imageNsfwCeiling)
      if (!item) return null
      // Scan the raw (unceiled) version images — pickImages() inside
      // toLibraryItem already dropped anything above imageNsfwCeiling from
      // previewImageUrls/coverImageUrl, so re-deriving this signal from the
      // mapped item would always read "safe" under 'safe' mode (its ceiling
      // IS the threshold being checked here).
      const version = pickUsableModelVersion(model)
      const hasNsfwLevelAboveSafeCeiling = version
        ? versionHasNsfwLevelAbove(
            version,
            CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
          )
        : false
      return { item, hasNsfwLevelAboveSafeCeiling }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  const filteredItems =
    nsfwFilter === 'safe'
      ? mappedItems
          .filter(
            (entry) =>
              !isNsfwNamedModel(entry.item.name) &&
              !entry.hasNsfwLevelAboveSafeCeiling,
          )
          .map((entry) => entry.item)
      : nsfwFilter === 'nsfwOnly'
        ? mappedItems
            .filter(
              (entry) =>
                entry.item.isNsfw || entry.hasNsfwLevelAboveSafeCeiling,
            )
            .map((entry) => entry.item)
        : mappedItems.map((entry) => entry.item)
  const items = dedupeLibraryItems(filteredItems)

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
  cursor,
  search,
  baseModel,
  sort,
  nsfwFilter,
}: {
  page: number
  pageSize: number
  cursor?: string | null
  search: string
  baseModel: Exclude<CivitaiLoraBaseModel, 'all'>
  sort: CivitaiLoraSort
  nsfwFilter: LoraNsfwFilter
}): Promise<CivitaiLoraLibraryResult> {
  const collected: CivitaiLoraLibraryItem[] = []
  const initialCursor = parseCivitaiSearchScanCursor(cursor)
  let upstreamCursor = initialCursor.upstreamCursor
  let skippedItemIds = new Set(initialCursor.skippedItemIds)
  const seenItemIds = new Set<string>()
  let remainingOffset = cursor ? 0 : Math.max(0, (page - 1) * pageSize)
  let scannedPages = 0
  let upstreamHasNextPage = true
  let nextCursor: string | null = null

  while (
    (remainingOffset > 0 || collected.length < pageSize) &&
    upstreamHasNextPage &&
    scannedPages < CIVITAI_SEARCH_BASE_MODEL_MAX_SCAN_PAGES
  ) {
    const requestCursor = upstreamCursor
    const url = new URL(CIVITAI_MODELS_API)
    url.searchParams.set('types', 'LORA')
    url.searchParams.set('limit', String(CIVITAI_SEARCH_BASE_MODEL_SCAN_LIMIT))
    url.searchParams.set('sort', sort)
    url.searchParams.set('nsfw', String(nsfwFilter !== 'safe'))
    // 'other' 桶的无搜索词浏览也复用本扫描路径——空 query 不发参数，
    // 保持与纯浏览请求一致的 upstream 语义。
    if (search) url.searchParams.set('query', search)
    if (upstreamCursor) url.searchParams.set('cursor', upstreamCursor)
    appendBaseModelFamilyParams(url, baseModel)

    const result = await fetchCivitaiLoraPage(url, nsfwFilter)
    scannedPages += 1

    const familyItems = filterByBaseModelFamily(result.items, baseModel)
    const consumedItemIds = new Set(skippedItemIds)
    let availableItems = familyItems.filter((item) => {
      const wasConsumed =
        skippedItemIds.has(item.id) || seenItemIds.has(item.id)
      if (wasConsumed) consumedItemIds.add(item.id)
      return !wasConsumed
    })
    familyItems.forEach((item) => seenItemIds.add(item.id))

    if (remainingOffset > 0) {
      const offsetCount = Math.min(remainingOffset, availableItems.length)
      availableItems
        .slice(0, offsetCount)
        .forEach((item) => consumedItemIds.add(item.id))
      availableItems = availableItems.slice(offsetCount)
      remainingOffset -= offsetCount
    }

    if (remainingOffset === 0) {
      const remainingCapacity = pageSize - collected.length
      if (availableItems.length > remainingCapacity) {
        const pageItems = availableItems.slice(0, remainingCapacity)
        appendUniqueLibraryItems(collected, pageItems)
        pageItems.forEach((item) => consumedItemIds.add(item.id))
        nextCursor = createCivitaiSearchScanCursor({
          upstreamCursor: requestCursor,
          skippedItemIds: [...consumedItemIds],
        })
        break
      }
      appendUniqueLibraryItems(collected, availableItems)
    }

    upstreamCursor = result.nextCursor
    upstreamHasNextPage = result.hasNextPage && Boolean(upstreamCursor)
    skippedItemIds = new Set()

    if (collected.length === pageSize) {
      nextCursor =
        upstreamHasNextPage && upstreamCursor
          ? createCivitaiSearchScanCursor({
              upstreamCursor,
              skippedItemIds: [],
            })
          : null
      break
    }
  }

  if (!nextCursor && upstreamHasNextPage && upstreamCursor) {
    nextCursor = createCivitaiSearchScanCursor({
      upstreamCursor,
      skippedItemIds: [],
    })
  }

  return {
    items: collected,
    page,
    pageSize,
    total: null,
    hasNextPage: Boolean(nextCursor),
    nextCursor,
  }
}

export async function listCivitaiLoras(
  input: ListCivitaiLorasInput = {},
): Promise<CivitaiLoraLibraryResult> {
  const {
    page = 1,
    pageSize = CIVITAI_LORA_PAGE_SIZE,
    baseModel = 'all',
    sort = 'Highest Rated',
    nsfwFilter = DEFAULT_LORA_NSFW_FILTER,
    source,
  } = input
  const normalizedSearch = input.search?.trim() ?? ''

  // B11：有搜索词就先走 civitai 自家 meilisearch（真排序，REST 带 query 时
  // 忽略 sort）；端点非正式、公钥可能轮换，失败就回落现有 REST 搜索路径，
  // 结果打上 sortFellBackToRelevance 让 UI 把排序控件降级显示成「按相关性」。
  //
  // Issue C（docs/plans/lora-search-image-audit-2026-07.md）：这个选择每次
  // 请求独立做，与上一页无关——但 meilisearch 走 offset 分页、REST 回落走
  // cursor scan 分页，client 的 page↔cursor 映射假设"同一搜索会话全程同一
  // 分页范式"。会话中途换后端（比如 page2 撞上 civitai 间歇 503 回落
  // REST，page3 时 civitai 又恢复、meilisearch 重新命中）就会打乱这个假
  // 设，翻页出现重复/错位。`source` 由 client 在首页决定后回传，锁定同一
  // 会话内的后端选择：
  //   source === 'rest'：跳过 meilisearch，直接走 REST（保持 cursor 语义
  //     连续，不再尝试一次注定被忽略的 meilisearch 请求）。
  //   source === 'meilisearch'：中途失败直接整体抛错/由路由层 502，不再
  //     偷偷回落 REST——好过静默换分页范式。
  //   source 缺省（首页 / 未锁定）：自由选择，行为与今天一致。
  if (normalizedSearch) {
    if (source === 'rest') {
      const fallback = await listCivitaiLorasViaRest(input)
      return { ...fallback, sortFellBackToRelevance: true }
    }
    try {
      return await listCivitaiLorasBySearch({
        page,
        pageSize,
        search: normalizedSearch,
        baseModel,
        sort,
        nsfwFilter,
      })
    } catch (error) {
      if (source === 'meilisearch') {
        logger.warn(
          'Civitai meilisearch failed mid-session (locked backend) — surfacing error instead of silently falling back to REST',
          {
            error: error instanceof Error ? error.message : 'Unknown',
            search: normalizedSearch,
            baseModel,
            sort,
            page,
          },
        )
        throw error
      }
      logger.warn('Civitai meilisearch failed, falling back to REST search', {
        error: error instanceof Error ? error.message : 'Unknown',
        search: normalizedSearch,
        baseModel,
        sort,
      })
      const fallback = await listCivitaiLorasViaRest(input)
      return { ...fallback, sortFellBackToRelevance: true }
    }
  }

  return listCivitaiLorasViaRest(input)
}

async function listCivitaiLorasViaRest({
  page = 1,
  pageSize = CIVITAI_LORA_PAGE_SIZE,
  cursor,
  search,
  baseModel = 'all',
  sort = 'Highest Rated',
  nsfwFilter = DEFAULT_LORA_NSFW_FILTER,
}: ListCivitaiLorasInput = {}): Promise<CivitaiLoraLibraryResult> {
  const url = new URL(CIVITAI_MODELS_API)
  const normalizedSearch = search?.trim() ?? ''
  let nextPageCursor = cursor?.trim() ?? ''
  // 'other' 兜底桶即使无搜索词也走扩窗扫描：REST 表达不了 NOT IN，单页
  // upstream 窗口（pageSize 条）几乎全被 named family 占据，补集过滤后
  // 直接空页 dead-end——必须像 search+family 一样 over-fetch 多页凑满。
  if ((normalizedSearch || baseModel === 'other') && baseModel !== 'all') {
    return listSearchedBaseModelCivitaiLoras({
      page,
      pageSize,
      cursor: nextPageCursor || null,
      search: normalizedSearch,
      baseModel,
      sort,
      nsfwFilter,
    })
  }

  try {
    const upstreamLimit = pageSize

    if (!nextPageCursor && page > 1 && !normalizedSearch) {
      nextPageCursor =
        (await resolveCivitaiRestCursorForPage({
          page,
          pageSize: upstreamLimit,
          baseModel,
          sort,
          nsfwFilter,
        })) ?? ''

      if (!nextPageCursor) {
        return {
          items: [],
          page,
          pageSize,
          total: null,
          hasNextPage: false,
          nextCursor: null,
        }
      }
    }

    url.searchParams.set('types', 'LORA')
    url.searchParams.set('limit', String(upstreamLimit))
    url.searchParams.set('sort', sort)
    url.searchParams.set('nsfw', String(nsfwFilter !== 'safe'))
    if (normalizedSearch) {
      url.searchParams.set('query', normalizedSearch)
    }
    // Civitai's REST `page` parameter is unreliable for models/images: live
    // checks show `page=6` can return page 1. Only the first page may use
    // `page`; later non-search pages must be addressed by cursor.
    if (nextPageCursor) {
      url.searchParams.set('cursor', nextPageCursor)
    } else if (!normalizedSearch) {
      url.searchParams.set('page', '1')
    }
    if (baseModel !== 'all') {
      appendBaseModelFamilyParams(url, baseModel)
    }
    // Keep non-search filtering upstream so Civitai applies sort over the full
    // result set before pagination. Search + baseModel uses the scan path above
    // because Civitai under-fills `query + baseModels` at small limits.

    // Civitai's public API blips with intermittent 5xx/timeouts — withRetry
    // wraps three attempts with exponential backoff. Our CivitaiFetchError
    // carries `.status` so the default retry classifier lets 4xx fail fast
    // (a bad query won't get better by hammering it).
    const result = await fetchCivitaiLoraPage(url, nsfwFilter)
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
  // 'other' 兜底桶不预热：REST 补集只能扩窗扫描（每个 sort 最多 10 次上游
  // 请求），命中率又低，边缘缓存价值配不上这个成本——冷路径按需加载即可。
  const tasks = CIVITAI_LORA_BASE_MODEL_VALUES.filter(
    (baseModel) => baseModel !== 'other',
  ).flatMap((baseModel) =>
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
// /api/v1/images browsingLevel bitmask（NsfwLevel 标志位 OR）：
//   1 None · 2 Soft · 4 Mature · 8 X · 16 XXX · 32 Blocked
// 31 = 1|2|4|8|16 放开到 XXX、仍挡 Blocked——与来源配方/库封面天花板对齐，
// 让 NSFW LoRA 的社区生成也进入"一键同款"挖掘（用户已主动打开该 LoRA）。
const CIVITAI_IMAGES_BROWSING_LEVEL_ALL = 31
// model-versions images[] use the numeric nsfwLevel scale:
//   1 None · 2 Soft · 4 Mature · 8 X · 16 XXX · 32 Blocked
// safe 档只留 None/Soft；unrestricted / nsfwOnly 放到 XXX（仍挡 Blocked=32），
// 让 hentai 类 LoRA（示例图全 XXX）也能出封面——否则 6 张候选全被挡成占位卡。
const CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL = 2
const CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL_PERMISSIVE = 16

// 图片级封面天花板跟三态走。模型可见性仍由 listCivitaiLoras* 里的既有三态
// 过滤（nsfw= 参数 + 名称词表 + isNsfw）负责，这里只决定"选出来的图放到哪
// 一级"——safe 档保持干净封面，其余两档露出 NSFW 封面。
function maxImageNsfwLevelFor(nsfwFilter: LoraNsfwFilter): number {
  return nsfwFilter === 'safe'
    ? CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL
    : CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL_PERMISSIVE
}

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
    // 'image' | 'video' — 配方缩略条同样是 <img>，视频条目直接跳过。
    type: z.string().optional(),
    width: CivitaiImageDimensionSchema,
    height: CivitaiImageDimensionSchema,
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
  return trimmed ? repairUtf8Mojibake(trimmed) : undefined
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
      name: repairUtf8Mojibake(name),
      weight:
        weight !== undefined && Number.isFinite(weight) ? weight : undefined,
    })
  }
  return tags
}

/** "add-detail-xl.safetensors" → "add-detail-xl" (in-prompt tag name). */
function fileNameStem(fileName: string): string {
  return repairUtf8Mojibake(fileName.replace(/\.[^.]+$/, '')).toLowerCase()
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
    knownTargetNames.add(repairUtf8Mojibake(matchedResource.name).toLowerCase())
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
    const repairedName = r.name ? repairUtf8Mojibake(r.name) : undefined
    const key = repairedName?.toLowerCase()
    if (key) {
      if (seenNames.has(key) || knownTargetNames.has(key)) continue
      seenNames.add(key)
    }
    extras.push({
      name: repairedName,
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

interface ModelVersionSourceImages {
  recipes: CivitaiImageRecipe[]
  // 无配方兜底：静态 + 在天花板内、但没带 prompt 的示例图，供纯预览展示。
  previews: CivitaiPreviewImage[]
}

async function fetchModelVersionSourceRecipes(
  modelId: number,
  modelVersionId: number,
  targetHashLower: string | null,
): Promise<ModelVersionSourceImages> {
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
    return { recipes: [], previews: [] }
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
    return { recipes: [], previews: [] }
  }

  // In-prompt `<lora:NAME:..>` tags use the file name stem — collect every
  // file's stem as a name hint so multi-tag prompts can identify our tag.
  const targetNameHints = (parsed.data.files ?? [])
    .map((file) => (file.name ? fileNameStem(file.name) : null))
    .filter((stem): stem is string => Boolean(stem))

  const recipes: CivitaiImageRecipe[] = []
  const previews: CivitaiPreviewImage[] = []
  for (const image of parsed.data.images ?? []) {
    // 挖掘"一键同款"来源配方是用户主动打开某把 LoRA 的动作（无三态语境）——
    // 与库封面天花板一致放到 XXX，让 NSFW LoRA 的来源图配方也能露出。
    if (
      (image.nsfwLevel ?? 1) >
      CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL_PERMISSIVE
    ) {
      continue
    }
    // 视频条目进不了 <img> 缩略条（isStaticCivitaiImage 定义处有实测说明）。
    if (!isStaticCivitaiImage(image)) continue
    const rawPrompt = repairUtf8Mojibake(image.meta?.prompt ?? '')
    const prompt = cleanRecommendedPrompt(rawPrompt)
    if (!prompt) {
      // 无 prompt 元数据的静态示例图 → 无法组配方，但可作纯预览图兜底
      // （作者没在 Civitai 上填生成参数，全站这类 LoRA 都会命中这条）。
      if (image.url && previews.length < CIVITAI_IMAGES_RECIPE_CAP) {
        previews.push({
          imageUrl: image.url,
          width: image.width,
          height: image.height,
          nsfwLevel: image.nsfwLevel,
        })
      }
      continue
    }
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

  return { recipes, previews }
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
  /**
   * Lower-case AutoV3 hash of the primary LoRA file. Optional — search-hit
   * LoRAs (meilisearch path) never carry a file hash (the search index
   * doesn't expose files[].hashes). `fetchModelVersionSourceRecipes` only
   * needs modelId+modelVersionId to locate source images; the hash (when
   * present) is only used to attribute a matched image's real per-LoRA
   * weight via `resolveRecipeLoraSignals`, which already accepts a null
   * `targetHashLower`. See Issue A, docs/plans/lora-search-image-audit-2026-07.md.
   */
  fileHashAutoV3?: string | null
}

// 方案 B（无配方兜底）：作者常把推荐 prompt 写在 model.description 的纯段落里
// （非 <pre><code>，trigger 抽取抓不到）。/model-versions/:id 不带模型描述，
// 所以无配方时单独拉一次 /models/:id 取整段描述，strip 成可读纯文本原样返回，
// 让用户自己读+复制。best-effort：拿不到就返回 undefined，不阻塞主流程。
const CivitaiModelDescriptionSchema = z
  .object({ description: z.string().nullable().optional() })
  .passthrough()

async function fetchCivitaiModelDescriptionText(
  modelId: number,
): Promise<string | undefined> {
  const url = new URL(`${CIVITAI_MODELS_API}/${modelId}`)
  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 2000,
      label: 'civitai.modelDescription',
    })
  } catch (error) {
    logger.warn('Civitai model description fetch failed', {
      modelId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return undefined
  }
  const parsed = CivitaiModelDescriptionSchema.safeParse(payload)
  if (!parsed.success) return undefined
  const text = civitaiDescriptionToText(parsed.data.description)
  return text.length > 0 ? text : undefined
}

export async function mineCivitaiUserPrompts({
  modelId,
  modelVersionId,
  fileHashAutoV3,
}: MineCivitaiUserPromptsInput): Promise<CivitaiMinedPromptsResult> {
  const targetHash = fileHashAutoV3?.toLowerCase() ?? null

  // 无配方兜底：模型版本示例图里没带 prompt 的静态图，留到最后（community
  // 路径也挖不到配方时）作纯预览展示。
  let sourcePreviews: CivitaiPreviewImage[] = []
  if (modelVersionId !== undefined) {
    const { recipes: sourceRecipes, previews } =
      await fetchModelVersionSourceRecipes(modelId, modelVersionId, targetHash)
    if (sourceRecipes.length > 0) {
      return {
        outfits: deriveOutfitsFromRecipes(sourceRecipes),
        totalSampled: sourceRecipes.length,
        recipes: sourceRecipes,
      }
    }
    sourcePreviews = previews
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
    String(CIVITAI_IMAGES_BROWSING_LEVEL_ALL),
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
    // 视频条目进不了 <img> 缩略条（isStaticCivitaiImage 定义处有实测说明）。
    if (!isStaticCivitaiImage(item)) continue
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
    const prompt = repairUtf8Mojibake(sdMeta.prompt?.trim() ?? '')
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
    const seg = extractActivationSegment(
      prompt,
      repairUtf8Mojibake(matched.name),
    )
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

  // 无配方兜底（方案 B）：到处都挖不到配方时，额外拉一次模型描述，原样给用户
  // 自读+复制（best-effort，失败不阻塞）。
  const descriptionText =
    recipes.length === 0
      ? await fetchCivitaiModelDescriptionText(modelId)
      : undefined

  return {
    outfits: summarised,
    totalSampled: consideredCount,
    recipes,
    // community 路径也没挖到配方时，才把模型版本示例图当纯预览图露出。
    previewImages:
      recipes.length === 0 && sourcePreviews.length > 0
        ? sourcePreviews
        : undefined,
    descriptionText,
  }
}
