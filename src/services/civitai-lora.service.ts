import 'server-only'

import { z } from 'zod'

import {
  CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
  CIVITAI_NAMED_BASE_MODEL_MEMBER_SET,
  CIVITAI_USAGE_CONTROL_DOWNLOAD,
  type LoraNsfwFilter,
} from '@/constants/lora'
import {
  extractActivationSegment,
  summariseActivationSegments,
} from '@/lib/civitai-image-prompt-mine'
import { buildCivitaiLoraNameSearchQueries } from '@/lib/civitai-lora-reference'
import { parseCivitaiVersionIdFromDownloadUrl } from '@/lib/civitai-lora-url'
import { CircuitOpenError } from '@/lib/circuit-breaker'
import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import {
  blurhashAverageColor,
  CIVITAI_CARD_WIDTH,
  CIVITAI_COVER_WIDTH,
  CIVITAI_PREVIEW_WIDTH,
  CIVITAI_THUMB_WIDTH,
  inferLoraType,
  isStaticCivitaiImage,
} from '@/lib/civitai-library-item'
import { cleanRecommendedPrompt } from '@/lib/lora-trigger-clean'
import { civitaiDescriptionToText } from '@/lib/civitai-description-parse'
import { extractCivitaiTrigger } from '@/lib/lora-trigger-extract'
import { logger } from '@/lib/logger'
import { repairUtf8Mojibake } from '@/lib/text-encoding-repair'
import { withRetry } from '@/lib/with-retry'
import type {
  CivitaiImageRecipe,
  CivitaiLoraLibraryItem,
  CivitaiMinedPromptsResult,
  CivitaiModelDescriptionResult,
  CivitaiPreviewImage,
  CivitaiRecipeExtraLora,
} from '@/types'

const CIVITAI_MODELS_API = 'https://civitai.com/api/v1/models'
const CIVITAI_MODEL_VERSIONS_API = 'https://civitai.com/api/v1/model-versions'
const CIVITAI_MODEL_SEARCH_API = 'https://search-new.civitai.com/multi-search'
const CIVITAI_MODEL_SEARCH_INDEX = 'models_v9'
// Public browser key shipped by civitai.com for its own search UI. This is not
// a private secret; keep it scoped to read-only model lookups.
const CIVITAI_MODEL_SEARCH_PUBLIC_KEY =
  '8c46eb2508e21db1e9828a97968d91ab1ca1caa5f70a00e88a2ba1e286603b61'
const CIVITAI_REQUEST_TIMEOUT_MS = 8000

// 搜索路径的两级超时。meilisearch 健康时实测 0.55–1.1s（2026-08-19 curl 对
// 照），所以 5s 已经是"上游明显不健康"的信号。但同一天的过载事故里它返回
// 在 7.99s——只是慢，不是死；单一 8s 闸会把这种"慢但会成功"直接判死。所以
// 第一发快速失败，再给一发更长预算，只有两发都不回来才认定上游搜索不可用。
const CIVITAI_SEARCH_TIMEOUT_FAST_MS = 5000
const CIVITAI_SEARCH_TIMEOUT_PATIENT_MS = 10_000

// Civitai 上游把「没有值」写成 null，而不是省略字段。z.number()/z.string()
// 拒 null，而 .passthrough() 只放行未声明的字段、不放宽已声明字段的类型
// ——于是一页 36 条命中里有 1 条 null 就让整份响应 parse 抛错。
//
// 实测 2026-08-08，1404 条命中样本（7 个类型 × 3 种排序 × L1/L2 两条子
// query）里只有两处声明字段带 null：`metrics.downloadCount`（部分模型的
// 下载数上游就是 null，hit/version 两层同时）与 `user.username`（作者已
// 注销）。null 与字段缺失同义（都是「这个值不知道」），校验前统一归一成
// undefined，消费方的 `?? 0` / `?? null` 兜底照旧。真正写错的类型（数字
// 字段给字符串）仍然照旧报错——这里放宽的只有 null。
function nullableOptional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === null ? undefined : value),
    schema.optional(),
  )
}

const CivitaiStatsSchema = z
  .object({
    downloadCount: nullableOptional(z.number()),
    thumbsUpCount: nullableOptional(z.number()),
  })
  .passthrough()

const CivitaiFileSchema = z
  .object({
    type: z.string().optional(),
    name: z.string().optional(),
    primary: z.boolean().optional(),
    downloadUrl: z.string().url().optional(),
    sizeKB: z.number().optional(),
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
    hash: nullableOptional(z.string()),
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
    // Creator Controls。只有 version 详情端点带它，列表/搜索都没有——
    // 判据与三个实测坑见 `CIVITAI_USAGE_CONTROL_DOWNLOAD` 的注释。
    usageControl: z.string().nullable().optional(),
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
    // S3 授权徽标「需署名」判定（lora-workbench.md §2.4 P0-2 规范）。
    allowNoCredit: z.boolean().optional(),
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
    // B11：meilisearch 版本对象带 trainedWords / metrics，但从不带
    // files[].downloadUrl——下载链接改为直接构造，见
    // buildCivitaiVersionDownloadUrl。
    trainedWords: z.array(z.string()).optional(),
    metrics: CivitaiStatsSchema.optional(),
    createdAt: z.string().optional(),
    // 2026-08-19 实测（50/50 命中）：AutoV3 就在版本对象的 hashData 里，
    // 带 type 标注。此前这里判定"meilisearch 拿不到 AutoV3"是找错了地方
    // ——它不在 files[].hashes 上。挂载栈靠这个哈希做匹配，拿得到就不该
    // 让搜索结果里的条目退化成 no-op。
    hashData: z
      .array(z.object({ hash: z.string(), type: z.string() }).passthrough())
      .optional(),
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
    // 每张图的 blurhash（2026-09-27 实测都带）——封面先铺它的平均色。
    hash: nullableOptional(z.string()),
  })
  .passthrough()

const CivitaiSearchUserSchema = z
  .object({
    // 作者注销后 username 是 null（不是省略）——见 nullableOptional 注释。
    username: nullableOptional(z.string()),
    image: z.string().nullable().optional(),
  })
  .passthrough()

const CivitaiSearchPermissionsSchema = z
  .object({
    allowCommercialUse: z.array(z.string()).optional(),
    allowDerivatives: z.boolean().optional(),
    allowNoCredit: z.boolean().optional(),
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
    // 只在请求带 showRankingScore 时出现（推荐档混热度要用），0–1。
    _rankingScore: z.number().optional(),
  })
  .passthrough()

// 单条命中的形状漂移只损失那一条。上面两个 null 字段是实测抓到的，但
// search-new.civitai.com 是 civitai 自家搜索 UI 用的非正式端点、没有公开
// 契约——下一个字段哪天开始回 null，逐字段补类型是追不上的。整份响应因为
// 一条命中的一个字段而 parse 抛错，整次查找就失败了。这里按条校验：解析不过的条
// 目丢掉并 warn 出来（漂移在日志里大声，而不是在用户面前把整个库打黑），
// 响应外层（results 数组本身）仍然硬校验——外层坏了才是「端点坏了」。
function parseSearchHits(
  entries: readonly unknown[],
): z.infer<typeof CivitaiSearchHitSchema>[] {
  const hits: z.infer<typeof CivitaiSearchHitSchema>[] = []
  const droppedIssues: string[] = []
  for (const entry of entries) {
    const parsed = CivitaiSearchHitSchema.safeParse(entry)
    if (parsed.success) {
      hits.push(parsed.data)
      continue
    }
    droppedIssues.push(
      parsed.error.issues
        .slice(0, 2)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    )
  }
  if (droppedIssues.length > 0) {
    logger.warn('Civitai search hits dropped by shape validation', {
      dropped: droppedIssues.length,
      total: entries.length,
      issues: droppedIssues.slice(0, 3),
    })
  }
  return hits
}

const CivitaiModelSearchResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          hits: z
            .array(z.unknown())
            .optional()
            .transform((entries) =>
              entries === undefined ? undefined : parseSearchHits(entries),
            ),
          estimatedTotalHits: z.number().optional(),
          // 用 page/hitsPerPage 发的 query 回的是精确总数（hitsPerPage 0 只要数）。
          totalHits: z.number().optional(),
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

// ── 收藏自愈回填（解法一，配方还原主线）──────────────────────────────
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
      isRetryable: isCivitaiRetryable,
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
    !searchVersionHasMatchingFileStem(version, options.exactNameKey)
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
 * 词干比对键：小写 + 去空格/横线/下划线/点。
 * （导出给本地库匹配复用 — 同一把尺子量本地行和 Civitai 文件名。）
 */
export function normalizeLoraNameKey(value: string): string {
  return repairUtf8Mojibake(value)
    .toLowerCase()
    .replace(/[\s\-_.]+/g, '')
}

/**
 * Soft LoRA name match for meta ↔ file stems.
 *
 * Exact after normalize, or one side is the other plus a short numeric
 * WebUI instance suffix (`...v1.198` vs `...v1.198_1` → keys differ by a
 * trailing `1`). Rejects short keys to avoid accidental collapses.
 */
export function loraNameKeysMatch(a: string, b: string): boolean {
  const na = normalizeLoraNameKey(a)
  const nb = normalizeLoraNameKey(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (shorter.length < 10) return false
  if (!longer.startsWith(shorter)) return false
  const rest = longer.slice(shorter.length)
  return rest === '' || /^\d{1,3}$/.test(rest)
}

function isKnownTargetLoraName(
  name: string | null | undefined,
  knownTargetNames: ReadonlySet<string>,
): boolean {
  if (!name) return false
  const key = name.toLowerCase()
  if (knownTargetNames.has(key)) return true
  for (const known of knownTargetNames) {
    if (loraNameKeysMatch(key, known)) return true
  }
  return false
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

export function acceptedBaseModelNames(
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
function searchVersionHasMatchingFileStem(
  version: { files?: { name?: string }[] },
  targetNameKey: string,
): boolean {
  return (
    version.files?.some(
      (file) =>
        file.name && loraNameKeysMatch(fileNameStem(file.name), targetNameKey),
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
          // Soft match is applied after fetch via searchVersionHasMatchingFileStem
          // on the live files list (exactNameKey still uses soft match below).
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

function matchLibraryItemByFileStem(
  items: readonly z.infer<typeof CivitaiModelSchema>[],
  targetNameKey: string,
): CivitaiLoraLibraryItem | null {
  for (const model of items) {
    for (const version of model.modelVersions ?? []) {
      const matched = version.files?.some(
        (file) =>
          file.name &&
          loraNameKeysMatch(fileNameStem(file.name), targetNameKey),
      )
      if (matched) {
        return toLibraryItem({ ...model, modelVersions: [version] })
      }
    }
  }
  return null
}

/**
 * 名字搜索兜底。实测依据（2026-06-11）：图 meta 的 resources hash 常是
 * 作者本地文件（剪枝/转码副本）的 hash，by-hash 对不上 Civitai 索引；
 * 但 meta 名字 ≈ 上架文件的词干（如 "EnchantingEyesIllustrious" ↔
 * EnchantingEyesIllustrious.safetensors），词干匹配即可确定性定位。
 *
 * 2026-08：本地 stem 全名常搜不到（`illus01_style_collection_elpe_v0.22`），
 * 按 buildCivitaiLoraNameSearchQueries 多路降噪后再精确/软匹配文件词干。
 */
async function resolveCivitaiLoraByNameStem(
  name: string,
): Promise<CivitaiLoraLibraryItem | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const target = normalizeLoraNameKey(trimmed)
  const queries = buildCivitaiLoraNameSearchQueries(trimmed)

  for (const query of queries) {
    const url = new URL(CIVITAI_MODELS_API)
    url.searchParams.set('types', 'LORA')
    url.searchParams.set('limit', String(CIVITAI_RESOLVE_SEARCH_LIMIT))
    url.searchParams.set('query', query)

    let payload: unknown
    try {
      payload = await withRetry(() => fetchCivitaiPayload(url), {
        maxAttempts: 2,
        baseDelayMs: 400,
        maxDelayMs: 1500,
        label: 'civitai.resolveLoraByName',
        isRetryable: isCivitaiRetryable,
      })
    } catch (error) {
      logger.warn('Civitai LoRA name search failed', {
        name: trimmed,
        query,
        error: error instanceof Error ? error.message : 'Unknown',
      })
      continue
    }

    const parsed = CivitaiModelsResponseSchema.safeParse(payload)
    if (!parsed.success) continue

    const hit = matchLibraryItemByFileStem(parsed.data.items, target)
    if (hit) return hit
  }
  return null
}

async function resolveCivitaiLoraByWebSearchNameStem(
  name: string,
  baseModelFamily: string | null | undefined,
): Promise<CivitaiLoraLibraryItem | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const queries = buildCivitaiLoraNameSearchQueries(trimmed)
  const filter = buildCivitaiSearchFilters(baseModelFamily)

  let payload: unknown
  try {
    payload = await fetchCivitaiSearchPayload(
      queries.map((q) => ({
        indexUid: CIVITAI_MODEL_SEARCH_INDEX,
        q,
        limit: CIVITAI_WEB_RESOLVE_SEARCH_LIMIT,
        offset: 0,
        filter,
      })),
      'civitai.resolveLoraByWebSearchName',
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
          !searchVersionHasMatchingFileStem(version, target)
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

export interface CivitaiCheckpointResolution {
  modelVersionId: number
  name: string
  /** Raw Civitai baseModel string (e.g. 'Illustrious', 'Anima', 'SD 1.5'). */
  baseModel: string | null
  downloadUrl: string
  sizeKB: number | null
  fileHashAutoV3: string | null
  /** Civitai 公布的文件 SHA-256（小写）；Runner fork 下载后据此核对。没公布为 null。 */
  sha256: string | null
}

/**
 * Resolve a recipe's checkpoint (by Civitai model-version id — captured into
 * CivitaiImageRecipe.checkpointVersionId, V3-1) to a concrete download target:
 * the base model the runner must fetch for a faithful (T1) clone, plus its raw
 * baseModel string (→ architecture tiering) and file size (→ Volume budget).
 *
 * Returns null when the version isn't a Checkpoint, isn't resolvable
 * (gated/deleted/blip), or has no downloadable file — the caller then falls
 * back to the approximate (T2) tier. No token is sent (mirrors the LoRA
 * resolver); public checkpoints resolve fine. TODO(v3): pass the system Civitai
 * token so gated-but-downloadable checkpoints resolve as T1 instead of T2.
 *
 * See docs/references/domains/runner.md.
 */
export async function resolveCivitaiCheckpointByReference({
  modelVersionId,
  hash,
}: {
  modelVersionId?: number
  hash?: string
}): Promise<CivitaiCheckpointResolution | null> {
  if (modelVersionId == null && !hash) return null
  const url = new URL(
    modelVersionId != null
      ? `${CIVITAI_MODEL_VERSIONS_API}/${modelVersionId}`
      : `${CIVITAI_MODEL_VERSIONS_API}/by-hash/${encodeURIComponent(hash!.toLowerCase())}`,
  )

  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.resolveCheckpointReference',
      isRetryable: isCivitaiRetryable,
    })
  } catch (error) {
    logger.warn('Civitai checkpoint reference resolve failed', {
      modelVersionId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return null
  }

  const parsed = CivitaiVersionResolveSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn('Civitai checkpoint reference response had unexpected shape', {
      modelVersionId,
    })
    return null
  }
  const version = parsed.data

  // Guard: the reference must point at a Checkpoint, never a LoRA/embedding —
  // we never feed a non-checkpoint into ComfyUI's CheckpointLoaderSimple.
  if ((version.model?.type ?? '').toLowerCase() !== 'checkpoint') return null

  // Prefer the primary model file (the .safetensors checkpoint); fall back to
  // any model-typed file, then any file carrying a download url.
  const file =
    version.files?.find(
      (candidate) =>
        candidate.primary && (candidate.type ?? '').toLowerCase() === 'model',
    ) ??
    version.files?.find(
      (candidate) => (candidate.type ?? '').toLowerCase() === 'model',
    ) ??
    version.files?.find((candidate) => candidate.downloadUrl)
  const downloadUrl = file?.downloadUrl ?? version.downloadUrl
  if (!downloadUrl) return null

  return {
    modelVersionId: version.id,
    name: version.name,
    baseModel: version.baseModel ?? null,
    downloadUrl,
    sizeKB: file?.sizeKB ?? null,
    fileHashAutoV3: file?.hashes?.AutoV3?.toLowerCase() ?? null,
    sha256: normalizeSha256(file?.hashes?.SHA256),
  }
}

function normalizeSha256(value: string | undefined): string | null {
  const lower = value?.trim().toLowerCase()
  return lower && /^[a-f0-9]{64}$/.test(lower) ? lower : null
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

// ── Creator Controls：这把 LoRA 的权重到底能不能被下走 ────────────────────
//
// 2026-08-29 owner 真机：挂 `Ananta`（version 2266398）出图，Runner 线报
// 「你的 API Key 无效或已过期」、云端 API 线报 `URL responded with status
// code: 401`，两条其实是同一件事——作者把下载关了，`usageControl` 是
// `Generation`。Civitai 对**任何** token 都返 401，所以这不是凭据问题，
// 换 token / 加 token 一点用都没有，唯一出路是换一把 LoRA。

const CivitaiDownloadPolicySchema = z
  .object({
    id: z.number(),
    usageControl: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    model: z
      .object({ name: z.string().nullable().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()

export interface CivitaiLoraDownloadPolicy {
  modelVersionId: number
  /**
   * `true` = 作者禁用了下载（`usageControl` 存在且不是 `Download`）。
   * `false` = 明确可下载。
   * **`null` = 判不了**（上游超时/5xx/形状变了/这个字段没返）——调用方必须
   * 按放行处理：这道闸是"提前说清楚"，不是新增一条能把好 LoRA 挡在门外的
   * 单点故障。Civitai 挂了不该让所有带 LoRA 的生成都失败。
   */
  downloadDisabled: boolean | null
  usageControl: string | null
  /** 报错文案里点名用；拿不到就留 null，别编。 */
  name: string | null
}

export async function fetchCivitaiLoraDownloadPolicy(
  modelVersionId: number,
): Promise<CivitaiLoraDownloadPolicy> {
  const unknown: CivitaiLoraDownloadPolicy = {
    modelVersionId,
    downloadDisabled: null,
    usageControl: null,
    name: null,
  }
  const url = new URL(`${CIVITAI_MODEL_VERSIONS_API}/${modelVersionId}`)

  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.downloadPolicy',
      isRetryable: isCivitaiRetryable,
    })
  } catch (error) {
    logger.warn('Civitai download policy fetch failed; letting the job pass', {
      modelVersionId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return unknown
  }

  const parsed = CivitaiDownloadPolicySchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn('Civitai download policy response had unexpected shape', {
      modelVersionId,
      issues: parsed.error.issues.map((issue) => issue.message).join('; '),
    })
    return unknown
  }

  const usageControl = parsed.data.usageControl ?? null
  return {
    modelVersionId,
    downloadDisabled:
      usageControl === null
        ? null
        : usageControl !== CIVITAI_USAGE_CONTROL_DOWNLOAD,
    usageControl,
    name: parsed.data.model?.name ?? parsed.data.name ?? null,
  }
}

/**
 * 一次生成请求里所有 Civitai LoRA 的"下载被作者关掉"清单。
 *
 * 闸写在这一处、按 URL 收口，是因为下游有两条完全不同的路径（Runner 自己
 * 下载进 R2 / 云端 API 由 provider 去下），而入口不止一个（工作台、画布、
 * 配方还原、收藏、@ 补挂）。逐条 provider 报错去猜，只会得到两套互相矛盾
 * 的谎话——上一轮就是这么把它说成「API Key 失效」的。
 *
 * 非 Civitai 的 LoRA（HF / 自训练 / 已在 R2 的）直接跳过：这个字段只有
 * Civitai 有。判不了的（`downloadDisabled === null`）不进清单 —— 见
 * `CivitaiLoraDownloadPolicy.downloadDisabled` 的 fail-open 说明。
 */
export async function findCivitaiLorasWithDownloadDisabled(
  loraUrls: readonly string[],
): Promise<CivitaiLoraDownloadPolicy[]> {
  const versionIds = [
    ...new Set(
      loraUrls
        .map((url) => parseCivitaiVersionIdFromDownloadUrl(url))
        .filter((id): id is number => id !== null),
    ),
  ]
  if (versionIds.length === 0) return []

  const policies = await Promise.all(
    versionIds.map((id) => fetchCivitaiLoraDownloadPolicy(id)),
  )
  return policies.filter((policy) => policy.downloadDisabled === true)
}

/**
 * Runner 下载核对：这个 Civitai 版本里模型文件公布的 SHA-256（小写，去重）。
 * 查询失败或版本里没有公布返回 null——调用方当「来源没公布」，照下不拦。
 */
export async function fetchCivitaiModelFileSha256s(
  modelVersionId: number,
): Promise<string[] | null> {
  const url = new URL(`${CIVITAI_MODEL_VERSIONS_API}/${modelVersionId}`)
  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.fileSha256',
      isRetryable: isCivitaiRetryable,
    })
  } catch (error) {
    logger.warn('Civitai file SHA-256 lookup failed', {
      modelVersionId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return null
  }
  const parsed = CivitaiModelVersionSchema.safeParse(payload)
  if (!parsed.success) return null
  const hashes = new Set<string>()
  for (const file of parsed.data.files ?? []) {
    if ((file.type ?? '').toLowerCase() !== 'model') continue
    const sha256 = normalizeSha256(file.hashes?.SHA256)
    if (sha256) hashes.add(sha256)
  }
  return hashes.size > 0 ? [...hashes] : null
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
      isRetryable: isCivitaiRetryable,
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

// Which version becomes the library item: the first one that has a download URL.
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
function pickShownImages(
  version: z.infer<typeof CivitaiModelVersionSchema>,
  maxNsfwLevel: number,
): z.infer<typeof CivitaiImageSchema>[] {
  return (
    version.images
      ?.filter(
        (image) =>
          isStaticCivitaiImage(image) && (image.nsfwLevel ?? 1) <= maxNsfwLevel,
      )
      .slice(0, 6) ?? []
  )
}

/**
 * 上游的 `sizeKB` 是小数 KB（实测 `56075.02734375`）—— 换算成字节后取整。
 * 缺失时返回 null（**不是 0**）：0 会被卡面显示成「0 B」，那是个假事实。
 */
function toFileSizeBytes(sizeKB: number | undefined): number | null {
  if (typeof sizeKB !== 'number' || !Number.isFinite(sizeKB) || sizeKB <= 0) {
    return null
  }
  return Math.round(sizeKB * 1024)
}

function toLibraryItem(
  model: z.infer<typeof CivitaiModelSchema>,
  // 默认放到 XXX：resolve-by-hash / by-name 是"挂载用户指定的这把 LoRA"，
  // 无三态语境，应无条件出封面。list 路径显式传按 nsfwFilter 算好的天花板。
  maxImageNsfwLevel: number = CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL_PERMISSIVE,
  // 库 B 详情页的「版本」：指定映射哪一个版本；不给 = 第一个能下载的。
  pickedVersion?: z.infer<typeof CivitaiModelVersionSchema>,
): CivitaiLoraLibraryItem | null {
  if (model.type.toUpperCase() !== 'LORA') return null

  const version = pickedVersion ?? pickUsableModelVersion(model)
  if (!version) return null

  const loraUrl = pickDownloadUrl(version)
  if (!loraUrl) return null

  const tags = model.tags ?? []
  const shownImages = pickShownImages(version, maxImageNsfwLevel)
  const originalImageUrls = shownImages.map((image) => image.url)
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
    // ⚠ 2026-08-21 补：`sizeKB` 从一开始就在 `CivitaiFileSchema` 里解析着，但从
    // 没映射出去 —— 「这把 LoRA 多大」在整个前端取不到，而它是推荐卡要显示的
    // 事实之一。上游给的是**小数** KB（实测 56075.02734375），所以换算完取整。
    fileSizeBytes: toFileSizeBytes(primaryFile?.sizeKB),
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
    coverColor: blurhashAverageColor(shownImages[0]?.hash),
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
    allowNoCredit: model.allowNoCredit ?? true,
    isNsfw: model.nsfw ?? false,
  }
}

// ── B11：搜索路径切 civitai 自家 meilisearch（真排序）────────────────────
//
// REST `/api/v1/models` 带 `query` 时忽略 `sort`（官方 issue civitai/civitai
// #1848，我们自己 curl 对照实验也证实）。civitai 网页版自己的搜索走这个
// meilisearch 端点，排序字段实测（2026-07-04）全部生效。

/**
 * 所有 meilisearch 请求的唯一入口（三个调用点原本是逐字复制的同一段）。
 *
 * 两级超时：先用 fast 预算打一发，只有「超时」这一种失败才用 patient 预算
 * 再打一发。理由见 CIVITAI_SEARCH_TIMEOUT_FAST_MS 的注释——慢和死要分开
 * 处理，2026-08-19 那次上游只是慢（7.99s），却被单一 8s 闸判成了死。
 *
 * 非超时的失败（503 卸载、4xx、公钥失效）不在这里重试：那些要么是上游明
 * 确拒绝、要么是端点变了，重试都没有意义，交给调用方分流。
 */
export async function fetchCivitaiSearchPayload(
  queries: unknown[],
  label: string,
  /**
   * 覆盖两级超时预算。默认那套（5s → 10s）是按"用户在等"定的；后台同步拉
   * limit=500 的整页，没人在等，慢一点远好过失败重来。
   */
  budgets?: { fastMs: number; patientMs: number },
): Promise<unknown> {
  const fastMs = budgets?.fastMs ?? CIVITAI_SEARCH_TIMEOUT_FAST_MS
  const patientMs = budgets?.patientMs ?? CIVITAI_SEARCH_TIMEOUT_PATIENT_MS
  const url = new URL(CIVITAI_MODEL_SEARCH_API)
  const request = (timeoutMs: number) =>
    fetchCivitaiPayload(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CIVITAI_MODEL_SEARCH_PUBLIC_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ queries }),
      timeoutMs,
    })

  try {
    return await request(fastMs)
  } catch (error) {
    const timedOut =
      error instanceof CivitaiFetchError && error.status === undefined
    if (!timedOut) throw error
    logger.warn('Civitai meilisearch slow — retrying with a longer budget', {
      label,
      fastBudgetMs: fastMs,
      patientBudgetMs: patientMs,
    })
    return request(patientMs)
  }
}

/**
 * Error wrapper that carries the HTTP status (when applicable) so
 * `withRetry`'s default retryability check can distinguish retryable
 * 5xx/429 from terminal 4xx without having to grep error messages.
 */
class CivitaiFetchError extends Error {
  readonly status?: number
  /**
   * 上游 `Retry-After` 头解析出的毫秒数。有值 = Civitai 明确告诉我们它正在
   * 主动卸载（load shedding），这不是随机抖动，重试打回去只会加压。
   */
  readonly retryAfterMs?: number
  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message)
    this.name = 'CivitaiFetchError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

/** `Retry-After` 支持秒数和 HTTP 日期两种写法，两种都要认。 */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const at = Date.parse(header)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, at - Date.now())
}

/**
 * Civitai 专用的可重试判定，替掉 withRetry 的默认「5xx 一律重试」。
 *
 * 2026-08-19 实测：Civitai 对 `query=` 请求主动 load shedding 时回 503 +
 * `Retry-After: 2` + body `"Model search is temporarily overloaded"`，而且
 * 是持续的——间隔 2.5s 连打 4 次全部 503。默认策略把它当随机 5xx 退避重
 * 试 3 次，白等 21 秒还给上游加了三倍压力。带 Retry-After 的响应一律不在
 * 请求内重试，直接快速失败。
 */
function isCivitaiRetryable(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return false
  if (error instanceof CivitaiFetchError) {
    if (error.retryAfterMs !== undefined) return false
    if (error.status === undefined) return true // 超时 / 网络层
    if (error.status === 503) return false // 卸载，等价于 Retry-After
    return error.status >= 500 || error.status === 429
  }
  return false
}

interface CivitaiFetchOptions {
  method?: 'GET' | 'POST'
  headers?: HeadersInit
  body?: BodyInit | null
  /** 覆盖默认超时预算，搜索路径用它做两级超时。 */
  timeoutMs?: number
}

async function fetchCivitaiPayload(
  url: URL,
  options: CivitaiFetchOptions = {},
): Promise<unknown> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutMs = options.timeoutMs ?? CIVITAI_REQUEST_TIMEOUT_MS

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      // 超时错误不带 status，isCivitaiRetryable 据此判为可重试（网络层抖
      // 动，值得再来一发）。与 503 卸载区分开：那个带 status/Retry-After。
      reject(
        new CivitaiFetchError(`Civitai request timeout after ${timeoutMs}ms`),
      )
    }, timeoutMs)
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
        parseRetryAfterMs(response.headers.get('retry-after')),
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
    isRetryable: isCivitaiRetryable,
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
const CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL_PERMISSIVE = 16

// 图片级封面天花板跟三态走。模型可见性由索引的三态过滤负责（见
// civitai-lora-library.service），这里只决定"选出来的图放到哪一级"——safe 档
// 保持干净封面，其余两档露出 NSFW 封面。
export function maxImageNsfwLevelFor(nsfwFilter: LoraNsfwFilter): number {
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
    // Top-level version ids referenced by this image (checkpoint + LoRAs).
    // Present on /api/v1/images even when meta.civitaiResources is empty —
    // used to attach strong locators to name-only extras (P2).
    modelVersionIds: z.array(z.number().int().positive()).optional(),
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

function coerceSeed(value: unknown): CivitaiImageRecipe['seed'] {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : undefined
  }
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const normalized = trimmed.replace(/^0+(?=\d)/, '')
  return normalized.length <= 10 && Number(normalized) <= 4_294_967_295
    ? Number(normalized)
    : normalized
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
  | 'scheduler'
  | 'clipSkip'
  | 'sizeRaw'
  | 'baseWidth'
  | 'baseHeight'
  | 'checkpoint'
  | 'checkpointVersionId'
  | 'checkpointHash'
  | 'hiresUpscale'
  | 'hiresUpscaler'
  | 'denoisingStrength'
  | 'hiresSteps'
  | 'hiresCfgScale'
>

const RECIPE_SIZE_PATTERN = /^(\d+)\s*[x×]\s*(\d+)$/i

function extractRecipeBaseDimensions(sizeRaw?: string): {
  baseWidth?: number
  baseHeight?: number
} {
  const match = sizeRaw ? RECIPE_SIZE_PATTERN.exec(sizeRaw) : null
  if (!match) return {}
  const baseWidth = Number(match[1])
  const baseHeight = Number(match[2])
  if (!Number.isInteger(baseWidth) || !Number.isInteger(baseHeight)) return {}
  return { baseWidth, baseHeight }
}

// civitaiResources[type=checkpoint].modelVersionId — 站内生成图的精确底模引用
// （比 meta.Model 名字准、比 meta.hashes 作者本地 hash 可靠）。V3 checkpoint
// 解析优先用它精确定位，名字仅作离线图兜底。
function extractCheckpointVersionId(
  meta: Record<string, unknown>,
): number | undefined {
  const parsed = z
    .array(CivitaiResourceByVersionSchema)
    .safeParse(meta.civitaiResources)
  if (!parsed.success) return undefined
  return parsed.data.find((r) => (r.type ?? '').toLowerCase() === 'checkpoint')
    ?.modelVersionId
}

function extractRecipeMetaParams(
  meta: Record<string, unknown>,
): RecipeMetaParams {
  const dimensions = [
    coerceTrimmedString(meta.Size ?? meta.size),
    coerceTrimmedString(meta['Original Size']),
    meta.width != null && meta.height != null
      ? `${meta.width}x${meta.height}`
      : undefined,
  ].find((value) => {
    const parsed = extractRecipeBaseDimensions(value)
    return (parsed.baseWidth ?? 0) > 0 && (parsed.baseHeight ?? 0) > 0
  })
  const sizeRaw = dimensions ?? coerceTrimmedString(meta.Size ?? meta.size)
  const hashes = z.record(z.string(), z.unknown()).safeParse(meta.hashes)
  const resources = z
    .array(CivitaiImageResourceSchema)
    .safeParse(meta.resources)
  const checkpointHash = [
    meta['Model hash'],
    hashes.success ? hashes.data.model : undefined,
    resources.success
      ? resources.data.find((r) =>
          ['model', 'checkpoint'].includes((r.type ?? '').toLowerCase()),
        )?.hash
      : undefined,
  ]
    .map(coerceTrimmedString)
    .find((value) => value && /^[a-fA-F0-9]{8,64}$/.test(value))
    ?.toLowerCase()
  return {
    negativePrompt: coerceTrimmedString(meta.negativePrompt),
    seed: coerceSeed(meta.seed),
    steps: coerceInteger(meta.steps),
    cfgScale: coerceFiniteNumber(meta.cfgScale),
    sampler: coerceTrimmedString(meta.sampler ?? meta.Sampler),
    scheduler: coerceTrimmedString(
      meta.scheduler ?? meta.Scheduler ?? meta['Schedule type'],
    ),
    clipSkip: coerceInteger(meta.clipSkip ?? meta['Clip skip']),
    sizeRaw,
    ...extractRecipeBaseDimensions(sizeRaw),
    checkpoint: coerceTrimmedString(meta.Model),
    checkpointVersionId: extractCheckpointVersionId(meta),
    checkpointHash,
    hiresUpscale: coerceFiniteNumber(
      meta['Hires upscale'] ?? meta.hiresUpscale,
    ),
    hiresUpscaler: coerceTrimmedString(
      meta['Hires upscaler'] ?? meta.hiresUpscaler,
    ),
    denoisingStrength: coerceFiniteNumber(
      meta['Denoising strength'] ?? meta.denoisingStrength,
    ),
    hiresSteps: coerceInteger(meta['Hires steps'] ?? meta.hiresSteps),
    hiresCfgScale: coerceFiniteNumber(
      meta['Hires CFG Scale'] ?? meta.hiresCfgScale,
    ),
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
  /**
   * P2: top-level image `modelVersionIds` from /api/v1/images (when present).
   * Used to attach strong locators to name-only extras when civitaiResources
   * is empty (common for A1111 offline uploads).
   */
  imageModelVersionIds?: readonly number[]
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
  imageModelVersionIds,
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
  const knownTargetNames = new Set<string>(
    targetNameHints.map((hint) => hint.toLowerCase()),
  )
  if (matchedResource?.name) {
    knownTargetNames.add(repairUtf8Mojibake(matchedResource.name).toLowerCase())
  }
  let targetTag = promptTags.find((tag) =>
    isKnownTargetLoraName(tag.name, knownTargetNames),
  )
  // A model version's own gallery image with exactly one LoRA tag is, in
  // practice, that LoRA — accept it when nothing identified the tag by name.
  if (!targetTag && promptTags.length === 1) targetTag = promptTags[0]

  const loraWeight =
    matchedResource?.weight ?? matchedByVersion?.weight ?? targetTag?.weight

  // Extras carry their locator (hash / modelVersionId) whenever the meta
  // had one — that is what powers "一键补挂": hash → by-hash endpoint,
  // modelVersionId → /:id. Prompt-tag extras only have a name (cannot be
  // auto-located without name search).
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
      if (seenNames.has(key) || isKnownTargetLoraName(key, knownTargetNames)) {
        continue
      }
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
    if (isKnownTargetLoraName(key, knownTargetNames)) {
      continue
    }
    if (seenNames.has(key)) {
      const existing = extras.find((extra) => extra.name?.toLowerCase() === key)
      if (existing && existing.weight == null) existing.weight = tag.weight
      continue
    }
    seenNames.add(key)
    extras.push({ name: tag.name, weight: tag.weight })
  }

  // P2: community images often expose top-level modelVersionIds even when
  // civitaiResources is empty. Only bind when the mapping is unambiguous
  // (exactly one leftover version id ↔ exactly one name-only extra) so we
  // never attach the wrong version to a name.
  if (imageModelVersionIds && imageModelVersionIds.length > 0) {
    const leftoverIds = imageModelVersionIds.filter(
      (id) =>
        id !== targetModelVersionId &&
        !seenVersionIds.has(id) &&
        Number.isSafeInteger(id) &&
        id > 0,
    )
    const nameOnlyIndexes = extras
      .map((extra, index) =>
        extra.modelVersionId === undefined &&
        extra.hash === undefined &&
        extra.name
          ? index
          : -1,
      )
      .filter((index) => index >= 0)
    if (leftoverIds.length === 1 && nameOnlyIndexes.length === 1) {
      const extraIndex = nameOnlyIndexes[0]!
      const versionId = leftoverIds[0]!
      extras[extraIndex] = {
        ...extras[extraIndex]!,
        modelVersionId: versionId,
      }
      seenVersionIds.add(versionId)
    }
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
      isRetryable: isCivitaiRetryable,
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
   * `targetHashLower` — search-hit LoRAs carry no file hash at all.
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

async function fetchCivitaiModelPayload(
  modelId: number,
): Promise<unknown | undefined> {
  const url = new URL(`${CIVITAI_MODELS_API}/${modelId}`)
  try {
    return await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 2000,
      label: 'civitai.modelDescription',
      isRetryable: isCivitaiRetryable,
    })
  } catch (error) {
    logger.warn('Civitai model description fetch failed', {
      modelId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return undefined
  }
}

function descriptionTextFromPayload(payload: unknown): string | undefined {
  const parsed = CivitaiModelDescriptionSchema.safeParse(payload)
  if (!parsed.success) return undefined
  const text = civitaiDescriptionToText(parsed.data.description)
  return text.length > 0 ? text : undefined
}

async function fetchCivitaiModelDescriptionText(
  modelId: number,
): Promise<string | undefined> {
  const payload = await fetchCivitaiModelPayload(modelId)
  return payload === undefined ? undefined : descriptionTextFromPayload(payload)
}

/**
 * 公开封装：给 LoRA 详情面板懒加载作者描述用（方向 A）。拿不到 → descriptionText
 * null（面板据此整块不显示）。与 mineCivitaiUserPrompts 的无配方兜底同源，只是这里
 * 对**所有** LoRA 都可按需拉取，不受「有没有配方」限制。
 */
export async function getCivitaiModelDescription(
  modelId: number,
  // 各版本封面按分级限定（与列表同一条天花板）；缺省按「安全」。
  nsfwFilter: LoraNsfwFilter = 'safe',
): Promise<CivitaiModelDescriptionResult> {
  const payload = await fetchCivitaiModelPayload(modelId)
  if (payload === undefined) return { descriptionText: null, versions: [] }
  // 库 B 详情页的「版本」：同一次上游返回里每个能下载的版本映射成与列表同形的
  // 条目（触发词、底模、下载链接、文件大小齐全），切到哪个就能挂哪个 —— ⛔ 为此
  // 再打一次 Civitai。
  const parsed = CivitaiModelSchema.safeParse(payload)
  const versions = parsed.success
    ? (parsed.data.modelVersions ?? [])
        .map((version) =>
          toLibraryItem(parsed.data, maxImageNsfwLevelFor(nsfwFilter), version),
        )
        .filter((item): item is CivitaiLoraLibraryItem => item !== null)
    : []
  return {
    descriptionText: descriptionTextFromPayload(payload) ?? null,
    versions,
  }
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
      isRetryable: isCivitaiRetryable,
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
          imageModelVersionIds: item.modelVersionIds,
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
