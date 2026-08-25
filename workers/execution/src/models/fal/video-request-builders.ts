export type FalWorkerVideoMode = 'text-to-video' | 'image-to-video'

export interface FalWorkerVideoDefaults {
  negativePrompt?: string
  resolution?: string
  cfgScale?: number
  enablePromptOptimizer?: boolean
  generateAudio?: boolean
}

export interface FalWorkerVideoRequestContext {
  providerInput: {
    prompt: string
    modelId: string
    externalModelId: string
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
    /** Either a number of seconds, or 'auto' (Seedance-only literal). */
    duration?: number | 'auto'
    referenceImage?: string
    /**
     * Multi-reference URLs for endpoints whose fal API takes `image_urls`
     * (Veo 3.1 reference-to-video, Seedance 2.0 reference-to-video). Other
     * builders read the single `referenceImage` instead.
     */
    referenceImages?: string[]
    /** Reference audio clips for Seedance reference-to-video voice cloning. */
    audioUrls?: string[]
    /**
     * Per-clip binding labels — character names attached to each audio URL
     * by the upstream Workbench harvest. When present the Seedance Reference
     * builder labels @AudioN tokens as `"{Name} (@AudioN)"` instead of the
     * unlabeled fallback.
     */
    audioBindings?: ReadonlyArray<{
      url: string
      characterName?: string
    }>
    /** Reference video clips for Seedance reference-to-video. */
    videoUrls?: string[]
    negativePrompt?: string
    generateAudio?: boolean
    seed?: number
    resolution?: string
    i2vModelId?: string
    videoDefaults?: FalWorkerVideoDefaults
  }
}

export interface FalWorkerVideoQueueRequest {
  endpointModelId: string
  input: Record<string, unknown>
  mode: FalWorkerVideoMode
  isDocumentationVerified: boolean
}

const FAL_VIDEO_MODEL_IDS = {
  KLING_V3_PRO: 'kling-v3-pro',
  KLING_O3_PRO: 'kling-o3-pro',
  HAPPYHORSE_10: 'happyhorse-1.0',
  WAN_30: 'wan-3.0',
  WAN_30_REFERENCE: 'wan-3.0-reference',
  LTX_23: 'ltx-2.3',
  SEEDANCE_20: 'seedance-2.0',
  SEEDANCE_20_FAST: 'seedance-2.0-fast',
  SEEDANCE_20_REFERENCE: 'seedance-2.0-reference',
  SEEDANCE_20_FAST_REFERENCE: 'seedance-2.0-fast-reference',
  SEEDANCE_25: 'seedance-2.5',
  SEEDANCE_25_REFERENCE: 'seedance-2.5-reference',
  VEO_31: 'veo-3.1',
} as const

const FAL_VIDEO_MODEL_ID_ALIASES: Record<string, string> = {
  'veo-3': FAL_VIDEO_MODEL_IDS.VEO_31,
}

const FAL_VIDEO_DURATION_DEFAULT = 5
const FAL_TEXT_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const
const FAL_EXTENDED_ASPECT_RATIOS = [
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
] as const
const HAPPYHORSE_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const
const LTX_ASPECT_RATIOS = ['16:9', '9:16'] as const

/**
 * Wan 3.0 (fal `alibaba/wan-3.0/*`). Values below come from fal's OpenAPI for
 * the three endpoints, not from a docs page summary.
 *
 * The schema also carries `aspect_ratio: 'adaptive'` (the upstream default),
 * `enable_prompt_expansion`, `enable_thinking`, `enable_safety_checker`,
 * `file_url` and `web_url`. None are sent:
 * - `adaptive` is not a member of the app's VIDEO_ASPECT_RATIOS, so image
 *   modes omit `aspect_ratio` entirely and inherit it instead.
 * - the three `enable_*` switches have no UI and their defaults are the ones
 *   we want (expansion on, thinking off, safety on).
 * - `file_url` / `web_url` (document- and webpage-to-video) have no plumbing
 *   in `providerInput` yet — a capability worth its own slice, not a silent
 *   half-wiring.
 */
const WAN_30_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const
const WAN_30_RESOLUTIONS = ['480p', '720p', '1080p'] as const
const WAN_30_MIN_DURATION = 2
const WAN_30_MAX_DURATION = 30
const WAN_30_REFERENCE_LIMITS = { images: 10, videos: 5, audio: 5 } as const

function pickString(
  value: string | undefined,
  allowed: readonly string[],
  fallback: string,
): string {
  return value && allowed.includes(value) ? value : fallback
}

/**
 * Strip the 'auto' literal — most builders don't understand it. Seedance
 * builders special-case 'auto' upstream of these pickers and never reach
 * this coercion.
 */
function asNumericDuration(
  duration: number | 'auto' | undefined,
): number | undefined {
  return typeof duration === 'number' ? duration : undefined
}

function pickNumberDuration(
  duration: number | undefined,
  allowed: readonly number[],
  fallback: number,
): number {
  const value = duration ?? FAL_VIDEO_DURATION_DEFAULT
  return allowed.includes(value) ? value : fallback
}

function pickStringDuration(
  duration: number | undefined,
  allowed: readonly number[],
  fallback: number,
): string {
  return String(pickNumberDuration(duration, allowed, fallback))
}

function pickClampedStringDuration(
  duration: number | undefined,
  min: number,
  max: number,
): string {
  const value = duration ?? FAL_VIDEO_DURATION_DEFAULT
  return String(Math.min(max, Math.max(min, Math.round(value))))
}

function pickClampedNumberDuration(
  duration: number | undefined,
  min: number,
  max: number,
): number {
  const value = duration ?? FAL_VIDEO_DURATION_DEFAULT
  return Math.min(max, Math.max(min, Math.round(value)))
}

function pickVeoDuration(duration: number | undefined): string {
  const value = duration ?? FAL_VIDEO_DURATION_DEFAULT
  if (value <= 4) return '4s'
  if (value <= 6) return '6s'
  return '8s'
}

function readDefaultString(
  defaults: FalWorkerVideoDefaults | undefined,
  key: keyof FalWorkerVideoDefaults,
): string | undefined {
  const value = defaults?.[key]
  return typeof value === 'string' ? value : undefined
}

function readDefaultNumber(
  defaults: FalWorkerVideoDefaults | undefined,
  key: keyof FalWorkerVideoDefaults,
): number | undefined {
  const value = defaults?.[key]
  return typeof value === 'number' ? value : undefined
}

function readDefaultBoolean(
  defaults: FalWorkerVideoDefaults | undefined,
  key: keyof FalWorkerVideoDefaults,
): boolean | undefined {
  const value = defaults?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function pickResolution(
  resolution: string | undefined,
  defaults: FalWorkerVideoDefaults | undefined,
  allowed: readonly string[],
  fallback?: string,
): string | undefined {
  const value = resolution ?? readDefaultString(defaults, 'resolution')
  if (value && allowed.includes(value)) return value
  return fallback
}

function applyNegativePrompt(
  body: Record<string, unknown>,
  context: FalWorkerVideoRequestContext,
): void {
  const value =
    context.providerInput.negativePrompt ??
    readDefaultString(context.providerInput.videoDefaults, 'negativePrompt')
  if (value) {
    body.negative_prompt = value
  }
}

function applyCfgScale(
  body: Record<string, unknown>,
  context: FalWorkerVideoRequestContext,
): void {
  const value = readDefaultNumber(
    context.providerInput.videoDefaults,
    'cfgScale',
  )
  if (value !== undefined) {
    body.cfg_scale = value
  }
}

function getMode(context: FalWorkerVideoRequestContext): FalWorkerVideoMode {
  const { providerInput } = context
  return providerInput.referenceImage && providerInput.i2vModelId
    ? 'image-to-video'
    : 'text-to-video'
}

function normalizeWorkerModelId(modelId: string): string {
  return FAL_VIDEO_MODEL_ID_ALIASES[modelId] ?? modelId
}

function getEndpointModelId(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): string {
  const { providerInput } = context
  if (mode === 'image-to-video' && providerInput.i2vModelId) {
    return providerInput.i2vModelId
  }
  return providerInput.externalModelId
}

function requireReferenceImage(context: FalWorkerVideoRequestContext): string {
  const { providerInput } = context
  if (!providerInput.referenceImage) {
    throw new Error(
      `FAL video model ${providerInput.modelId} requires a reference image for image-to-video.`,
    )
  }
  return providerInput.referenceImage
}

function buildKlingV3Pro(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    duration: pickClampedStringDuration(
      asNumericDuration(providerInput.duration),
      3,
      15,
    ),
    generate_audio:
      providerInput.generateAudio ??
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ??
      true,
  }

  if (mode === 'image-to-video') {
    body.start_image_url = requireReferenceImage(context)
  } else {
    body.aspect_ratio = pickString(
      providerInput.aspectRatio,
      FAL_TEXT_ASPECT_RATIOS,
      '16:9',
    )
  }

  applyNegativePrompt(body, context)
  applyCfgScale(body, context)
  return body
}

function buildVeo31(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    aspect_ratio: pickString(
      providerInput.aspectRatio,
      ['16:9', '9:16'],
      '16:9',
    ),
    duration: pickVeoDuration(asNumericDuration(providerInput.duration)),
    resolution:
      pickResolution(
        providerInput.resolution,
        providerInput.videoDefaults,
        ['720p', '1080p', '4k'],
        '720p',
      ) ?? '720p',
    generate_audio:
      providerInput.generateAudio ??
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ??
      true,
  }

  applyNegativePrompt(body, context)

  if (mode === 'image-to-video') {
    // Veo 3.1 reference-to-video takes up to 3 subject/scene refs via
    // `image_urls`. Prefer the multi-reference array when present; fall back
    // to wrapping the single `referenceImage` for legacy single-image callers.
    const refs =
      providerInput.referenceImages && providerInput.referenceImages.length > 0
        ? providerInput.referenceImages
        : [requireReferenceImage(context)]
    body.image_urls = refs.slice(0, 3)
  }

  return body
}

function buildHappyHorse10(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    resolution:
      pickResolution(
        providerInput.resolution,
        providerInput.videoDefaults,
        ['720p', '1080p'],
        '720p',
      ) ?? '720p',
    duration: pickClampedNumberDuration(
      asNumericDuration(providerInput.duration),
      3,
      15,
    ),
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  } else {
    body.aspect_ratio = pickString(
      providerInput.aspectRatio,
      HAPPYHORSE_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

function pickWan30Common(
  context: FalWorkerVideoRequestContext,
): Record<string, unknown> {
  const { providerInput } = context
  return {
    prompt: providerInput.prompt,
    resolution:
      pickResolution(
        providerInput.resolution,
        providerInput.videoDefaults,
        WAN_30_RESOLUTIONS,
        '720p',
      ) ?? '720p',
    duration: pickClampedNumberDuration(
      asNumericDuration(providerInput.duration),
      WAN_30_MIN_DURATION,
      WAN_30_MAX_DURATION,
    ),
    audio:
      providerInput.generateAudio ??
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ??
      true,
  }
}

function buildWan30(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body = pickWan30Common(context)

  if (mode === 'image-to-video') {
    // ⚠ Wan names the first frame `start_image_url`, not `image_url` — the
    // field every other fal i2v builder here uses. Copying one of those
    // verbatim yields a 422.
    body.start_image_url = requireReferenceImage(context)
    // 尾帧：与 Seedance 2.5 同一个约定 —— referenceImages[1] 是尾帧，顺序由
    // 采集端 `orderKeyframes` 按 imageCategory 保证。
    const endImage = providerInput.referenceImages?.[1]
    if (endImage) {
      body.end_image_url = endImage
    }
    // `aspect_ratio` 故意不发：上游默认 `adaptive` 会跟随输入帧，发一个具体
    // 比例反而会给用户自己的图加黑边。
  } else {
    body.aspect_ratio = pickString(
      providerInput.aspectRatio,
      WAN_30_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

function buildWan30Reference(
  context: FalWorkerVideoRequestContext,
): Record<string, unknown> {
  const { providerInput } = context

  const imageRefs =
    providerInput.referenceImages && providerInput.referenceImages.length > 0
      ? providerInput.referenceImages
      : providerInput.referenceImage
        ? [providerInput.referenceImage]
        : []
  const imageUrls = imageRefs.slice(0, WAN_30_REFERENCE_LIMITS.images)
  const videoUrls = (providerInput.videoUrls ?? []).slice(
    0,
    WAN_30_REFERENCE_LIMITS.videos,
  )
  const audioUrls = (
    providerInput.audioBindings && providerInput.audioBindings.length > 0
      ? providerInput.audioBindings.map((binding) => binding.url)
      : (providerInput.audioUrls ?? [])
  ).slice(0, WAN_30_REFERENCE_LIMITS.audio)

  if (
    imageUrls.length === 0 &&
    videoUrls.length === 0 &&
    audioUrls.length === 0
  ) {
    throw new Error(
      `FAL video model ${providerInput.modelId} requires at least one reference image, video, or audio clip.`,
    )
  }

  const body = pickWan30Common(context)
  body.aspect_ratio = pickString(
    providerInput.aspectRatio,
    WAN_30_ASPECT_RATIOS,
    '16:9',
  )

  if (imageUrls.length > 0) body.reference_image_urls = imageUrls
  if (videoUrls.length > 0) body.reference_video_urls = videoUrls
  if (audioUrls.length > 0) body.reference_audio_urls = audioUrls

  // ⛔ 这里**没有**像 buildSeedanceReference 那样往 prompt 前面塞位置 token。
  // 两个原因：
  // 1. Wan 的语法是 `Image 1` / `Video 1` / `Audio 1`（空格 + 首字母大写），
  //    不是 Seedance 的 `@Image1` —— 照抄会发出 Wan 不认的 token。
  // 2. fal 的 schema 把位置引用写成**可选**的表达手段（"can be addressed
  //    positionally"），没说不提就不生效。Seedance 那个前缀是实测出来的必需
  //    品，Wan 这边我还没有同等证据。
  // 端到端实测要专门验这一条：不提 `Image 1` 时参考图到底起不起作用。真需要
  // 再补前缀，别先按猜测发。
  return body
}

function buildLtx23(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    duration: pickStringDuration(
      asNumericDuration(providerInput.duration),
      [6, 8, 10],
      6,
    ),
    resolution:
      pickResolution(
        providerInput.resolution,
        providerInput.videoDefaults,
        ['1080p'],
        '1080p',
      ) ?? '1080p',
    generate_audio:
      providerInput.generateAudio ??
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ??
      true,
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  } else {
    body.aspect_ratio = pickString(
      providerInput.aspectRatio,
      LTX_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

/**
 * Seedance is the only fal video endpoint that understands the literal
 * 'auto' token for duration — let it pass through verbatim.
 */
function pickSeedanceDuration(
  duration: number | 'auto' | undefined,
  maxDuration = 15,
): string {
  if (duration === 'auto') return 'auto'
  return pickClampedStringDuration(asNumericDuration(duration), 4, maxDuration)
}

function buildSeedance20(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
  allowedResolutions: readonly string[],
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    resolution:
      pickResolution(
        providerInput.resolution,
        providerInput.videoDefaults,
        allowedResolutions,
        '720p',
      ) ?? '720p',
    duration: pickSeedanceDuration(providerInput.duration),
    aspect_ratio: pickString(
      providerInput.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    ),
    generate_audio:
      providerInput.generateAudio ??
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ??
      true,
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  }

  return body
}

function buildSeedance25(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    resolution:
      pickResolution(
        providerInput.resolution,
        providerInput.videoDefaults,
        ['480p', '720p'],
        '720p',
      ) ?? '720p',
    duration: pickSeedanceDuration(providerInput.duration, 30),
    generate_audio:
      providerInput.generateAudio ??
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ??
      true,
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
    const endImage = providerInput.referenceImages?.[1]
    if (endImage) body.end_image_url = endImage
    body.aspect_ratio = 'auto'
  } else {
    body.aspect_ratio = pickString(
      providerInput.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

/**
 * @Audio1..@Audio9 references in a prompt mean the user already wired audio
 * clips themselves; we leave the prompt alone in that case.
 */
function promptReferencesAudio(prompt: string): boolean {
  return /@Audio(?:[1-9]|10)\b/.test(prompt)
}

function promptReferencesVideo(prompt: string): boolean {
  return /@Video(?:[1-9]|10)\b/.test(prompt)
}

interface AudioPrefixBinding {
  url: string
  characterName?: string
}

function buildAudioReferencePrefix(
  bindings: readonly AudioPrefixBinding[],
  maxReferences: number,
): string {
  const tokens: string[] = []
  for (let i = 0; i < bindings.length && i < maxReferences; i += 1) {
    const slot = `@Audio${i + 1}`
    const name = bindings[i]?.characterName?.trim()
    tokens.push(name ? `${name} (${slot})` : slot)
  }
  return tokens.join(' ')
}

function buildVideoReferencePrefix(
  videoCount: number,
  maxReferences: number,
): string {
  const refs: string[] = []
  for (let i = 1; i <= videoCount && i <= maxReferences; i += 1) {
    refs.push(`@Video${i}`)
  }
  return refs.join(' ')
}

function buildSeedanceReference(
  context: FalWorkerVideoRequestContext,
  allowedResolutions: readonly string[],
  limits: {
    images: number
    videos: number
    audio: number
    total: number
    maxDuration: number
  } = { images: 9, videos: 3, audio: 3, total: 12, maxDuration: 15 },
): Record<string, unknown> {
  const { providerInput } = context
  // Prefer audioBindings (carries character names from the harvest) over
  // bare audioUrls. Callers that don't know about bindings still work via
  // the audioUrls fallback.
  const audioBindings =
    providerInput.audioBindings && providerInput.audioBindings.length > 0
      ? providerInput.audioBindings.slice(0, limits.audio)
      : providerInput.audioUrls && providerInput.audioUrls.length > 0
        ? providerInput.audioUrls.slice(0, limits.audio).map((url) => ({ url }))
        : []
  const audioUrls = audioBindings.map((binding) => binding.url)
  const videoUrls =
    providerInput.videoUrls && providerInput.videoUrls.length > 0
      ? providerInput.videoUrls.slice(0, limits.videos)
      : []

  // Reference input may be image(s), video(s), or both. Audio cannot be the
  // only reference modality.
  const imageRefs =
    providerInput.referenceImages && providerInput.referenceImages.length > 0
      ? providerInput.referenceImages
      : providerInput.referenceImage
        ? [providerInput.referenceImage]
        : []
  if (imageRefs.length === 0 && videoUrls.length === 0) {
    throw new Error(
      `FAL video model ${providerInput.modelId} requires at least one reference image or video.`,
    )
  }
  // fal cross-modality cap ≤ 12 total — trim image_urls first so the
  // user-supplied audio + video references are never silently dropped.
  const maxImages = Math.max(
    0,
    limits.total - videoUrls.length - audioUrls.length,
  )
  const imageUrls = imageRefs.slice(0, Math.min(limits.images, maxImages))

  let prompt = providerInput.prompt
  if (audioBindings.length > 0 && !promptReferencesAudio(prompt)) {
    prompt =
      `${buildAudioReferencePrefix(audioBindings, limits.audio)} ${prompt}`.trim()
  }
  if (videoUrls.length > 0 && !promptReferencesVideo(prompt)) {
    prompt =
      `${buildVideoReferencePrefix(videoUrls.length, limits.videos)} ${prompt}`.trim()
  }

  const body: Record<string, unknown> = {
    prompt,
    resolution:
      pickResolution(
        providerInput.resolution,
        providerInput.videoDefaults,
        allowedResolutions,
        '720p',
      ) ?? '720p',
    duration: pickSeedanceDuration(providerInput.duration, limits.maxDuration),
    aspect_ratio: pickString(
      providerInput.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    ),
    generate_audio:
      providerInput.generateAudio ??
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ??
      true,
  }
  if (imageUrls.length > 0) {
    body.image_urls = imageUrls
  }
  if (videoUrls.length > 0) {
    body.video_urls = videoUrls
  }
  if (audioUrls.length > 0) {
    body.audio_urls = audioUrls
  }
  return body
}

function buildBody(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  switch (normalizeWorkerModelId(context.providerInput.modelId)) {
    case FAL_VIDEO_MODEL_IDS.KLING_V3_PRO:
    case FAL_VIDEO_MODEL_IDS.KLING_O3_PRO:
      return buildKlingV3Pro(context, mode)
    case FAL_VIDEO_MODEL_IDS.VEO_31:
      return buildVeo31(context, mode)
    case FAL_VIDEO_MODEL_IDS.HAPPYHORSE_10:
      return buildHappyHorse10(context, mode)
    case FAL_VIDEO_MODEL_IDS.WAN_30:
      return buildWan30(context, mode)
    case FAL_VIDEO_MODEL_IDS.WAN_30_REFERENCE:
      return buildWan30Reference(context)
    case FAL_VIDEO_MODEL_IDS.LTX_23:
      return buildLtx23(context, mode)
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20:
      return buildSeedance20(context, mode, ['480p', '720p', '1080p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20_FAST:
      return buildSeedance20(context, mode, ['480p', '720p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20_REFERENCE:
      return buildSeedanceReference(context, ['480p', '720p', '1080p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20_FAST_REFERENCE:
      return buildSeedanceReference(context, ['480p', '720p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_25:
      return buildSeedance25(context, mode)
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_25_REFERENCE:
      return buildSeedanceReference(context, ['480p', '720p'], {
        images: 30,
        videos: 10,
        audio: 10,
        total: 50,
        maxDuration: 30,
      })
    default:
      throw new Error(
        `Unsupported FAL video model for queue body construction: ${context.providerInput.modelId}`,
      )
  }
}

/**
 * seed 支持矩阵（spike 2026-06-20，fal 一手 OpenAPI；2026-08-25 补 Wan 3.0）：
 * Seedance 全族 + Veo base(text-to-video) + HappyHorse v1.1 + Wan 3.0 三端点
 * accept `seed`; Veo reference(image-to-video) / Kling V3 Pro / LTX 2.3 do not.
 */
function applySeedIfSupported(
  body: Record<string, unknown>,
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): void {
  const seed = context.providerInput.seed
  if (typeof seed !== 'number' || seed < 0) return
  const modelId = normalizeWorkerModelId(context.providerInput.modelId)
  const supportsSeed =
    modelId === FAL_VIDEO_MODEL_IDS.SEEDANCE_20 ||
    modelId === FAL_VIDEO_MODEL_IDS.SEEDANCE_20_FAST ||
    modelId === FAL_VIDEO_MODEL_IDS.SEEDANCE_20_REFERENCE ||
    modelId === FAL_VIDEO_MODEL_IDS.SEEDANCE_20_FAST_REFERENCE ||
    modelId === FAL_VIDEO_MODEL_IDS.HAPPYHORSE_10 ||
    // Wan 3.0 declares `seed` on all three endpoints; unlike Veo, reference
    // inputs do not remove it.
    modelId === FAL_VIDEO_MODEL_IDS.WAN_30 ||
    modelId === FAL_VIDEO_MODEL_IDS.WAN_30_REFERENCE ||
    (modelId === FAL_VIDEO_MODEL_IDS.VEO_31 && mode === 'text-to-video')
  if (supportsSeed) {
    body.seed = seed
  }
}

export function buildFalWorkerQueueRequest(
  context: FalWorkerVideoRequestContext,
): FalWorkerVideoQueueRequest {
  const mode = getMode(context)
  const endpointModelId = getEndpointModelId(context, mode)
  const body = buildBody(context, mode)
  applySeedIfSupported(body, context, mode)

  return {
    endpointModelId,
    input: body,
    mode,
    isDocumentationVerified: true,
  }
}
