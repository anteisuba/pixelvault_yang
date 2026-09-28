import 'server-only'

import { Buffer } from 'node:buffer'

import { z } from 'zod'

import {
  CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
  CIVITAI_LORA_BASE_MODEL_VALUES,
  CIVITAI_NAMED_BASE_MODEL_MEMBER_SET,
  CIVITAI_OTHER_BASE_MODEL_MEMBERS,
  CIVITAI_USAGE_CONTROL_DOWNLOAD,
  CIVITAI_LORA_CONTENT_TYPE_MAX_FETCH_LIMIT,
  CIVITAI_LORA_CONTENT_TYPE_OVERFETCH_BUFFER,
  CIVITAI_LORA_PAGE_SIZE,
  CIVITAI_LORA_SORT_VALUES,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  LORA_CONTENT_TYPE_EXCLUDES,
  LORA_CONTENT_TYPE_OVERRIDES,
  getLoraContentTypeDefinition,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
  type CivitaiSearchBackend,
  type LoraContentType,
  type LoraNsfwFilter,
} from '@/constants/lora'
import {
  extractActivationSegment,
  summariseActivationSegments,
} from '@/lib/civitai-image-prompt-mine'
import { buildCivitaiLoraNameSearchQueries } from '@/lib/civitai-lora-reference'
import { parseCivitaiVersionIdFromDownloadUrl } from '@/lib/civitai-lora-url'
import { CircuitOpenError, getCircuitBreaker } from '@/lib/circuit-breaker'
import {
  readCivitaiMirrorFreshness,
  searchCivitaiMirror,
} from '@/services/civitai-mirror-search.service'
import {
  buildCivitaiSnapshotKey,
  pruneCivitaiSearchSnapshots,
  readCivitaiSearchSnapshot,
  writeCivitaiSearchSnapshot,
} from '@/services/civitai-search-snapshot.service'
import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import {
  blurhashAverageColor,
  buildCivitaiItemImageUrls,
  buildCivitaiVersionDownloadUrl,
  CIVITAI_CARD_WIDTH,
  CIVITAI_COVER_WIDTH,
  CIVITAI_PREVIEW_WIDTH,
  CIVITAI_THUMB_WIDTH,
  inferLoraType,
  isStaticCivitaiImage,
  pickAutoV3Hash,
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
  CivitaiLoraLibraryResult,
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
// a private secret; keep it scoped to the read-only model search fallback.
const CIVITAI_MODEL_SEARCH_PUBLIC_KEY =
  '8c46eb2508e21db1e9828a97968d91ab1ca1caa5f70a00e88a2ba1e286603b61'
const CIVITAI_REQUEST_TIMEOUT_MS = 8000

// 搜索路径的两级超时。meilisearch 健康时实测 0.55–1.1s（2026-08-19 curl 对
// 照），所以 5s 已经是"上游明显不健康"的信号，早失败早交给断路器。但同一天
// 的过载事故里它返回在 7.99s——只是慢，不是死；单一 8s 闸把这种"慢但会成
// 功"直接判死，然后跳进同失败域的 REST 回落再赔上 13 秒。所以第一发快速失
// 败，再给一发更长预算，只有两发都不回来才认定上游搜索不可用。
const CIVITAI_SEARCH_TIMEOUT_FAST_MS = 5000
const CIVITAI_SEARCH_TIMEOUT_PATIENT_MS = 10_000

// 搜索路径的断路器。2026-08-19 事故里 Civitai 对 `query=` 请求主动 load
// shedding（503 + Retry-After: 2，body 明写 "Model search is temporarily
// overloaded"），而同一时刻不带 query 的浏览路径全程 200——挂的是搜索子系
// 统，不是整个 Civitai。所以断路器只罩搜索，浏览不受牵连。
const CIVITAI_SEARCH_BREAKER = 'civitai.search'
const CIVITAI_SEARCH_BREAKER_FAILURE_THRESHOLD = 3
const CIVITAI_SEARCH_BREAKER_RESET_MS = 30_000

// Civitai 上游把「没有值」写成 null，而不是省略字段。z.number()/z.string()
// 拒 null，而 .passthrough() 只放行未声明的字段、不放宽已声明字段的类型
// ——于是一页 36 条命中里有 1 条 null 就让整份响应 parse 抛错，内容类型筛
// 选路径（listCivitaiLorasByContentType，故意没有 REST 回落）把整页打成
// 502「Civitai LoRA 库加载失败」，搜索路径则悄悄回落 REST、丢掉真排序。
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
// 一条命中的一个字段而 parse 抛错，就是 owner 报的「类型筛选整页报 Civitai
// LoRA 库加载失败」（那条路径没有 REST 回落）。这里按条校验：解析不过的条
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

// NSFW 三态分档过滤，下推到 meilisearch 的源头过滤（不在取回来的一页上再
// 删——那样一页 12 条会缩成 6 条，数量也就不准了）。`nsfwLevel` 是按模型的
// 数组（每张图一个分级，例如 `[1,4]`），meilisearch 的数组过滤是「存在」
// 语义——`nsfwLevel > N` 只要有一张超过 N 就命中。
//
// 「安全」= 至少有一张不超过 N 的样例（`nsfwLevel <= N`），卡片与详情只放
// 这些安全的图（maxImageNsfwLevelFor）。2026-09-27 owner 拍板放宽：原来的
// `NOT nsfwLevel > N`（一张都不许超过）把大半结果藏掉了——实测 roccia 12 →
// 4、wuthering waves 1065 → 238、Enchanting Eyes 6 → 0。代价是封面安全、
// 内容偏露骨的 LoRA 也会列出来，owner 知情接受；于是「安全」与「仅 NSFW」
// 不再互斥（同一个模型两档都能看到，各自只放对应的图）。
//
// 天花板 2（None + Soft）与 `CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL`
// 同源。Civitai 自己的 `nsfw` 布尔两个方向都误判过，而且 meilisearch 不许
// 按它过滤（"Attribute `nsfw` is not filterable"，实测 400）——所以只看图
// 的分级数组。
function appendNsfwSearchFilter(
  filters: string[],
  nsfwFilter: LoraNsfwFilter,
): void {
  if (nsfwFilter === 'safe') {
    filters.push(`nsfwLevel <= ${CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL}`)
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
   *  的注释——同属 NSFW 三态分档过滤这条线）。 */
  nsfwFilter?: LoraNsfwFilter
  /**
   * 一次搜索会话内锁定分页范式：调用方（搜索
   * 分页 hook）在同一次搜索会话内锁定的后端选择——首页决定 meilisearch 还
   * 是 REST 后，后续页把这里传回来，让服务端跳过另一条路径，不再中途切
   * 换分页范式（meilisearch=offset，REST 回落=cursor scan，混用会导致翻
   * 页重复/错位）。仅在 `search` 非空时生效；不传 = 自由选择（当前会话
   * 首页的行为）。
   */
  source?: CivitaiSearchBackend
  /**
   * S2 内容类型筛选（docs/references/pages/lora-workbench.md §3）。非
   * 'all' 时整个请求路由到 `listCivitaiLorasByContentType`——始终走
   * meilisearch（REST `tag=` 只支持单值、表达不了多 tag 的 OR，且 REST
   * 完全没有名称关键词兜底路径），绕开下面的 REST 浏览分支。
   */
  contentType?: LoraContentType
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

// REST 回落路径上 appendNsfwSearchFilter 的对应物：REST 没有能下推的按图
// 分级过滤，只能扫这个版本自己的（未按天花板筛过的）images。两条都是
// 「存在」语义——`nsfwOnly` 看有没有一张超过天花板，`safe` 看有没有一张不
// 超过（2026-09-27 owner：有安全样例就列出，只放安全的图）——同一份数据
// 走哪条路结果一致。刻意不复用 pickShownImages 的输出：那份已经按天花板
// 筛过了。
function versionHasNsfwLevelAbove(
  version: { images?: { nsfwLevel?: number }[] },
  ceiling: number,
): boolean {
  return (
    version.images?.some((image) => (image.nsfwLevel ?? 1) > ceiling) ?? false
  )
}

function versionHasImageAtOrBelow(
  version: { images?: { nsfwLevel?: number }[] },
  ceiling: number,
): boolean {
  return (
    version.images?.some((image) => (image.nsfwLevel ?? 1) <= ceiling) ?? false
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

// 排序映射对齐 Civitai 官网搜索（github.com/civitai/civitai
// `ModelSearchIndexSortBy`，2026-08-29 复核）：
//   推荐 / 默认 = 不传 sort = meilisearch 相关性；
//   最多下载 = `metrics.downloadCount`。⚠ 不是 `sortMetrics.downloadCount`：
//     那是 Creator Controls 预留的 sort-only 字段（作者隐藏下载数时文档里
//     保留真值），但它**从未在 live 索引上声明成 sortable**（官网 parser
//     注释：要先做一次 models index reset，还没做），拿它排序恒 400
//     invalid_search_sort——2026-08-26 引入时抄的是 search-index 侧的意图
//     值，没实测，「最多下载」自那天起每次都静默降级。作者隐藏下载数时
//     `metrics.downloadCount` 为 null → desc 排序沉底，这是上游 sortable
//     白名单内唯一的下载数字段，官网自己也停在它上面。
//   最新 = `createdAt:desc`。
// ⚠ 改任何 sort 字段前先对 live 端点实测（非法字段的 400 报错会自报完整
// sortable 白名单）——官网源码只是意图，不是 live 索引的现状。测试
// 「meilisearch sort 字段都在上游实测的 sortable 白名单里」锁着这份清单。
const CIVITAI_SEARCH_SORT_MAP: Record<CivitaiLoraSort, string[] | undefined> = {
  'Highest Rated': undefined,
  'Most Downloaded': ['metrics.downloadCount:desc'],
  Newest: ['createdAt:desc'],
}

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
 * 这个错误说明「Civitai 的搜索子系统整体不健康」——超时、5xx、主动卸载、
 * 断路器已开。区分它的意义在回落决策：meilisearch 和 REST `query=` 是同一
 * 个搜索子系统的两张脸（2026-08-19 实测：REST `query=` 全部 503，同一时刻
 * 不带 query 的浏览路径全程 200），所以上游降级时回落 REST 只是把失败重演
 * 一遍再赔上十几秒。只有 meilisearch 这个非正式端点本身坏了（4xx、公钥轮
 * 换、响应形状变了）才值得回落——那才是当初设计回落的本意。
 */
// 在模块加载时就把实例建出来，而不是首次用到时懒建。getCircuitBreaker 只在
// 创建那一次读 options，之后按名字返回缓存实例——懒建意味着"谁先按这个名字
// 要，谁的配置说了算"，任何一个不带 options 的调用方（包括测试的 reset）都
// 会静默把阈值退回默认值。在这里定死就没有这个先后顺序问题。
const civitaiSearchBreaker = getCircuitBreaker(CIVITAI_SEARCH_BREAKER, {
  failureThreshold: CIVITAI_SEARCH_BREAKER_FAILURE_THRESHOLD,
  resetTimeoutMs: CIVITAI_SEARCH_BREAKER_RESET_MS,
})

function isUpstreamSearchDegraded(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return true
  if (error instanceof CivitaiFetchError) {
    if (error.status === undefined) return true
    return error.status >= 500 || error.status === 429
  }
  return false
}

function hitToLibraryItem(
  hit: z.infer<typeof CivitaiSearchHitSchema>,
  maxImageNsfwLevel: number,
): CivitaiLoraLibraryItem | null {
  if (hit.type && hit.type.toUpperCase() !== 'LORA') return null
  // hit.version = civitai 挑的"这次命中要展示的版本"；versions[0] 兜底
  // 未必所有 hit 都带 version 字段。
  const version = hit.version ?? hit.versions?.[0]
  if (!version) return null

  const loraUrl = buildCivitaiVersionDownloadUrl(version.id)

  const tags = (hit.tags ?? []).map((tag) => tag.name)
  const {
    coverImageUrlOriginal: coverOriginal,
    coverImageUrl,
    thumbImageUrl,
    cardImageUrl,
    previewImageUrls,
    coverColor,
  } = buildCivitaiItemImageUrls(hit.images ?? [], maxImageNsfwLevel)
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
    // 2026-08-19 实测 50/50：AutoV3 在版本对象的 hashData 里（不在
    // files[].hashes 上，那是之前找错了地方）。补上之后挂载栈的哈希匹配
    // 对搜索结果里的条目不再退化成 no-op。
    fileHashAutoV3: pickAutoV3Hash(version.hashData),
    // ⚠ 搜索路径拿不到文件大小 —— 2026-08-21 实测 meilisearch 的版本对象**根本
    // 没有 `files` 字段**（有 hashes / hashData / metrics / settings，就是没有
    // 文件清单）。所以这里恒 null，不是「忘了接」：推荐卡上这一栏对搜索来的
    // 条目就是「未知」，⛔ 别为了填满它给每条候选补一次 REST 详情请求。
    fileSizeBytes: null,
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
    coverColor,
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
    allowNoCredit: hit.permissions?.allowNoCredit ?? true,
    isNsfw: hit.nsfw ?? false,
  }
}

// 分批并发的节流机制随二段解析一起退役了——hitToLibraryItem 现在是纯本地
// 映射，没有任何上游请求要限流。
function hitsToLibraryItems(
  hits: readonly z.infer<typeof CivitaiSearchHitSchema>[],
  maxImageNsfwLevel: number,
): CivitaiLoraLibraryItem[] {
  const resolved = hits
    .map((hit) => hitToLibraryItem(hit, maxImageNsfwLevel))
    .filter((item): item is CivitaiLoraLibraryItem => item !== null)
  return dedupeLibraryItems(resolved)
}

// ── 库列表：搜索与浏览同一条 meilisearch 路（2026-09-27 LoRA 库 B）────────
//
// owner 09-27 定的几件事落在这里：最匹配的排最前、推荐档混进热度、给准数；
// 「安全」放宽成「有安全样例就列出」在 appendNsfwSearchFilter。
//
// 一次 multi-search 拿全，不多一趟往返：
//   [0] 所有词都对上的精确总数（matchingStrategy 'all'；page + hitsPerPage 0
//       回的是 totalHits，不是 offset/limit 那种估算值）
//   [1] 第一档这一页（'all'，按所选排序；推荐档另取前 60 条混热度重排）
//   [2] 至少对上第一个词的精确总数（'last'）——也就是整条列表的总数
//   [3] 第二档这一页（'last'，相关性序）
// 2026-09-27 实测 4 个多词查询：'last' 相关性序的前 |第一档| 条恰好就是第一
// 档（words 规则排第一），所以合并列表第 m 位（m ≥ |第一档|）就是 'last'
// 相关性序的第 m 位——[3] 用同一个 offset 就能取到，第二档天然按对上几个词
// 往后排。浏览（没有搜索词）只有一档，只发 [0] 与 [1]。界面上是一条列表，
// 不分段（owner 09-27）。
//
// ⚠ 带 sort 时上游把 sort 排在 words 前面（showRankingScoreDetails 实测
// order 0），所以第一档必须用 'all' 单独取——直接对 'last' 排序会让只对上
// 一个词、下载更多的条目压到真正要找的那个前面（「鸣潮 洛可可」选最多下
// 载，前 5 全是别的鸣潮角色）。
const CIVITAI_SEARCH_BLEND_WINDOW = 60
const CIVITAI_SEARCH_BLEND_HEAT_WEIGHT = 0.15

type CivitaiSearchHit = z.infer<typeof CivitaiSearchHitSchema>

/**
 * 推荐档：相关性为主、热度为辅。热度 = 下载数取对数、按这一窗里最大值归一
 * 到 0–1，乘 0.15 加到相关性分上——只在相关性差不到一截的几条之间让下载多
 * 的往前挪，不会把对得差的顶上来。
 */
function blendRelevanceWithHeat(
  hits: readonly CivitaiSearchHit[],
): CivitaiSearchHit[] {
  const downloads = hits.map(
    (hit) =>
      hit.version?.metrics?.downloadCount ?? hit.metrics?.downloadCount ?? 0,
  )
  const heatScale = Math.log10(Math.max(0, ...downloads) + 1) || 1
  return hits
    .map((hit, index) => ({
      hit,
      index,
      score:
        (hit._rankingScore ?? 0) +
        (CIVITAI_SEARCH_BLEND_HEAT_WEIGHT * Math.log10(downloads[index] + 1)) /
          heatScale,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.hit)
}

async function listCivitaiLorasViaMeilisearch({
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
  const filters = buildCivitaiSearchFilters(
    baseModel === 'all' ? null : baseModel,
  )
  appendNsfwSearchFilter(filters, nsfwFilter)

  const start = (page - 1) * pageSize
  const sortFields = CIVITAI_SEARCH_SORT_MAP[sort]
  // 浏览没有相关性可言（全是 1.0），推荐档照上游的点赞序，不混热度。
  const blend =
    Boolean(search) && !sortFields && start < CIVITAI_SEARCH_BLEND_WINDOW
  const base = {
    indexUid: CIVITAI_MODEL_SEARCH_INDEX,
    q: search,
    filter: filters,
  }
  const queries: Record<string, unknown>[] = [
    { ...base, matchingStrategy: 'all', page: 1, hitsPerPage: 0 },
    {
      ...base,
      matchingStrategy: 'all',
      ...(blend
        ? {
            offset: 0,
            limit: Math.max(CIVITAI_SEARCH_BLEND_WINDOW, start + pageSize),
            showRankingScore: true,
          }
        : { offset: start, limit: pageSize }),
      ...(sortFields ? { sort: sortFields } : {}),
    },
  ]
  if (search) {
    queries.push(
      { ...base, matchingStrategy: 'last', page: 1, hitsPerPage: 0 },
      { ...base, matchingStrategy: 'last', offset: start, limit: pageSize },
    )
  }

  const payload = await fetchCivitaiSearchPayload(queries, 'civitai.listLoras')
  // 解析失败/形状异常直接抛出——调用方按降级链处理，不在这里吞掉错误（吞
  // 了就分不清「真的没结果」和「端点坏了」）。
  const parsed = CivitaiModelSearchResponseSchema.parse(payload)
  const [firstCount, firstWindow, wholeCount, wholeWindow] = parsed.results
  const firstTierTotal = firstCount?.totalHits
  const total = search ? wholeCount?.totalHits : firstTierTotal
  if (firstTierTotal === undefined || total === undefined) {
    throw new Error('Civitai search response is missing totalHits')
  }

  let firstTierHits = firstWindow?.hits ?? []
  if (blend) {
    firstTierHits = [
      ...blendRelevanceWithHeat(
        firstTierHits.slice(0, CIVITAI_SEARCH_BLEND_WINDOW),
      ),
      ...firstTierHits.slice(CIVITAI_SEARCH_BLEND_WINDOW),
    ].slice(start, start + pageSize)
  }
  // 这一页落进第二档的那几位：同一个 offset 的 'last' 窗口里，跳过还属于
  // 第一档的前半截。
  const secondTierHits = search
    ? (wholeWindow?.hits ?? []).slice(Math.max(0, firstTierTotal - start))
    : []
  const items = hitsToLibraryItems(
    [...firstTierHits, ...secondTierHits].slice(0, pageSize),
    maxImageNsfwLevelFor(nsfwFilter),
  )

  return {
    items,
    page,
    pageSize,
    total,
    hasNextPage: start + pageSize < total,
    nextCursor: null,
    offsetPaginationSupported: true,
  }
}

function buildTagsInFilter(tags: readonly string[]): string {
  const quoted = tags.map((tag) => JSON.stringify(tag)).join(', ')
  return `tags.name IN [${quoted}]`
}

// 合并两个独立分页窗口（L1 tag 命中 ∪ L2 关键词命中）后，各自的 meilisearch
// 内部排序已不再是"整体排过序"的——重新按请求的 sort 字段排一遍，跟单
// query 路径（listCivitaiLorasViaMeilisearch）在同一 sort 值下产出一致的顺序。
// 'Highest Rated'（相关性）没有暴露给客户端的数值分数，保留合并顺序
// （L1 命中排在 L2 前面，各自内部仍是 meilisearch 相关性序）。
function sortMergedSearchHits(
  hits: readonly z.infer<typeof CivitaiSearchHitSchema>[],
  sort: CivitaiLoraSort,
): z.infer<typeof CivitaiSearchHitSchema>[] {
  if (sort === 'Most Downloaded') {
    // S3 实测发现的回归修复：必须和 hitToLibraryItem 的展示值同一套优先级
    // （version.metrics 优先、hit.metrics 兜底）——meilisearch 命中的顶层
    // hit.metrics 在生产环境经常缺失/陈旧，只读它排出来的序和卡片上实际
    // 显示的下载数对不上（真机验证：`type=clothing&sort=Most+Downloaded`
    // 返回 45846/7931/39045/32605/278/19020… 完全不是降序）。
    return [...hits].sort(
      (a, b) =>
        (b.version?.metrics?.downloadCount ?? b.metrics?.downloadCount ?? 0) -
        (a.version?.metrics?.downloadCount ?? a.metrics?.downloadCount ?? 0),
    )
  }
  if (sort === 'Newest') {
    return [...hits].sort((a, b) => {
      const aTime = Date.parse(a.version?.createdAt ?? a.createdAt ?? '') || 0
      const bTime = Date.parse(b.version?.createdAt ?? b.createdAt ?? '') || 0
      return bTime - aTime
    })
  }
  return [...hits]
}

// L3 include 解析：override 表把某个 modelId 显式判给一个内容类型，即使
// L1 tag / L2 关键词都没命中它。走 REST 单模型端点（不是 hitToLibraryItem
// 那条 search-hit 路径）——override 条目稀少，不值得为它们再拼一次
// multi-search query。
async function resolveCivitaiLoraLibraryItemByModelId(
  modelId: number,
  maxImageNsfwLevel: number,
): Promise<CivitaiLoraLibraryItem | null> {
  const url = new URL(`${CIVITAI_MODELS_API}/${modelId}`)
  let payload: unknown
  try {
    payload = await withRetry(() => fetchCivitaiPayload(url), {
      maxAttempts: 2,
      baseDelayMs: 400,
      maxDelayMs: 1500,
      label: 'civitai.resolveContentTypeOverride',
      isRetryable: isCivitaiRetryable,
    })
  } catch (error) {
    logger.warn('Civitai content-type override model resolve failed', {
      modelId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return null
  }
  const parsed = CivitaiModelSchema.safeParse(payload)
  if (!parsed.success) return null
  return toLibraryItem(parsed.data, maxImageNsfwLevel)
}

/**
 * S2 内容类型筛选（docs/references/pages/lora-workbench.md §3.2，三重
 * 兜底，服务端合并，客户端只见统一列表）：
 *
 *   L1 tag 下推：meilisearch `tags.name IN (civitaiTags)`——精确但覆盖不全。
 *   L2 名称词表：`nameKeywords` 下推进 meilisearch 第二个 query 的 `q`
 *     （全文，覆盖 name/tags/description，typo-tolerant）。工程选型：没有
 *     走"对已抓取页做客户端子串过滤"，因为那需要额外的宽口径 over-fetch，
 *     与简报 §0 明确排除的"over-fetch 根治"方向冲突；q= 下推复用同一次
 *     HTTP round trip（multi-search 原生支持 queries 数组，实测 2026-07-17
 *     一次 POST 可带多个独立 query 且各自返回独立 hits），零额外往返。
 *     meilisearch 的 typo-tolerant 全文匹配是"名称/描述子串匹配"的合理
 *     超集——宁可稍宽，多余命中交给 L3 exclude 兜底纠错。
 *   L3 override：优先级最高。`LORA_CONTENT_TYPE_EXCLUDES` 剔除 L1/L2 误
 *     报，`LORA_CONTENT_TYPE_OVERRIDES` 补 L1/L2 都漏的热门模型（首发空
 *     表，机制先立起来）。
 *
 * 已知限制（对齐简报 §0"不做 over-fetch 根治"的范围）：L1/L2 各自独立按
 * offset/limit 分页，合并去重后重排再裁到 pageSize——两个独立分页窗口的
 * 并集不是精确分页，`total` 因此如实报 null（未知）而不是编造一个数字。
 * 失败没有 REST 回落（REST `tag=` 不支持多值 OR、也没有名称关键词兜底路
 * 径）：meilisearch 请求失败直接向上抛错，交给路由层 502——失败大声暴露
 * 好过悄悄丢弃用户选中的类型筛选。
 */
async function listCivitaiLorasByContentType({
  page,
  pageSize,
  search,
  baseModel,
  sort,
  nsfwFilter,
  contentType,
}: {
  page: number
  pageSize: number
  search: string
  baseModel: CivitaiLoraBaseModel
  sort: CivitaiLoraSort
  nsfwFilter: LoraNsfwFilter
  contentType: Exclude<LoraContentType, 'all'>
}): Promise<CivitaiLoraLibraryResult> {
  const definition = getLoraContentTypeDefinition(contentType)
  const windowStart = (page - 1) * pageSize
  const windowEnd = page * pageSize
  // 每条子 query 都从 0 重新扫到「当前页末尾 + 缓冲」——不是增量分页，是
  // 每次都重新裁一个更大的前缀窗口。这样合并去重后再切片才能保证跨页无
  // 跳漏（旧版各自独立的 offset 窗口一旦 L1/L2 有重叠，去重会让当页缺量，
  // 见上方常量注释）。MAX_FETCH_LIMIT 兜底极端深页。
  const fetchLimit = Math.min(
    windowEnd + CIVITAI_LORA_CONTENT_TYPE_OVERFETCH_BUFFER,
    CIVITAI_LORA_CONTENT_TYPE_MAX_FETCH_LIMIT,
  )
  const baseFilters = buildCivitaiSearchFilters(
    baseModel === 'all' ? null : baseModel,
  )
  appendNsfwSearchFilter(baseFilters, nsfwFilter)

  interface MultiSearchQuery {
    indexUid: string
    q: string
    limit: number
    offset: number
    filter: string[]
    sort: string[] | undefined
  }
  const queries: MultiSearchQuery[] = []

  if (definition.civitaiTags.length > 0) {
    queries.push({
      indexUid: CIVITAI_MODEL_SEARCH_INDEX,
      q: search,
      limit: fetchLimit,
      offset: 0,
      filter: [...baseFilters, buildTagsInFilter(definition.civitaiTags)],
      sort: CIVITAI_SEARCH_SORT_MAP[sort],
    })
  }

  const l2QueryText = [search, ...definition.nameKeywords]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
  if (l2QueryText) {
    queries.push({
      indexUid: CIVITAI_MODEL_SEARCH_INDEX,
      q: l2QueryText,
      limit: fetchLimit,
      offset: 0,
      filter: baseFilters,
      sort: CIVITAI_SEARCH_SORT_MAP[sort],
    })
  }

  if (queries.length === 0) {
    // 表里的类型定义应至少有 civitaiTags 或 nameKeywords 之一——真到这里
    // 说明定义本身是空的（配置错误），如实返回空页而不是抛错砸整个库。
    return {
      items: [],
      page,
      pageSize,
      total: 0,
      hasNextPage: false,
      nextCursor: null,
      offsetPaginationSupported: true,
    }
  }

  // 精确总数跟着同一次请求走：|L1 ∪ L2| = |L1| + |L2| − |L1 ∩ L2|，交集就是
  // 「L2 的词 + L1 的标签」一起下推的那条。2026-09-27 实测（服装 × Illustrious
  // × 安全，搜 roccia / wuthering waves）公式与取回全部 id 后的真实并集一致。
  // ⚠ L3 的 override / exclude 表今天是空的；往里加条目时这个数要跟着算进去。
  const tagsFilter =
    definition.civitaiTags.length > 0
      ? buildTagsInFilter(definition.civitaiTags)
      : null
  const countQueries: Record<string, unknown>[] = []
  if (tagsFilter) {
    countQueries.push({
      indexUid: CIVITAI_MODEL_SEARCH_INDEX,
      q: search,
      filter: [...baseFilters, tagsFilter],
      page: 1,
      hitsPerPage: 0,
    })
  }
  if (l2QueryText) {
    countQueries.push({
      indexUid: CIVITAI_MODEL_SEARCH_INDEX,
      q: l2QueryText,
      filter: baseFilters,
      page: 1,
      hitsPerPage: 0,
    })
  }
  if (tagsFilter && l2QueryText) {
    countQueries.push({
      indexUid: CIVITAI_MODEL_SEARCH_INDEX,
      q: l2QueryText,
      filter: [...baseFilters, tagsFilter],
      page: 1,
      hitsPerPage: 0,
    })
  }

  const payload = await fetchCivitaiSearchPayload(
    [...queries, ...countQueries],
    'civitai.searchLorasByContentType',
  )

  // 与 listCivitaiLorasViaMeilisearch 同一套契约：解析失败直接抛出，不静默吞掉。
  const parsed = CivitaiModelSearchResponseSchema.parse(payload)
  const windowResults = parsed.results.slice(0, queries.length)
  const counts = parsed.results
    .slice(queries.length)
    .map((result) => result.totalHits)
  const total =
    counts.length === 0 || counts.some((count) => count === undefined)
      ? null
      : counts.length === 3
        ? (counts[0] ?? 0) + (counts[1] ?? 0) - (counts[2] ?? 0)
        : (counts[0] ?? 0)

  const excludedForType = new Set(
    Object.entries(LORA_CONTENT_TYPE_EXCLUDES)
      .filter(([, excludedType]) => excludedType === contentType)
      .map(([modelId]) => Number(modelId)),
  )

  const mergedById = new Map<number, z.infer<typeof CivitaiSearchHitSchema>>()
  for (const result of windowResults) {
    for (const hit of result.hits ?? []) {
      if (excludedForType.has(hit.id)) continue
      if (!mergedById.has(hit.id)) mergedById.set(hit.id, hit)
    }
  }

  // 全局重排后再按页切片（不是 slice(0, pageSize)）——两条子 query 这次都
  // 是从 0 扫到 fetchLimit 的同一份前缀窗口，切 [windowStart, windowEnd)
  // 才能拿到「这一页」应有的条目，避免旧版每页各自独立小窗口去重后缺量。
  const sortedHits = sortMergedSearchHits([...mergedById.values()], sort)
  const pageHits = sortedHits.slice(windowStart, windowEnd)
  const items = hitsToLibraryItems(pageHits, maxImageNsfwLevelFor(nsfwFilter))

  // L3 include：override 表里映射到当前类型、且这一页 L1/L2 都没捞到的
  // 模型——首发允许空表（机制先立起来），只在表非空且这页还没填满时才
  // 发起额外解析请求。
  const includeModelIds = Object.entries(LORA_CONTENT_TYPE_OVERRIDES)
    .filter(([, overriddenType]) => overriddenType === contentType)
    .map(([modelId]) => Number(modelId))
    .filter((modelId) => !mergedById.has(modelId))

  if (includeModelIds.length > 0 && items.length < pageSize) {
    const resolvedOverrides = await Promise.all(
      includeModelIds
        .slice(0, pageSize - items.length)
        .map((modelId) =>
          resolveCivitaiLoraLibraryItemByModelId(
            modelId,
            maxImageNsfwLevelFor(nsfwFilter),
          ),
        ),
    )
    for (const overrideItem of resolvedOverrides) {
      if (overrideItem) items.push(overrideItem)
    }
  }

  // 有精确总数就按它判还有没有下一页；数缺席（上游没回 totalHits）时退回
  // 两个信号：合并集已经超出这一页的窗口末尾，或某条子 query 的供给比这
  // 次扫到的还多（命中 MAX_FETCH_LIMIT 兜底或缓冲不够宽）。
  const hasNextPage =
    total !== null
      ? windowEnd < total
      : sortedHits.length > windowEnd ||
        windowResults.some(
          (result) =>
            result.estimatedTotalHits !== undefined &&
            result.estimatedTotalHits > fetchLimit,
        )

  return {
    items,
    page,
    pageSize,
    total,
    hasNextPage,
    nextCursor: null,
    // Bug 修复（下一页不可点的真根因）：这条路径恒走 meilisearch 按页码
    // offset 分页（never 靠 cursor），client 侧可以直接翻页请求下一页，见
    // CivitaiLoraLibraryResultSchema.offsetPaginationSupported 的注释。
    offsetPaginationSupported: true,
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
 * 请求内重试，直接交给断路器快速失败。
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
  // P1-6 三态。这条 REST 路现在只在 meilisearch 端点本身坏了（4xx、公钥轮
  // 换）或浏览时上游搜索过载才走，语义跟 appendNsfwSearchFilter 对齐：
  //   'safe'     留「至少有一张图不超过安全天花板」的条目，卡片只放那些图
  //              （2026-09-27 owner：有安全样例就列出）。
  //   'nsfwOnly' 留「civitai 的 model.nsfw 标记为真」*或*「任意一张图超出
  //              安全天花板」的条目——两个信号单独都不可靠（实测双向误判），
  //              REST 又没有能下推的按图分级过滤，OR 起来缩小漏判面。
  //   'unrestricted' 不做客户端过滤。
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
    isRetryable: isCivitaiRetryable,
  })
  const parsed = CivitaiModelsResponseSchema.parse(payload)
  const imageNsfwCeiling = maxImageNsfwLevelFor(nsfwFilter)
  const mappedItems = parsed.items
    .map((model) => {
      const item = toLibraryItem(model, imageNsfwCeiling)
      if (!item) return null
      // 扫版本自己的原始 images（未按天花板筛过）——toLibraryItem 里挑出来的
      // 那几张已经按天花板筛过，拿它判断在 'safe' 档下恒为「安全」。
      const version = pickUsableModelVersion(model)
      const hasNsfwLevelAboveSafeCeiling = version
        ? versionHasNsfwLevelAbove(
            version,
            CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
          )
        : false
      const hasSafeImage = version
        ? versionHasImageAtOrBelow(
            version,
            CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
          )
        : false
      return { item, hasNsfwLevelAboveSafeCeiling, hasSafeImage }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  const filteredItems =
    nsfwFilter === 'safe'
      ? mappedItems
          .filter((entry) => entry.hasSafeImage)
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

function fallbackHasHits(
  result: CivitaiLoraLibraryResult | null | undefined,
): result is CivitaiLoraLibraryResult {
  return Boolean(result && result.items.length > 0)
}

function markCivitaiSearchStale(
  result: CivitaiLoraLibraryResult,
  fetchedAt: Date,
): CivitaiLoraLibraryResult {
  return {
    ...result,
    stale: true,
    fetchedAt: fetchedAt.toISOString(),
  }
}

/**
 * L1 搜索失败后的回落。官方契约（developer.civitai.com/site/guide/pagination，
 * 2026-08-24 核）：`query` 必须走 cursor，`page`+`query` 是 400。我们 L1 用的
 * 非正式 meilisearch 是 offset 页码，本地镜像也是 offset 页码——两套页码指的
 * 不是同一份语料。把 live meilisearch 的第 6 页拿去问只有 41 条的镜像，就会
 * 端出「没有找到匹配的 LoRA」配上「第 6 页 · 41 个 LoRA」。
 *
 * 所以：请求页在回落语料里是空的、但这个词其实有命中时，回到回落第 1 页。
 * 已经在回落里翻页（第 2 页还有条目）则照常返回，不误重置。
 */
async function resolveDegradedCivitaiSearch({
  input,
  snapshotKey,
  error,
}: {
  input: ListCivitaiLorasInput
  snapshotKey: string
  error: unknown
}): Promise<CivitaiLoraLibraryResult> {
  const message = error instanceof Error ? error.message : 'Unknown'
  const requestedPage = input.page ?? 1
  const pageSize = input.pageSize ?? CIVITAI_LORA_PAGE_SIZE
  const normalizedSearch = input.search?.trim() ?? ''
  const contentType = input.contentType ?? DEFAULT_LORA_CONTENT_TYPE
  const baseModel = input.baseModel ?? 'all'
  const sort = input.sort ?? 'Highest Rated'
  const nsfwFilter = input.nsfwFilter ?? DEFAULT_LORA_NSFW_FILTER

  const queryMirror = (page: number) =>
    searchCivitaiMirror({
      page,
      pageSize,
      search: normalizedSearch,
      baseModel,
      acceptedBaseModelNames: acceptedBaseModelNames(
        baseModel === 'all' ? null : baseModel,
      ),
      sort,
      nsfwFilter,
      contentType,
      maxImageNsfwLevel: maxImageNsfwLevelFor(nsfwFilter),
    })

  const exactSnapshot = await readCivitaiSearchSnapshot(snapshotKey)
  if (exactSnapshot && fallbackHasHits(exactSnapshot.payload)) {
    logger.warn(
      'Civitai search unavailable — serving the last successful snapshot',
      {
        error: message,
        search: normalizedSearch,
        contentType,
        snapshotAgeMs: Date.now() - exactSnapshot.fetchedAt.getTime(),
      },
    )
    return markCivitaiSearchStale(
      exactSnapshot.payload,
      exactSnapshot.fetchedAt,
    )
  }

  const mirrored = await queryMirror(requestedPage)
  // 有命中就用这一页；第 1 页空结果也返回（「这个词本地确实没有」），
  // 不要 502。深页空结果不能在这里返回——页码可能来自另一套语料，
  // 交给下面钳回第 1 页。
  if (mirrored && (fallbackHasHits(mirrored) || requestedPage === 1)) {
    const syncedAt = (await readCivitaiMirrorFreshness()) ?? new Date()
    logger.warn(
      'Civitai search unavailable and no snapshot — serving the local mirror',
      { error: message, search: normalizedSearch, total: mirrored.total },
    )
    return markCivitaiSearchStale(mirrored, syncedAt)
  }

  if (requestedPage > 1) {
    const page1Key = buildCivitaiSnapshotKey({
      page: 1,
      pageSize,
      cursor: null,
      search: normalizedSearch,
      baseModel,
      sort,
      nsfwFilter,
      contentType,
    })
    const page1Snapshot = await readCivitaiSearchSnapshot(page1Key)
    if (page1Snapshot && fallbackHasHits(page1Snapshot.payload)) {
      logger.warn(
        'Civitai search unavailable — deep page empty in fallback, serving page 1 snapshot',
        { error: message, search: normalizedSearch, requestedPage },
      )
      return markCivitaiSearchStale(
        { ...page1Snapshot.payload, page: 1 },
        page1Snapshot.fetchedAt,
      )
    }

    const page1Mirror = await queryMirror(1)
    if (page1Mirror && fallbackHasHits(page1Mirror)) {
      const syncedAt = (await readCivitaiMirrorFreshness()) ?? new Date()
      logger.warn(
        'Civitai search unavailable — deep page empty in fallback, serving page 1 of the local mirror',
        {
          error: message,
          search: normalizedSearch,
          requestedPage,
          total: page1Mirror.total,
        },
      )
      return markCivitaiSearchStale({ ...page1Mirror, page: 1 }, syncedAt)
    }
  }

  if (exactSnapshot) {
    logger.warn(
      'Civitai search unavailable — serving the last successful snapshot',
      {
        error: message,
        search: normalizedSearch,
        contentType,
        snapshotAgeMs: Date.now() - exactSnapshot.fetchedAt.getTime(),
      },
    )
    return markCivitaiSearchStale(
      exactSnapshot.payload,
      exactSnapshot.fetchedAt,
    )
  }

  throw error
}

export interface ListCivitaiLorasOptions {
  /**
   * 把不必挡住响应的活挂到响应之后跑——路由传 next/server 的 `after`。不传 =
   * 就地 await（定时预热、测试、助手检索这些没有响应要赶的调用方）。
   * 只有传了它，「上游慢就先给上一次的结果」才会启用：先出快照的前提是有地
   * 方接着把上游跑完、刷新快照，否则那一趟白跑、快照也永远旧着。
   */
  defer?: (task: () => Promise<void>) => void
  /** 路由写 Server-Timing 用：上游那一趟在响应前跑完时花了多久。 */
  timing?: { upstreamMs?: number }
}

/** 上游这么久还没回、手上又有这一组的快照，就先把快照给出去（owner 09-27：搜索慢）。 */
const CIVITAI_SEARCH_SNAPSHOT_RACE_MS = 1500

type CivitaiUpstreamOutcome =
  | { kind: 'done'; result: CivitaiLoraLibraryResult }
  | { kind: 'failed'; error: unknown }
  | { kind: 'slow' }

export async function listCivitaiLoras(
  input: ListCivitaiLorasInput = {},
  options: ListCivitaiLorasOptions = {},
): Promise<CivitaiLoraLibraryResult> {
  const snapshotKey = buildCivitaiSnapshotKey({
    page: input.page ?? 1,
    pageSize: input.pageSize ?? CIVITAI_LORA_PAGE_SIZE,
    cursor: input.cursor ?? null,
    search: input.search?.trim() ?? '',
    baseModel: input.baseModel ?? 'all',
    sort: input.sort ?? 'Highest Rated',
    nsfwFilter: input.nsfwFilter ?? DEFAULT_LORA_NSFW_FILTER,
    contentType: input.contentType ?? DEFAULT_LORA_CONTENT_TYPE,
  })
  const startedAt = Date.now()
  const upstream = listCivitaiLorasFromUpstream(input).then((result) => {
    if (options.timing) options.timing.upstreamMs = Date.now() - startedAt
    return result
  })
  const { defer } = options

  if (defer) {
    let raceTimer: ReturnType<typeof setTimeout> | undefined
    const outcome = await Promise.race<CivitaiUpstreamOutcome>([
      upstream.then(
        (result) => ({ kind: 'done', result }),
        (error: unknown) => ({ kind: 'failed', error }),
      ),
      new Promise<CivitaiUpstreamOutcome>((resolve) => {
        raceTimer = setTimeout(
          () => resolve({ kind: 'slow' }),
          CIVITAI_SEARCH_SNAPSHOT_RACE_MS,
        )
      }),
    ])
    clearTimeout(raceTimer)

    if (outcome.kind === 'done') {
      // 快照写在响应之后：它 fail-open、只在上游失败时才会被读，没理由让用
      // 户多等一趟数据库往返。
      defer(() => writeCivitaiSearchSnapshot(snapshotKey, outcome.result))
      return outcome.result
    }
    if (outcome.kind === 'failed') {
      return resolveDegradedCivitaiSearch({
        input,
        snapshotKey,
        error: outcome.error,
      })
    }
    const snapshot = await readCivitaiSearchSnapshot(snapshotKey)
    if (snapshot && fallbackHasHits(snapshot.payload)) {
      // 上游只是慢：先给上一次的结果（stale 响应不进 CDN，见路由），上游在响
      // 应之后接着跑完、刷新快照——客户端几秒后再要一次就是新的。
      defer(async () => {
        try {
          await writeCivitaiSearchSnapshot(snapshotKey, await upstream)
        } catch {
          // 这一趟也失败了：留给下一次请求的降级链处理。
        }
      })
      return markCivitaiSearchStale(snapshot.payload, snapshot.fetchedAt)
    }
  }

  try {
    const result = await upstream
    if (defer) {
      defer(() => writeCivitaiSearchSnapshot(snapshotKey, result))
    } else {
      // 没有「响应之后」可挂的调用方（预热 cron 等）就地写完：serverless 函
      // 数返回后可能立刻被回收，悬空的 promise 不保证跑完。写入本身 fail-open。
      await writeCivitaiSearchSnapshot(snapshotKey, result)
    }
    return result
  } catch (error) {
    return resolveDegradedCivitaiSearch({ input, snapshotKey, error })
  }
}

async function listCivitaiLorasFromUpstream(
  input: ListCivitaiLorasInput,
): Promise<CivitaiLoraLibraryResult> {
  const {
    page = 1,
    pageSize = CIVITAI_LORA_PAGE_SIZE,
    baseModel = 'all',
    sort = 'Highest Rated',
    nsfwFilter = DEFAULT_LORA_NSFW_FILTER,
    source,
    contentType = DEFAULT_LORA_CONTENT_TYPE,
  } = input
  const normalizedSearch = input.search?.trim() ?? ''

  // S2：内容类型筛选整体路由到独立的 meilisearch 合并路径（三重兜底，见
  // listCivitaiLorasByContentType 的文档注释）——REST `tag=` 只支持单值、表
  // 达不了 civitaiTags 的多 tag OR，也没有名称关键词兜底。
  if (contentType !== 'all') {
    return civitaiSearchBreaker.call(() =>
      listCivitaiLorasByContentType({
        page,
        pageSize,
        search: normalizedSearch,
        baseModel,
        sort,
        nsfwFilter,
        contentType,
      }),
    )
  }

  // 一次会话内锁定分页范式（Issue C）：meilisearch 按页码 offset 分页，REST
  // 回落按 cursor 扫描，同一会话中途换后端会让翻页重复 / 错位。`source` 由
  // client 在首页拿到结果后回传：
  //   'rest'        直接走 REST，不再试一次注定换范式的 meilisearch；
  //   'meilisearch' 中途失败就抛给降级链，不偷偷回落 REST；
  //   缺省          自由选择（会话第一页）。
  if (source === 'rest') {
    const fallback = await listCivitaiLorasViaRest(input)
    return normalizedSearch
      ? { ...fallback, sortFellBackToRelevance: true }
      : fallback
  }

  // 搜索与浏览都先走 meilisearch（2026-09-27 LoRA 库 B：浏览也要准数、也要
  // 同一套「安全」口径——REST 两样都给不了）。同一个端点，同一个断路器。
  try {
    return await civitaiSearchBreaker.call(() =>
      listCivitaiLorasViaMeilisearch({
        page,
        pageSize,
        search: normalizedSearch,
        baseModel,
        sort,
        nsfwFilter,
      }),
    )
  } catch (error) {
    const logContext = {
      error: error instanceof Error ? error.message : 'Unknown',
      search: normalizedSearch || undefined,
      baseModel,
      sort,
      page,
    }
    if (source === 'meilisearch') {
      logger.warn(
        'Civitai meilisearch failed mid-session (locked backend) — surfacing error instead of silently falling back to REST',
        logContext,
      )
      throw error
    }
    // 有搜索词时上游搜索整体降级不回落 REST——REST `query=` 与 meilisearch
    // 是同一个搜索子系统，回落只是把失败重演一遍再赔上十几秒（2026-08-19
    // 事故实录：单次请求 21–24 秒才吐 502）。浏览不一样：同一天不带 query
    // 的 REST 浏览全程 200，是另一个失败域，照样回落。
    if (normalizedSearch && isUpstreamSearchDegraded(error)) {
      logger.warn(
        'Civitai search subsystem degraded — skipping the REST fallback (same failure domain)',
        logContext,
      )
      throw error
    }
    logger.warn('Civitai meilisearch failed, falling back to REST', logContext)
    const fallback = await listCivitaiLorasViaRest(input)
    return normalizedSearch
      ? { ...fallback, sortFellBackToRelevance: true }
      : fallback
  }
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
    // Official pagination contract (developer.civitai.com/site/guide/pagination,
    // verified 2026-08-24): `query` requires cursor-based pagination.
    // Combining `page` with `query` returns 400 Bad Request. Browse (no query)
    // may use page or cursor; we only send `page=1` for the first browse hop,
    // later browse pages must use the opaque cursor.
    if (nextPageCursor) {
      url.searchParams.set('cursor', nextPageCursor)
    } else if (!normalizedSearch) {
      url.searchParams.set('page', '1')
    }
    if (normalizedSearch) {
      url.searchParams.delete('page')
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
  // 每个底模 × 排序的第一页各跑一次，顺手把快照写好——上游慢或挂了时，默认
  // 列表手上总有上一次的结果可给。'other' 兜底桶现在也是一次 meilisearch
  // 请求（NOT IN 补集），不再是 REST 多页扫描，一起预热。
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

  // L2 快照的 LRU 淘汰搭这趟车（6 小时一次）。放在 cron 而不是写入路径上：
  // 按写入次数或随机概率触发，等于把维护成本摊到用户的搜索延迟里。
  await pruneCivitaiSearchSnapshots()

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
// Source confidence order (verified live 2026-06-11 against the Civitai API;
// re-verify against the endpoints named below, not against a doc):
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
