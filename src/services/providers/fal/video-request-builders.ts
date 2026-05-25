import 'server-only'

import { VIDEO_GENERATION, type AspectRatio } from '@/constants/config'
import {
  AI_MODELS,
  normalizeModelId,
  type VideoDefaults,
} from '@/constants/models'
import { FAL_KLING_V3_ELEMENT_REFERENCE_IMAGES_MAX } from '@/constants/provider-capabilities'
import type { VideoResolution } from '@/constants/video-options'

import { ProviderError } from '@/services/providers/types'

export type FalVideoMode = 'text-to-video' | 'image-to-video'

export interface FalVideoRequestBuilderInput {
  prompt: string
  modelId: string
  externalModelId: string
  aspectRatio: AspectRatio
  duration?: number
  /** Single reference image for single-frame i2v models (Kling, Seedance...) */
  referenceImage?: string
  /**
   * Multi-reference array — only consumed by builders for models whose fal
   * endpoint takes `image_urls: string[]` (Veo 3.1 reference-to-video).
   * Other builders ignore this and read `referenceImage`.
   */
  referenceImages?: string[]
  negativePrompt?: string
  resolution?: VideoResolution
  i2vModelId?: string
  videoDefaults?: VideoDefaults
  /**
   * Voice id propagated from upstream voice node. Builders for models with
   * `audio.mode === 'native'` (Veo 3.1) emit it as `voice_id`; others ignore it.
   */
  voiceId?: string
}

export interface FalVideoQueueRequest {
  endpointModelId: string
  input: Record<string, unknown>
  mode: FalVideoMode
  isDocumentationVerified: boolean
}

const FAL_VIDEO_DURATION_DEFAULT = VIDEO_GENERATION.DEFAULT_DURATION

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

function pickResolution(
  resolution: VideoResolution | undefined,
  defaults: VideoDefaults | undefined,
  allowed: readonly string[],
  fallback?: string,
): string | undefined {
  const value = resolution ?? defaults?.resolution
  if (value && allowed.includes(value)) return value
  return fallback
}

function applyNegativePrompt(
  body: Record<string, unknown>,
  input: FalVideoRequestBuilderInput,
): void {
  const value = input.negativePrompt ?? input.videoDefaults?.negativePrompt
  if (value) {
    body.negative_prompt = value
  }
}

function applyCfgScale(
  body: Record<string, unknown>,
  input: FalVideoRequestBuilderInput,
): void {
  if (input.videoDefaults?.cfgScale !== undefined) {
    body.cfg_scale = input.videoDefaults.cfgScale
  }
}

function applyPromptOptimizer(
  body: Record<string, unknown>,
  input: FalVideoRequestBuilderInput,
): void {
  if (input.videoDefaults?.enablePromptOptimizer !== undefined) {
    body.prompt_optimizer = input.videoDefaults.enablePromptOptimizer
  }
}

function getMode(input: FalVideoRequestBuilderInput): FalVideoMode {
  if (input.modelId === AI_MODELS.RUNWAY_GEN3) return 'image-to-video'
  return input.referenceImage && input.i2vModelId
    ? 'image-to-video'
    : 'text-to-video'
}

function getEndpointModelId(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): string {
  if (mode === 'image-to-video' && input.i2vModelId) {
    return input.i2vModelId
  }
  return input.externalModelId
}

function requireReferenceImage(input: FalVideoRequestBuilderInput): string {
  if (!input.referenceImage) {
    throw new ProviderError(
      'fal.ai',
      400,
      `Model ${input.modelId} requires a reference image for image-to-video.`,
    )
  }
  return input.referenceImage
}

function getAdditionalKlingV3ReferenceImages(
  input: FalVideoRequestBuilderInput,
  startImage: string,
): string[] {
  const refs =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : [startImage]
  const additionalRefs = refs[0] === startImage ? refs.slice(1) : refs
  return additionalRefs.slice(0, FAL_KLING_V3_ELEMENT_REFERENCE_IMAGES_MAX)
}

function buildKlingV3Pro(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: pickClampedStringDuration(input.duration, 3, 15),
    generate_audio: input.videoDefaults?.generateAudio ?? true,
  }

  if (mode === 'image-to-video') {
    const startImage = requireReferenceImage(input)
    const additionalRefs = getAdditionalKlingV3ReferenceImages(
      input,
      startImage,
    )
    body.start_image_url = startImage
    if (additionalRefs.length > 0) {
      body.elements = [
        {
          frontal_image_url: startImage,
          reference_image_urls: additionalRefs,
        },
      ]
    }
  } else {
    body.aspect_ratio = pickString(
      input.aspectRatio,
      FAL_TEXT_ASPECT_RATIOS,
      '16:9',
    )
  }

  applyNegativePrompt(body, input)
  applyCfgScale(body, input)
  return body
}

function buildVeo31(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: pickString(input.aspectRatio, ['16:9', '9:16'], '16:9'),
    duration: pickVeoDuration(input.duration),
    resolution:
      pickResolution(
        input.resolution,
        input.videoDefaults,
        ['720p', '1080p', '4k'],
        '720p',
      ) ?? '720p',
    generate_audio: input.videoDefaults?.generateAudio ?? true,
  }

  applyNegativePrompt(body, input)

  if (input.voiceId) {
    body.voice_id = input.voiceId
  }

  if (mode === 'image-to-video') {
    // Veo 3.1 reference-to-video takes up to 3 subject/scene refs via
    // `image_urls`. Pull from `referenceImages` when present; fall back to
    // wrapping the single `referenceImage` so older single-image callers
    // (e.g. video-pipeline scene-by-scene generation) keep working.
    const refs =
      input.referenceImages && input.referenceImages.length > 0
        ? input.referenceImages
        : [requireReferenceImage(input)]
    body.image_urls = refs.slice(0, 3)
  }

  return body
}

function buildViduQ3Pro(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: pickClampedNumberDuration(input.duration, 1, 16),
    resolution:
      pickResolution(
        input.resolution,
        input.videoDefaults,
        ['360p', '540p', '720p', '1080p'],
        '720p',
      ) ?? '720p',
    audio: input.videoDefaults?.generateAudio ?? true,
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  } else {
    body.aspect_ratio = pickString(
      input.aspectRatio,
      VIDU_Q3_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

function buildSeedance20(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
  allowedResolutions: readonly string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    resolution:
      pickResolution(
        input.resolution,
        input.videoDefaults,
        allowedResolutions,
        '720p',
      ) ?? '720p',
    duration: pickClampedStringDuration(input.duration, 4, 15),
    aspect_ratio: pickString(
      input.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    ),
    generate_audio: input.videoDefaults?.generateAudio ?? true,
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  }

  return body
}

function buildSeedanceProV1(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: pickStringDuration(input.duration, [5, 10], 5),
  }

  const resolution = pickResolution(input.resolution, input.videoDefaults, [
    '480p',
    '720p',
    '1080p',
  ])
  if (resolution) {
    body.resolution = resolution
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  } else {
    body.aspect_ratio = pickString(
      input.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

function buildMiniMaxHailuo23(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: pickStringDuration(input.duration, [6, 10], 6),
  }
  applyPromptOptimizer(body, input)

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  }

  return body
}

function buildLumaRay2(
  input: FalVideoRequestBuilderInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: pickString(
      input.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    ),
    duration: pickLumaDuration(input.duration),
  }

  const resolution = pickResolution(
    input.resolution,
    input.videoDefaults,
    ['540p', '720p', '1080p', '4k'],
    '720p',
  )
  if (resolution) {
    body.resolution = resolution
  }

  return body
}

function buildPika25(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: pickNumberDuration(input.duration, [5, 10], 5),
  }

  const resolution = pickResolution(input.resolution, input.videoDefaults, [
    '480p',
    '720p',
    '1080p',
  ])
  if (resolution) {
    body.resolution = resolution
  }

  applyNegativePrompt(body, input)

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  }

  return body
}

function buildKlingV21Master(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: pickStringDuration(input.duration, [5, 10], 5),
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  } else {
    body.aspect_ratio = pickString(
      input.aspectRatio,
      FAL_TEXT_ASPECT_RATIOS,
      '16:9',
    )
  }

  applyNegativePrompt(body, input)
  applyCfgScale(body, input)
  return body
}

function buildRunwayGen3(
  input: FalVideoRequestBuilderInput,
): Record<string, unknown> {
  // TODO(video-payload-audit): exact fal.ai Runway Gen-3 Turbo schema page
  // currently returns 404. Preserve the legacy body while logging it at submit.
  return {
    prompt: input.prompt,
    image_url: requireReferenceImage(input),
    aspect_ratio: input.aspectRatio,
    duration: String(input.duration ?? FAL_VIDEO_DURATION_DEFAULT),
  }
}

function buildWan26(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    resolution:
      pickResolution(
        input.resolution,
        input.videoDefaults,
        ['720p', '1080p'],
        '720p',
      ) ?? '720p',
    duration: pickStringDuration(input.duration, [5, 10, 15], 5),
  }

  applyNegativePrompt(body, input)

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  } else {
    body.aspect_ratio = pickString(input.aspectRatio, WAN_ASPECT_RATIOS, '16:9')
  }

  return body
}

function buildHunyuanVideo(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: pickString(input.aspectRatio, HUNYUAN_ASPECT_RATIOS, '16:9'),
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
    const resolution = pickResolution(
      input.resolution,
      input.videoDefaults,
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
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  switch (normalizeModelId(input.modelId)) {
    case AI_MODELS.KLING_V3_PRO:
      return buildKlingV3Pro(input, mode)
    case AI_MODELS.VEO_31:
      return buildVeo31(input, mode)
    case AI_MODELS.VIDU_Q3_PRO:
      return buildViduQ3Pro(input, mode)
    case AI_MODELS.SEEDANCE_20:
      return buildSeedance20(input, mode, ['480p', '720p', '1080p'])
    case AI_MODELS.SEEDANCE_20_FAST:
      return buildSeedance20(input, mode, ['480p', '720p'])
    case AI_MODELS.SEEDANCE_PRO:
      return buildSeedanceProV1(input, mode)
    case AI_MODELS.MINIMAX_VIDEO:
      return buildMiniMaxHailuo23(input, mode)
    case AI_MODELS.LUMA_RAY_2:
      return buildLumaRay2(input)
    case AI_MODELS.PIKA_V25:
      return buildPika25(input, mode)
    case AI_MODELS.KLING_VIDEO:
      return buildKlingV21Master(input, mode)
    case AI_MODELS.RUNWAY_GEN3:
      return buildRunwayGen3(input)
    case AI_MODELS.WAN_VIDEO:
      return buildWan26(input, mode)
    case AI_MODELS.HUNYUAN_VIDEO:
      return buildHunyuanVideo(input, mode)
    default:
      throw new ProviderError(
        'fal.ai',
        400,
        `Unsupported FAL video model for queue body construction: ${input.modelId}`,
      )
  }
}

export function buildFalVideoQueueRequest(
  input: FalVideoRequestBuilderInput,
): FalVideoQueueRequest {
  const mode = getMode(input)
  const endpointModelId = getEndpointModelId(input, mode)
  const body = buildBody(input, mode)

  return {
    endpointModelId,
    input: body,
    mode,
    isDocumentationVerified: input.modelId !== AI_MODELS.RUNWAY_GEN3,
  }
}
