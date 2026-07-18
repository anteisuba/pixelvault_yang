import 'server-only'

import { z } from 'zod'

import {
  HUGGINGFACE_COVER_FILENAME_HINTS,
  HUGGINGFACE_COVER_IMAGE_EXTENSIONS,
  HUGGINGFACE_LORA_ALLOWED_EXTENSION,
  HUGGINGFACE_LORA_ANIMA_ADAPTER_FILTER,
  HUGGINGFACE_LORA_API_BASE_URL,
  HUGGINGFACE_LORA_BASE_MODEL_FAMILY,
  HUGGINGFACE_LORA_CONTENT_TYPE_SEARCH_SEEDS,
  HUGGINGFACE_LORA_CURATED_ANIMA_REPOS,
  HUGGINGFACE_LORA_DETAIL_CONCURRENCY,
  HUGGINGFACE_LORA_FAMILY_SEARCH_SEEDS,
  HUGGINGFACE_LORA_MAX_FILE_BYTES,
  HUGGINGFACE_LORA_MAX_CURSOR_SCANS,
  HUGGINGFACE_README_ALLOWED_IMAGE_HOSTS,
  HUGGINGFACE_README_FILENAME,
  HUGGINGFACE_README_MAX_READ_CHARS,
  HUGGINGFACE_README_REQUEST_TIMEOUT_MS,
  HUGGINGFACE_SHOWCASE_CACHE_TTL_MS,
  HUGGINGFACE_SOCIAL_THUMBNAIL_BASE_URL,
  LORA_CONTENT_TYPE_EXCLUDES_HF,
  LORA_CONTENT_TYPE_OVERRIDES_HF,
  getLoraContentTypeDefinition,
  type HuggingFaceLoraFamily,
  type HuggingFaceLoraSort,
  type LoraContentType,
} from '@/constants/lora'
import { logger } from '@/lib/logger'
import { safeFetch } from '@/lib/url-guard'
import { withRetry } from '@/lib/with-retry'
import type {
  HuggingFaceLoraSearchItem,
  HuggingFaceLoraSearchQuery,
  HuggingFaceLoraSearchResult,
  HuggingFaceRepoShowcase,
  LoraAssetType,
} from '@/types'
import {
  HuggingFaceLoraSearchResultSchema,
  HuggingFaceRepoShowcaseSchema,
} from '@/types'

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
        // 允许相对路径（部分模型卡写 `./sample.png`）；resolveCoverImageUrl
        // 里统一规范化，坏值只影响封面候选、不能炸掉整页 payload 解析。
        url: z.string().nullish(),
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
    thumbnail: z.string().nullish(),
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

/**
 * 相对仓库路径（`./sample.png`、`/sample.png`）翻译成 resolve 直链；
 * `//host/...`（协议相对）和带 `:` 的值（`data:`、`javascript:` 等非 http
 * 协议）一律拒绝。绝对 http(s) URL 的取舍（是否要求白名单）由调用方决定，
 * 不在这个共享 helper 里判断。
 */
function resolveRelativeHuggingFaceImagePath(
  trimmed: string,
  repoId: string,
  revision: string,
): string | null {
  if (trimmed.startsWith('//') || trimmed.includes(':')) return null
  const relative = trimmed.replace(/^\.\//, '').replace(/^\/+/, '')
  if (!relative) return null
  return buildHuggingFaceResolveUrl(repoId, revision, relative)
}

/**
 * 模型卡里声明的图片（thumbnail / widget）既可能是绝对 URL，也可能是仓库
 * 相对路径（`./sample.png`）。这是结构化元数据（仓库作者填在 cardData
 * 里），不像 README 自由文本那样可能夹带任意第三方热链，绝对 URL 不额外
 * 校验域名。
 */
function normalizeRepositoryImageUrl(
  candidate: string,
  repoId: string,
  revision: string,
): string | null {
  const trimmed = candidate.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return resolveRelativeHuggingFaceImagePath(trimmed, repoId, revision)
}

function isAllowedReadmeImageHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return HUGGINGFACE_README_ALLOWED_IMAGE_HOSTS.some(
    (host) => normalized === host || normalized.endsWith(`.${host}`),
  )
}

/**
 * README 是仓库作者可自由编辑的文本，绝对 URL 必须落在 HF 自己的域名
 * 白名单内才收（HUGGINGFACE_README_ALLOWED_IMAGE_HOSTS 的注释有完整背
 * 景）——不像 normalizeRepositoryImageUrl 那样放行任意 https 域。
 */
function normalizeReadmeImageUrl(
  candidate: string,
  repoId: string,
  revision: string,
): string | null {
  const trimmed = candidate.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return null
    }
    return isAllowedReadmeImageHost(parsed.hostname) ? trimmed : null
  }
  return resolveRelativeHuggingFaceImagePath(trimmed, repoId, revision)
}

// Markdown `![alt](url "title")` 与 HTML `<img src="url">` 两种内嵌图片
// 写法二选一匹配、单遍扫描——用交替分支而不是分别跑两个正则再拼接，是为
// 了保留图片在文档里的原始出现顺序（"取首图为封面"要的是文档里第一张
// 图，不是"先所有 markdown 图再所有 img 标签"）。
const README_IMAGE_PATTERN =
  /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi

/**
 * 从 README markdown 正文里挖内嵌图片 URL，按文档顺序去重返回。绝对 URL
 * 只收 HF 域白名单，相对路径解析成 resolve 直链——纯函数，不发请求，方
 * 便单测。
 */
export function extractReadmeImageUrls(
  markdown: string,
  repoId: string,
  revision: string,
): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  for (const match of markdown.matchAll(README_IMAGE_PATTERN)) {
    const raw = match[1] ?? match[2]
    if (!raw) continue
    const normalized = normalizeReadmeImageUrl(raw, repoId, revision)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      urls.push(normalized)
    }
  }
  return urls
}

/**
 * README 增强级的共享抓取器：拉 README.md、按文档顺序挖全部内嵌图。失败/
 * 超时/无图一律静默返回空数组——调用方（单图取首图 / 全量 showcase）各自
 * 决定怎么用，都不能因为这一级增强请求失败就让上层报错。
 */
async function fetchReadmeImageUrls(
  repoId: string,
  revision: string,
): Promise<string[]> {
  try {
    const url = buildHuggingFaceResolveUrl(
      repoId,
      revision,
      HUGGINGFACE_README_FILENAME,
    )
    const response = await safeFetch(url, {
      allowedProtocols: ['https:'],
      signal: AbortSignal.timeout(HUGGINGFACE_README_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return []
    const text = await response.text()
    const markdown =
      text.length > HUGGINGFACE_README_MAX_READ_CHARS
        ? text.slice(0, HUGGINGFACE_README_MAX_READ_CHARS)
        : text
    return extractReadmeImageUrls(markdown, repoId, revision)
  } catch (error) {
    logger.warn('Hugging Face LoRA README image extraction failed', {
      repoId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return []
  }
}

/**
 * README 增强级的单仓库首图——`fetchReadmeImageUrls` 的薄封装，取文档顺序
 * 第一张。列表发现流程（`searchHuggingFaceLoras`）不再调用它（2026-07-18
 * 方案 B：README 增强改客户端渐进增强，见 `getHuggingFaceRepoShowcase` +
 * `/api/lora-assets/huggingface/showcase`）；导出保留供未来单图场景 / 测试
 * 复用。
 */
export async function fetchReadmeCoverImageUrl(
  repoId: string,
  revision: string,
): Promise<string | null> {
  const images = await fetchReadmeImageUrls(repoId, revision)
  return images[0] ?? null
}

function pickCoverImageSibling(
  siblings: z.infer<typeof HuggingFaceSiblingSchema>[],
): string | null {
  const images = siblings
    .map((file) => file.rfilename)
    .filter((name) =>
      HUGGINGFACE_COVER_IMAGE_EXTENSIONS.some((extension) =>
        name.toLowerCase().endsWith(extension),
      ),
    )
    .sort((a, b) => a.localeCompare(b))
  if (images.length === 0) return null
  const hinted = images.find((name) =>
    HUGGINGFACE_COVER_FILENAME_HINTS.some((hint) =>
      name.toLowerCase().includes(hint),
    ),
  )
  return hinted ?? images[0] ?? null
}

function buildSocialThumbnailUrl(repoId: string): string {
  const encoded = repoId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${HUGGINGFACE_SOCIAL_THUMBNAIL_BASE_URL}/${encoded}.png`
}

/**
 * 封面解析链的同步三级 + 兜底：cardData.thumbnail → widget 示例图 → 仓内
 * 首个图片文件 → Hub 社交缩略图兜底。绝大多数 LoRA repo 没写 widget（工
 * 具向 repo 连图片文件都没有），只靠 widget 会让 HF 库大面积空封面；社
 * 交缩略图由 Hub 为每个公开 repo 自动生成，保证卡面始终有图（这一步保证
 * 函数永远返回非空 URL，不需要调用方兜底）。
 *
 * README 内嵌图是第四级、需要额外网络请求，不在这个同步函数里、也不在
 * `searchHuggingFaceLoras` 里同步跑（2026-07-18 owner 拍板方案 B：曾经的
 * `hydrateReadmeCoverImages` 在列表请求里 await 对每个落到社交横幅兜底的
 * 条目拉 README，N 个往返的尾延迟把 HF 库首屏拖到 5–31s，不能上线——单
 * 仓库 README 往返实测只要 0.28s，瓶颈是"同步阻塞做 N 个往返"不是"单个
 * 慢"）。第四级改为客户端渐进增强：列表只到这一步就返回，客户端对落到
 * 社交横幅兜底的卡按需懒加载 `getHuggingFaceRepoShowcase`（经
 * `/api/lora-assets/huggingface/showcase`）取真图。
 */
function resolveCoverImageUrl(
  model: z.infer<typeof HuggingFaceModelSchema>,
): string {
  const revision = model.sha ?? 'main'
  const declared = [
    model.cardData?.thumbnail ?? null,
    ...(model.cardData?.widget?.map((widget) => widget.output?.url ?? null) ??
      []),
  ]
  for (const candidate of declared) {
    if (!candidate) continue
    const normalized = normalizeRepositoryImageUrl(
      candidate,
      model.id,
      revision,
    )
    if (normalized) return normalized
  }
  const sibling = pickCoverImageSibling(model.siblings)
  if (sibling) return buildHuggingFaceResolveUrl(model.id, revision, sibling)
  return buildSocialThumbnailUrl(model.id)
}

/**
 * `resolveCoverImageUrl` 落到社交横幅兜底时返回的 URL 是
 * `buildSocialThumbnailUrl(repoId)` 的精确字符串——用它反向判断"这个条目
 * 前三级全空、需要 README 增强"。列表流程不再调用它（第四级已移到客户端
 * 渐进增强，客户端用 `isHuggingFaceSocialThumbnailCoverUrl`——同一判定的
 * 域名前缀版本，见 constants/lora.ts 的注释）；导出保留供测试 / 未来服务
 * 端场景复用。
 */
export function isFallbackSocialThumbnail(
  item: HuggingFaceLoraSearchItem,
): boolean {
  return item.coverImageUrl === buildSocialThumbnailUrl(item.repoId)
}

// 库侧封面渐进增强（第四级，owner 2026-07-18 拍板方案 B）：进程内简单
// Map+TTL 缓存，同一 repoId+revision 在 TTL 窗口内不重复抓 README——客户端
// 已经用 IntersectionObserver 把请求收窄到"只对可见的落空卡发一次"，这层
// 缓存再挡掉"同一张卡在一次会话里被多次观察"（比如滚出视口又滚回来，或
// 多个访客短时间内看同一个 repo）。
interface HuggingFaceShowcaseCacheEntry {
  value: HuggingFaceRepoShowcase
  expiresAt: number
}
const huggingFaceShowcaseCache = new Map<
  string,
  HuggingFaceShowcaseCacheEntry
>()

function getShowcaseCacheKey(repoId: string, revision: string): string {
  return `${repoId.toLowerCase()}@${revision}`
}

/**
 * 单仓库 README showcase：README 全量内嵌图（供懒加载封面取首图、未来生成
 * 侧横滚复用同一批）+ 提示词占位。提示词提取是下一切片（H1）的活，这里
 * 固定返回空数组，不做启发式——这个函数只负责"这个 repo 有没有真图"，不
 * 负责"这些图配什么词"。
 */
export async function getHuggingFaceRepoShowcase(
  repoId: string,
  revision: string,
): Promise<HuggingFaceRepoShowcase> {
  const cacheKey = getShowcaseCacheKey(repoId, revision)
  const cached = huggingFaceShowcaseCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const images = await fetchReadmeImageUrls(repoId, revision)
  const result = HuggingFaceRepoShowcaseSchema.parse({
    images,
    prompts: [],
  })
  huggingFaceShowcaseCache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + HUGGINGFACE_SHOWCASE_CACHE_TTL_MS,
  })
  return result
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

// S2 内容类型筛选（lora-workbench.md §3）L1+L2：hfTags 命中（HF Hub 标签，
// 供给普遍稀薄，允许空数组）或 nameKeywords 对 repoId/模型名/tags/文件名
// 的子串匹配——不像 civitai 走 meilisearch 下推，HF 这条本来就是"抓一批
// Hub 页 + 服务端过滤"的既有架构（isPotentialLoraCandidate 的其余判据同一
// 模式），复用同一个 haystack 构造方式（matchesRepositorySearch 用的那套）
// 保持风格一致，不新开一条 over-fetch 路径。
function repositoryMatchesContentTypeKeywords(
  model: z.infer<typeof HuggingFaceModelSchema>,
  contentType: Exclude<LoraContentType, 'all'>,
): boolean {
  const definition = getLoraContentTypeDefinition(contentType)
  const normalizedTags = model.tags.map((tag) => tag.trim().toLowerCase())
  if (
    definition.hfTags.some((tag) => normalizedTags.includes(tag.toLowerCase()))
  ) {
    return true
  }
  const haystack = [
    model.id,
    getModelName(model.id),
    ...model.tags,
    ...model.siblings.map((file) => file.rfilename),
  ]
    .join(' ')
    .toLowerCase()
  return definition.nameKeywords.some((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  )
}

// L3（§3.2）：repoId 键的 exclude/override 表，优先级最高，首发空表——
// exclude 剔除 L1/L2 误报，override 补 L1/L2 都漏的模型。
function modelMatchesContentType(
  model: z.infer<typeof HuggingFaceModelSchema>,
  contentType: LoraContentType,
): boolean {
  if (contentType === 'all') return true
  const repoKey = model.id.toLowerCase()
  if (LORA_CONTENT_TYPE_EXCLUDES_HF[repoKey] === contentType) return false
  if (LORA_CONTENT_TYPE_OVERRIDES_HF[repoKey] === contentType) return true
  return repositoryMatchesContentTypeKeywords(model, contentType)
}

function isPotentialLoraCandidate(
  model: z.infer<typeof HuggingFaceModelSchema>,
  baseModelFamily: string,
  contentType: LoraContentType,
): boolean {
  return (
    !model.private &&
    !model.gated &&
    (hasExplicitLoraTag(model) || isCuratedAnimaLoraRepo(model.id)) &&
    isSupportedDiffusionLora(model) &&
    modelHasBaseFamily(model, baseModelFamily) &&
    modelMatchesContentType(model, contentType) &&
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
  contentType: LoraContentType,
): HuggingFaceLoraSearchItem | null {
  if (!isPotentialLoraCandidate(model, baseModelFamily, contentType)) {
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

  return {
    repoId: model.id,
    name: getModelName(model.id),
    modelPageUrl: `https://huggingface.co/${model.id}`,
    revision: model.sha ?? 'main',
    files,
    triggerWord: getTriggerWord(model.cardData),
    type: inferLoraType(model.tags),
    baseModelFamily: repositoryFamily,
    coverImageUrl: resolveCoverImageUrl(model),
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
  sort: HuggingFaceLoraSort
  cursor?: string
}): Promise<{
  models: z.infer<typeof HuggingFaceModelSchema>[]
  nextCursor: string | null
}> {
  const params = new URLSearchParams({
    filter: input.filter,
    full: 'true',
    limit: String(input.limit),
    sort: input.sort,
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
 * 单个种子词的追加规则——已包含（大小写不敏感）则跳过，否则空格拼接；
 * 当前项为空时种子词就是全部内容。家族种子、类型种子共用这一条规则，
 * 抽成小函数避免两处复制。
 */
function appendSearchSeed(current: string, seed: string | undefined): string {
  if (!seed) return current
  const trimmed = current.trim()
  if (!trimmed) return seed
  if (trimmed.toLowerCase().includes(seed.toLowerCase())) return trimmed
  return `${trimmed} ${seed}`
}

/**
 * Bug 修复（HUGGINGFACE_LORA_FAMILY_SEARCH_SEEDS 的注释有完整背景）：非
 * 'all'、非 anima-dit 的家族筛选把家族种子词并入 Hub `search` 参数，把
 * `filter=lora` 的全局盲扫收窄到供给存在的页面。anima-dit 已经有专属的
 * `HUGGINGFACE_LORA_ANIMA_ADAPTER_FILTER`（走 filter 而非 search），不
 * 重复播种。
 *
 * 追加 Bug 修复（owner 2026-07-18 报告 HF「风格」类型每页只出 3-4 张，
 * `HUGGINGFACE_LORA_CONTENT_TYPE_SEARCH_SEEDS` 的注释有完整背景）：内容
 * 类型筛选同样并入 `search`（Hub search 语义是 AND，见
 * HUGGINGFACE_LORA_FAMILY_SEARCH_SEEDS 注释的 curl 实测），family、type
 * 两个种子都存在时一起拼接（如 'pony style'）。`type='all'` 不追加类型
 * 种子。用户已输入的搜索词/已拼过的种子若已经包含新种子（大小写不敏感）
 * 不重复拼接；两边都无种子时原样返回用户搜索词——保持现状盲扫。
 */
function buildDiscoverySearchTerm(
  baseModelFamily: string,
  contentType: LoraContentType,
  userSearch: string,
): string {
  let term = userSearch

  const familyHasDedicatedFilter =
    baseModelFamily === 'all' ||
    baseModelFamily === HUGGINGFACE_LORA_BASE_MODEL_FAMILY
  if (!familyHasDedicatedFilter) {
    const familySeed = (
      HUGGINGFACE_LORA_FAMILY_SEARCH_SEEDS as Record<string, string | undefined>
    )[baseModelFamily]
    term = appendSearchSeed(term, familySeed)
  }

  if (contentType !== 'all') {
    const typeSeed = (
      HUGGINGFACE_LORA_CONTENT_TYPE_SEARCH_SEEDS as Record<
        string,
        string | undefined
      >
    )[contentType]
    term = appendSearchSeed(term, typeSeed)
  }

  return term
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
    // 家族种子词一次性算好，跨这次请求内的全部游标扫描复用同一个 search
    // 参数——cursor 语义要求同一分页会话全程用同一个查询，中途改 search
    // 会让 Hub 返回的 cursor 失效。
    const discoverySearchTerm = buildDiscoverySearchTerm(
      query.baseModelFamily,
      query.type,
      query.search,
    )

    const includeCuratedAnima =
      page === 1 &&
      !query.cursor &&
      (query.baseModelFamily === 'all' ||
        query.baseModelFamily === HUGGINGFACE_LORA_BASE_MODEL_FAMILY)
    if (includeCuratedAnima) {
      const curatedModels = await fetchCuratedAnimaLoraRepos(query.search)
      for (const model of curatedModels) {
        const item = toSearchItem(model, query.baseModelFamily, query.type)
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
        search: discoverySearchTerm,
        limit: remaining,
        sort: query.sort,
        cursor: nextCursor ?? undefined,
      })
      nextCursor = hubPage.nextCursor

      const candidates = hubPage.models.filter(
        (model) =>
          !seenRepoIds.has(model.id.toLowerCase()) &&
          isPotentialLoraCandidate(model, query.baseModelFamily, query.type),
      )
      const verifiedModels = await hydrateCandidateFileSizes(candidates)
      for (const model of verifiedModels) {
        const item = toSearchItem(model, query.baseModelFamily, query.type)
        if (!item || items.length >= query.limit) continue
        items.push(item)
        seenRepoIds.add(item.repoId.toLowerCase())
      }

      if (!nextCursor || hubPage.models.length === 0) break
    }

    // 第四级封面增强（README 内嵌图）不再在这里同步做（2026-07-18 方案
    // B）：列表秒回，客户端对落到社交横幅兜底的卡按需懒加载
    // `getHuggingFaceRepoShowcase`（见 resolveCoverImageUrl 的文档注释）。

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
      contentType: query.type,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    throw error
  }
}
