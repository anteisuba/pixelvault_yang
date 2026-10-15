import { z } from 'zod'

/**
 * 每档最多存几张图——与 CIVITAI_ITEM_MAX_IMAGES 对齐。安全档（≤ Soft）与其余
 * 各存一份：只存前 6 张的话，前 6 张全是 NSFW 的模型在安全档里会没有封面。
 */
const MAX_IMAGES_PER_TIER = 6

/**
 * 行格式版本，进指纹。索引里多存了一样东西（新列、新的派生索引）时加一：
 * 下一次同步所有指纹都对不上，整个目录按「拉完整数据」重写一遍，不用另写回填。
 */
const INDEX_ROW_VERSION = 3

/** 中日韩：汉字、假名、谚文。 */
const CJK_RUN =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+/g
const SAFE_IMAGE_MAX_LEVEL = 2
/** 每个模型最多存几个版本（上游按新到旧给）。 */
const MAX_VERSIONS = 40
/** 每个模型最多写几个精确词——防超长名字把词表撑大。 */
const MAX_TERMS = 64

// 上游对「没有值」写 null 而不是省略字段，所以每一层都要放行 null。
const NsfwLevelSchema = z
  .union([z.array(z.number()), z.number()])
  .nullable()
  .optional()

const TagsSchema = z
  .array(z.object({ name: z.string() }).loose())
  .nullable()
  .optional()

const MetricsSchema = z
  .object({
    downloadCount: z.number().nullable().optional(),
    thumbsUpCount: z.number().nullable().optional(),
  })
  .loose()
  .nullable()
  .optional()

/** 每日全量扫描取的轻量字段：一千条约 0.4 MB（带图片的完整字段约 7 MB）。 */
export const LIGHT_ATTRIBUTES = [
  'id',
  'name',
  'nsfw',
  'nsfwLevel',
  'tags',
  'metrics',
  'lastVersionAtUnix',
] as const

export const FULL_ATTRIBUTES = [
  ...LIGHT_ATTRIBUTES,
  'type',
  'user',
  'permissions',
  'createdAt',
  'version',
  'versions',
  'images',
] as const

const VersionSchema = z
  .object({
    id: z.number().int(),
    name: z.string().nullable().optional(),
    baseModel: z.string().nullable().optional(),
    trainedWords: z.array(z.string()).nullable().optional(),
    hashData: z
      .array(z.object({ hash: z.string(), type: z.string() }).loose())
      .nullable()
      .optional(),
  })
  .loose()

const LightHitSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    nsfw: z.boolean().nullable().optional(),
    nsfwLevel: NsfwLevelSchema,
    tags: TagsSchema,
    metrics: MetricsSchema,
    lastVersionAtUnix: z.number().nullable().optional(),
  })
  .loose()

const FullHitSchema = LightHitSchema.extend({
  type: z.string().nullable().optional(),
  user: z
    .object({
      username: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
    })
    .loose()
    .nullable()
    .optional(),
  permissions: z
    .object({
      allowCommercialUse: z.array(z.string()).nullable().optional(),
      allowDerivatives: z.boolean().nullable().optional(),
      allowNoCredit: z.boolean().nullable().optional(),
    })
    .loose()
    .nullable()
    .optional(),
  createdAt: z.string().nullable().optional(),
  version: VersionSchema.nullable().optional(),
  versions: z.array(VersionSchema).nullable().optional(),
  images: z
    .array(
      z
        .object({
          id: z.number(),
          url: z.string(),
          type: z.string().nullable().optional(),
          nsfwLevel: z.number().nullable().optional(),
          hash: z.string().nullable().optional(),
        })
        .loose(),
    )
    .nullable()
    .optional(),
})

export interface LightRow {
  modelId: number
  lightFp: string
  downloadCount: number
  thumbsUpCount: number
}

export interface IndexImage {
  id: number
  url: string
  type?: string
  nsfwLevel?: number
  hash?: string
}

export interface IndexPermissions {
  allowCommercialUse: string[]
  allowDerivatives: boolean
  allowNoCredit: boolean
}

export interface IndexVersion {
  id: number
  name: string | null
  baseModel: string | null
  trainedWords: string[]
  hashAutoV3: string | null
}

export interface IndexRow extends LightRow {
  versionId: number
  versionName: string | null
  name: string
  creator: string | null
  creatorImage: string | null
  modelType: string
  nsfw: boolean
  nsfwLevelMin: number
  nsfwLevelMax: number
  /** 默认展示那一版的底模 */
  baseModel: string | null
  tags: string[]
  /** 所有版本的触发词（去重）——进全文索引；展示用的是 `versions` 里各版自己的。 */
  trainedWords: string[]
  hashAutoV3: string | null
  /** 全部版本，上游顺序（新到旧），默认展示那一版一定在里面。 */
  versions: IndexVersion[]
  images: IndexImage[]
  permissions: IndexPermissions
  createdAt: number
  lastVersionAt: number
  refreshedAt: number
  /** 写进 lora_term 的精确词（见 `indexTerms`）。 */
  terms: string[]
}

/**
 * trigram 至少要 3 个字，「鸣潮」「银发」这类两个字的词全靠这份：名字里每一段
 * 中日韩字切成单字 + 相邻两字，查询时按整词匹配。
 */
export function cjkGrams(name: string): string {
  const grams = new Set<string>()
  for (const run of name.match(CJK_RUN) ?? []) {
    const chars = [...run]
    chars.forEach((char, index) => {
      grams.add(char)
      if (index + 1 < chars.length) grams.add(char + chars[index + 1])
    })
  }
  return [...grams].join(' ')
}

/**
 * lora_term 的精确词：非默认版本的底模（`b:`）、标签（`t:`）、名字里的整词与
 * 中日韩单字 / 相邻两字（`w:`）。前两类排前面，超出上限时先舍名字里的词。
 */
export function indexTerms(
  name: string,
  tags: readonly string[],
  extraBaseModels: readonly string[],
): string[] {
  const terms = new Set<string>()
  for (const baseModel of extraBaseModels) terms.add(`b:${baseModel}`)
  for (const tag of tags) terms.add(`t:${tag.toLowerCase()}`)
  const words = name
    .toLowerCase()
    .replace(CJK_RUN, ' ')
    .match(/[\p{L}\p{N}]+/gu)
  for (const word of words ?? []) terms.add(`w:${word}`)
  for (const gram of cjkGrams(name).split(' ')) if (gram) terms.add(`w:${gram}`)
  return [...terms].slice(0, MAX_TERMS)
}

function toIndexVersion(version: z.infer<typeof VersionSchema>): IndexVersion {
  return {
    id: version.id,
    name: version.name ?? null,
    baseModel: version.baseModel?.trim() || null,
    trainedWords: version.trainedWords ?? [],
    hashAutoV3:
      version.hashData?.find((entry) => entry.type.toUpperCase() === 'AUTOV3')
        ?.hash ?? null,
  }
}

/** FNV-1a 32 位，十六进制。只用来判「变没变」，不做安全用途。 */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function nsfwLevelRange(value: z.infer<typeof NsfwLevelSchema>) {
  const levels = Array.isArray(value)
    ? value
    : typeof value === 'number'
      ? [value]
      : []
  return levels.length > 0
    ? { min: Math.min(...levels), max: Math.max(...levels) }
    : { min: 0, max: 0 }
}

function lightFields(hit: z.infer<typeof LightHitSchema>) {
  const tags = (hit.tags ?? []).map((tag) => tag.name)
  const levels = nsfwLevelRange(hit.nsfwLevel)
  return {
    tags,
    levels,
    light: {
      modelId: hit.id,
      // 名字 / 分级 / 标签 / 最新版本时刻任何一样变了，完整数据就可能变了。
      // 下载量与点赞不进指纹——它们每天都在变，单独走指标更新。
      lightFp: fingerprint([
        INDEX_ROW_VERSION,
        hit.name,
        hit.nsfw ?? false,
        levels.min,
        levels.max,
        tags,
        hit.lastVersionAtUnix ?? null,
      ]),
      downloadCount: hit.metrics?.downloadCount ?? 0,
      thumbsUpCount: hit.metrics?.thumbsUpCount ?? 0,
    } satisfies LightRow,
  }
}

/** 轻量 hit → 指纹与指标。返回 null = 形状读不懂（上游改了字段）。 */
export function mapLightHit(hit: unknown): LightRow | null {
  const parsed = LightHitSchema.safeParse(hit)
  return parsed.success ? lightFields(parsed.data).light : null
}

/**
 * 完整 hit → 索引行。返回 null = 这条不该入库（读不懂，或没有可用版本——
 * 没有版本就拿不到下载地址，挂不上）。
 */
export function mapFullHit(hit: unknown, refreshedAt: number): IndexRow | null {
  const parsed = FullHitSchema.safeParse(hit)
  if (!parsed.success) return null
  const data = parsed.data
  const version = data.version
  if (!version) return null

  const { tags, levels, light } = lightFields(data)
  const images = data.images ?? []
  const keptImages = new Set([
    ...images
      .filter((image) => (image.nsfwLevel ?? 0) <= SAFE_IMAGE_MAX_LEVEL)
      .slice(0, MAX_IMAGES_PER_TIER),
    ...images
      .filter((image) => (image.nsfwLevel ?? 0) > SAFE_IMAGE_MAX_LEVEL)
      .slice(0, MAX_IMAGES_PER_TIER),
  ])
  const parsedCreatedAt = data.createdAt ? Date.parse(data.createdAt) : NaN
  const lastVersionAt =
    data.lastVersionAtUnix ??
    (Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : 0)
  const createdAt = Number.isFinite(parsedCreatedAt)
    ? parsedCreatedAt
    : lastVersionAt

  const current = toIndexVersion(version)
  const versions = (data.versions ?? [])
    .slice(0, MAX_VERSIONS)
    .map(toIndexVersion)
  if (!versions.some((entry) => entry.id === current.id)) {
    versions.unshift(current)
  }
  const extraBaseModels = [
    ...new Set(
      versions
        .map((entry) => entry.baseModel)
        .filter(
          (baseModel): baseModel is string =>
            baseModel !== null && baseModel !== current.baseModel,
        ),
    ),
  ]

  return {
    ...light,
    versionId: current.id,
    versionName: current.name,
    name: data.name,
    creator: data.user?.username ?? null,
    creatorImage: data.user?.image ?? null,
    modelType: data.type ?? 'LORA',
    nsfw: data.nsfw ?? false,
    nsfwLevelMin: levels.min,
    nsfwLevelMax: levels.max,
    baseModel: current.baseModel,
    tags,
    trainedWords: [
      ...new Set([
        ...current.trainedWords,
        ...versions.flatMap((entry) => entry.trainedWords),
      ]),
    ],
    hashAutoV3: current.hashAutoV3,
    versions,
    // 保持上游原顺序（第一张是作者选的封面）。
    images: images
      .filter((image) => keptImages.has(image))
      .map((image) => ({
        id: image.id,
        url: image.url,
        ...(image.type ? { type: image.type } : {}),
        ...(typeof image.nsfwLevel === 'number'
          ? { nsfwLevel: image.nsfwLevel }
          : {}),
        ...(image.hash ? { hash: image.hash } : {}),
      })),
    // 与旧的搜索路径同一套缺省：没写就当「不许商用 / 不许二创 / 可免署名」。
    permissions: {
      allowCommercialUse: data.permissions?.allowCommercialUse ?? [],
      allowDerivatives: data.permissions?.allowDerivatives ?? false,
      allowNoCredit: data.permissions?.allowNoCredit ?? true,
    },
    createdAt,
    lastVersionAt,
    refreshedAt,
    terms: indexTerms(data.name, tags, extraBaseModels),
  }
}
