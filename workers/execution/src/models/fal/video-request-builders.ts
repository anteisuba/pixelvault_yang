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
  KLING_VIDEO: 'kling-video',
  KLING_V3_PRO: 'kling-v3-pro',
  MINIMAX_VIDEO: 'minimax-video',
  LUMA_RAY_2: 'luma-ray-2',
  WAN_VIDEO: 'wan-video',
  HUNYUAN_VIDEO: 'hunyuan-video',
  SEEDANCE_20: 'seedance-2.0',
  SEEDANCE_20_FAST: 'seedance-2.0-fast',
  SEEDANCE_20_REFERENCE: 'seedance-2.0-reference',
  SEEDANCE_20_FAST_REFERENCE: 'seedance-2.0-fast-reference',
  SEEDANCE_PRO: 'seedance-pro',
  VEO_31: 'veo-3.1',
  VIDU_Q3_PRO: 'vidu-q3-pro',
  PIKA_V25: 'pika-v2.5',
  RUNWAY_GEN3: 'runway-gen3',
} as const

const FAL_VIDEO_MODEL_ID_ALIASES: Record<string, string> = {
  'veo-3': FAL_VIDEO_MODEL_IDS.VEO_31,
  'pika-v2.2': FAL_VIDEO_MODEL_IDS.PIKA_V25,
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
const WAN_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const
const HUNYUAN_ASPECT_RATIOS = ['16:9', '9:16'] as const
const VIDU_Q3_ASPECT_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1'] as const

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

function pickLumaDuration(duration: number | undefined): string {
  const value = duration ?? FAL_VIDEO_DURATION_DEFAULT
  return value >= 9 ? '9s' : '5s'
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

function applyPromptOptimizer(
  body: Record<string, unknown>,
  context: FalWorkerVideoRequestContext,
): void {
  const value = readDefaultBoolean(
    context.providerInput.videoDefaults,
    'enablePromptOptimizer',
  )
  if (value !== undefined) {
    body.prompt_optimizer = value
  }
}

function getMode(context: FalWorkerVideoRequestContext): FalWorkerVideoMode {
  const { providerInput } = context
  if (providerInput.modelId === FAL_VIDEO_MODEL_IDS.RUNWAY_GEN3) {
    return 'image-to-video'
  }
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
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ?? true,
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
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ?? true,
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

function buildViduQ3Pro(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    duration: pickClampedNumberDuration(
      asNumericDuration(providerInput.duration),
      1,
      16,
    ),
    resolution:
      pickResolution(
        providerInput.resolution,
        providerInput.videoDefaults,
        ['360p', '540p', '720p', '1080p'],
        '720p',
      ) ?? '720p',
    audio:
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ?? true,
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  } else {
    body.aspect_ratio = pickString(
      providerInput.aspectRatio,
      VIDU_Q3_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

/**
 * Seedance is the only fal video endpoint that understands the literal
 * 'auto' token for duration — let it pass through verbatim.
 */
function pickSeedanceDuration(duration: number | 'auto' | undefined): string {
  if (duration === 'auto') return 'auto'
  return pickClampedStringDuration(asNumericDuration(duration), 4, 15)
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
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ?? true,
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  }

  return body
}

/**
 * @Audio1..@Audio9 references in a prompt mean the user already wired audio
 * clips themselves; we leave the prompt alone in that case.
 */
function promptReferencesAudio(prompt: string): boolean {
  return /@Audio[1-9]\b/.test(prompt)
}

function promptReferencesVideo(prompt: string): boolean {
  return /@Video[1-9]\b/.test(prompt)
}

interface AudioPrefixBinding {
  url: string
  characterName?: string
}

function buildAudioReferencePrefix(
  bindings: readonly AudioPrefixBinding[],
): string {
  const tokens: string[] = []
  for (let i = 0; i < bindings.length && i < 3; i += 1) {
    const slot = `@Audio${i + 1}`
    const name = bindings[i]?.characterName?.trim()
    tokens.push(name ? `${name} (${slot})` : slot)
  }
  return tokens.join(' ')
}

function buildVideoReferencePrefix(videoCount: number): string {
  const refs: string[] = []
  for (let i = 1; i <= videoCount && i <= 3; i += 1) {
    refs.push(`@Video${i}`)
  }
  return refs.join(' ')
}

function buildSeedanceReference(
  context: FalWorkerVideoRequestContext,
  allowedResolutions: readonly string[],
): Record<string, unknown> {
  const { providerInput } = context
  // Prefer audioBindings (carries character names from the harvest) over
  // bare audioUrls. Callers that don't know about bindings still work via
  // the audioUrls fallback.
  const audioBindings =
    providerInput.audioBindings && providerInput.audioBindings.length > 0
      ? providerInput.audioBindings.slice(0, 3)
      : providerInput.audioUrls && providerInput.audioUrls.length > 0
        ? providerInput.audioUrls.slice(0, 3).map((url) => ({ url }))
        : []
  const audioUrls = audioBindings.map((binding) => binding.url)
  const videoUrls =
    providerInput.videoUrls && providerInput.videoUrls.length > 0
      ? providerInput.videoUrls.slice(0, 3)
      : []

  // Reference endpoint mandates image_urls (at least 1, up to 9). Use the
  // multi-reference array when provided, falling back to wrapping the single
  // referenceImage for legacy single-image callers.
  const imageRefs =
    providerInput.referenceImages && providerInput.referenceImages.length > 0
      ? providerInput.referenceImages
      : [requireReferenceImage(context)]
  // fal cross-modality cap ≤ 12 total — trim image_urls first so the
  // user-supplied audio + video references are never silently dropped.
  const maxImages = Math.max(1, 12 - videoUrls.length - audioUrls.length)
  const imageUrls = imageRefs.slice(0, Math.min(9, maxImages))

  let prompt = providerInput.prompt
  if (audioBindings.length > 0 && !promptReferencesAudio(prompt)) {
    prompt = `${buildAudioReferencePrefix(audioBindings)} ${prompt}`.trim()
  }
  if (videoUrls.length > 0 && !promptReferencesVideo(prompt)) {
    prompt = `${buildVideoReferencePrefix(videoUrls.length)} ${prompt}`.trim()
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
    duration: pickSeedanceDuration(providerInput.duration),
    aspect_ratio: pickString(
      providerInput.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    ),
    generate_audio:
      readDefaultBoolean(providerInput.videoDefaults, 'generateAudio') ?? true,
  }
  body.image_urls = imageUrls
  if (videoUrls.length > 0) {
    body.video_urls = videoUrls
  }
  if (audioUrls.length > 0) {
    body.audio_urls = audioUrls
  }
  return body
}

function buildSeedanceProV1(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    duration: pickStringDuration(
      asNumericDuration(providerInput.duration),
      [5, 10],
      5,
    ),
  }

  const resolution = pickResolution(
    providerInput.resolution,
    providerInput.videoDefaults,
    ['480p', '720p', '1080p'],
  )
  if (resolution) {
    body.resolution = resolution
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  } else {
    body.aspect_ratio = pickString(
      providerInput.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

function buildMiniMaxHailuo23(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    duration: pickStringDuration(
      asNumericDuration(providerInput.duration),
      [6, 10],
      6,
    ),
  }
  applyPromptOptimizer(body, context)

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  }

  return body
}

function buildLumaRay2(
  context: FalWorkerVideoRequestContext,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    aspect_ratio: pickString(
      providerInput.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    ),
    duration: pickLumaDuration(asNumericDuration(providerInput.duration)),
  }

  const resolution = pickResolution(
    providerInput.resolution,
    providerInput.videoDefaults,
    ['540p', '720p', '1080p', '4k'],
    '720p',
  )
  if (resolution) {
    body.resolution = resolution
  }

  return body
}

function buildPika25(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    duration: pickNumberDuration(
      asNumericDuration(providerInput.duration),
      [5, 10],
      5,
    ),
  }

  const resolution = pickResolution(
    providerInput.resolution,
    providerInput.videoDefaults,
    ['480p', '720p', '1080p'],
  )
  if (resolution) {
    body.resolution = resolution
  }

  applyNegativePrompt(body, context)

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  }

  return body
}

function buildKlingV21Master(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    duration: pickStringDuration(
      asNumericDuration(providerInput.duration),
      [5, 10],
      5,
    ),
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
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

function buildRunwayGen3(
  context: FalWorkerVideoRequestContext,
): Record<string, unknown> {
  const { providerInput } = context
  // TODO(video-payload-audit): exact fal.ai Runway Gen-3 Turbo schema page
  // currently returns 404. Preserve the legacy body while logging it at submit.
  return {
    prompt: providerInput.prompt,
    image_url: requireReferenceImage(context),
    aspect_ratio: providerInput.aspectRatio,
    duration: String(providerInput.duration ?? FAL_VIDEO_DURATION_DEFAULT),
  }
}

function buildWan26(
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
    duration: pickStringDuration(
      asNumericDuration(providerInput.duration),
      [5, 10, 15],
      5,
    ),
  }

  applyNegativePrompt(body, context)

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
  } else {
    body.aspect_ratio = pickString(
      providerInput.aspectRatio,
      WAN_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

function buildHunyuanVideo(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    aspect_ratio: pickString(
      providerInput.aspectRatio,
      HUNYUAN_ASPECT_RATIOS,
      '16:9',
    ),
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(context)
    const resolution = pickResolution(
      providerInput.resolution,
      providerInput.videoDefaults,
      ['720p', '1080p'],
      '720p',
    )
    if (resolution) {
      body.resolution = resolution
    }
  }

  return body
}

function buildBody(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  switch (normalizeWorkerModelId(context.providerInput.modelId)) {
    case FAL_VIDEO_MODEL_IDS.KLING_V3_PRO:
      return buildKlingV3Pro(context, mode)
    case FAL_VIDEO_MODEL_IDS.VEO_31:
      return buildVeo31(context, mode)
    case FAL_VIDEO_MODEL_IDS.VIDU_Q3_PRO:
      return buildViduQ3Pro(context, mode)
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20:
      return buildSeedance20(context, mode, ['480p', '720p', '1080p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20_FAST:
      return buildSeedance20(context, mode, ['480p', '720p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20_REFERENCE:
      return buildSeedanceReference(context, ['480p', '720p', '1080p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20_FAST_REFERENCE:
      return buildSeedanceReference(context, ['480p', '720p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_PRO:
      return buildSeedanceProV1(context, mode)
    case FAL_VIDEO_MODEL_IDS.MINIMAX_VIDEO:
      return buildMiniMaxHailuo23(context, mode)
    case FAL_VIDEO_MODEL_IDS.LUMA_RAY_2:
      return buildLumaRay2(context)
    case FAL_VIDEO_MODEL_IDS.PIKA_V25:
      return buildPika25(context, mode)
    case FAL_VIDEO_MODEL_IDS.KLING_VIDEO:
      return buildKlingV21Master(context, mode)
    case FAL_VIDEO_MODEL_IDS.RUNWAY_GEN3:
      return buildRunwayGen3(context)
    case FAL_VIDEO_MODEL_IDS.WAN_VIDEO:
      return buildWan26(context, mode)
    case FAL_VIDEO_MODEL_IDS.HUNYUAN_VIDEO:
      return buildHunyuanVideo(context, mode)
    default:
      throw new Error(
        `Unsupported FAL video model for queue body construction: ${context.providerInput.modelId}`,
      )
  }
}

export function buildFalWorkerQueueRequest(
  context: FalWorkerVideoRequestContext,
): FalWorkerVideoQueueRequest {
  const mode = getMode(context)
  const endpointModelId = getEndpointModelId(context, mode)
  const body = buildBody(context, mode)

  return {
    endpointModelId,
    input: body,
    mode,
    isDocumentationVerified:
      context.providerInput.modelId !== FAL_VIDEO_MODEL_IDS.RUNWAY_GEN3,
  }
}
