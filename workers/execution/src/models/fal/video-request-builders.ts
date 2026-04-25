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
    duration?: number
    referenceImage?: string
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
  SEEDANCE_PRO: 'seedance-pro',
  VEO_3: 'veo-3',
  PIKA_V22: 'pika-v2.2',
  RUNWAY_GEN3: 'runway-gen3',
} as const

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

function pickString(
  value: string | undefined,
  allowed: readonly string[],
  fallback: string,
): string {
  return value && allowed.includes(value) ? value : fallback
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
    duration: pickClampedStringDuration(providerInput.duration, 3, 15),
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
    duration: pickVeoDuration(providerInput.duration),
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
    body.image_urls = [requireReferenceImage(context)]
  }

  return body
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
    duration: pickClampedStringDuration(providerInput.duration, 4, 15),
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

function buildSeedanceProV1(
  context: FalWorkerVideoRequestContext,
  mode: FalWorkerVideoMode,
): Record<string, unknown> {
  const { providerInput } = context
  const body: Record<string, unknown> = {
    prompt: providerInput.prompt,
    duration: pickStringDuration(providerInput.duration, [5, 10], 5),
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
    duration: pickStringDuration(providerInput.duration, [6, 10], 6),
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
    duration: pickLumaDuration(providerInput.duration),
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
    duration: pickNumberDuration(providerInput.duration, [5, 10], 5),
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
    duration: pickStringDuration(providerInput.duration, [5, 10], 5),
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
    duration: pickStringDuration(providerInput.duration, [5, 10, 15], 5),
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
  switch (context.providerInput.modelId) {
    case FAL_VIDEO_MODEL_IDS.KLING_V3_PRO:
      return buildKlingV3Pro(context, mode)
    case FAL_VIDEO_MODEL_IDS.VEO_3:
      return buildVeo31(context, mode)
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20:
      return buildSeedance20(context, mode, ['480p', '720p', '1080p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_20_FAST:
      return buildSeedance20(context, mode, ['480p', '720p'])
    case FAL_VIDEO_MODEL_IDS.SEEDANCE_PRO:
      return buildSeedanceProV1(context, mode)
    case FAL_VIDEO_MODEL_IDS.MINIMAX_VIDEO:
      return buildMiniMaxHailuo23(context, mode)
    case FAL_VIDEO_MODEL_IDS.LUMA_RAY_2:
      return buildLumaRay2(context)
    case FAL_VIDEO_MODEL_IDS.PIKA_V22:
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
