import 'server-only'

import { VIDEO_GENERATION, type AspectRatio } from '@/constants/config'
import {
  AI_MODELS,
  normalizeModelId,
  type VideoDefaults,
} from '@/constants/models'
import type { VideoResolution } from '@/constants/video-options'

import { ProviderError } from '@/services/providers/types'

export type FalVideoMode = 'text-to-video' | 'image-to-video'

export interface FalVideoRequestBuilderInput {
  prompt: string
  modelId: string
  externalModelId: string
  aspectRatio: AspectRatio
  /**
   * Either a number of seconds (clamped per model — Seedance allows 4-15) or
   * the literal `'auto'` token. Builders that don't understand 'auto' coerce
   * it to their configured default. Only Seedance 2.0 endpoints emit 'auto'
   * verbatim to fal.
   */
  duration?: number | 'auto'
  /** Single reference image for single-frame i2v models (Kling, Seedance...) */
  referenceImage?: string
  /**
   * Multi-reference array — only consumed by builders for models whose fal
   * endpoint takes `image_urls: string[]` (Veo 3.1 reference-to-video).
   * Other builders ignore this and read `referenceImage`.
   */
  referenceImages?: string[]
  /**
   * Reference audio clips. Only consumed by builders for endpoints that
   * accept audio_urls (Seedance 2.0 reference-to-video). Other builders
   * ignore.
   */
  audioUrls?: string[]
  /**
   * Optional binding labels for each audio clip — when a voice node was
   * wired through a character node, the character's name travels with the
   * URL. Seedance Reference uses this to label the `@AudioN` token in the
   * auto-injected prompt prefix so the model knows which audio belongs to
   * which character. When omitted, `audioUrls` is used verbatim with
   * unlabeled `@AudioN` tokens.
   */
  audioBindings?: ReadonlyArray<{
    url: string
    characterName?: string
  }>
  /**
   * Reference video clips. Only consumed by builders for endpoints that
   * accept video_urls (Seedance 2.0 reference-to-video). Other builders
   * ignore. Providing a video reference unlocks the 0.6x price multiplier
   * on Seedance Reference.
   */
  videoUrls?: string[]
  negativePrompt?: string
  resolution?: VideoResolution
  i2vModelId?: string
  videoDefaults?: VideoDefaults
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
const HAPPYHORSE_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const
const LTX_ASPECT_RATIOS = ['16:9', '9:16'] as const

function pickString(
  value: string | undefined,
  allowed: readonly string[],
  fallback: string,
): string {
  return value && allowed.includes(value) ? value : fallback
}

/**
 * Strip the 'auto' literal — most builders don't understand it and need to
 * fall back to a fixed numeric default. Seedance builders special-case 'auto'
 * upstream of these pickers and never reach this coercion.
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

function getMode(input: FalVideoRequestBuilderInput): FalVideoMode {
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

function buildKlingV3Pro(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: pickClampedStringDuration(
      asNumericDuration(input.duration),
      3,
      15,
    ),
    generate_audio: input.videoDefaults?.generateAudio ?? true,
  }

  if (mode === 'image-to-video') {
    body.start_image_url = requireReferenceImage(input)
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
    duration: pickVeoDuration(asNumericDuration(input.duration)),
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

function buildHappyHorse10(
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
    duration: pickClampedNumberDuration(
      asNumericDuration(input.duration),
      3,
      15,
    ),
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  } else {
    body.aspect_ratio = pickString(
      input.aspectRatio,
      HAPPYHORSE_ASPECT_RATIOS,
      '16:9',
    )
  }

  return body
}

function buildLtx23(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: pickStringDuration(
      asNumericDuration(input.duration),
      [6, 8, 10],
      6,
    ),
    resolution:
      pickResolution(
        input.resolution,
        input.videoDefaults,
        ['1080p'],
        '1080p',
      ) ?? '1080p',
    generate_audio: input.videoDefaults?.generateAudio ?? true,
  }

  if (mode === 'image-to-video') {
    body.image_url = requireReferenceImage(input)
  } else {
    body.aspect_ratio = pickString(input.aspectRatio, LTX_ASPECT_RATIOS, '16:9')
  }

  return body
}

/**
 * Seedance is the only fal video endpoint that understands the literal
 * 'auto' token for duration — let it pass through verbatim. Everything else
 * gets clamped to 4-15 seconds.
 */
function pickSeedanceDuration(duration: number | 'auto' | undefined): string {
  if (duration === 'auto') return 'auto'
  return pickClampedStringDuration(asNumericDuration(duration), 4, 15)
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
    duration: pickSeedanceDuration(input.duration),
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

/**
 * Detects whether a prompt already references reference audio via the fal
 * `@AudioN` token convention. Case-sensitive per fal docs (`@Audio1`, not
 * `@audio1`). Matches @Audio1 through @Audio9.
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

/**
 * Build the auto-inject prefix when the user supplied audio_urls but forgot
 * to wire them into the prompt. For N URLs we prepend `@Audio1 @Audio2 ...`
 * so the fal model knows which references to pull from. When a binding has
 * a `characterName`, it's emitted as `"{Name} (@AudioN)"` instead of plain
 * `@AudioN` so multi-character scenes communicate "Alice's voice ≠ Bob's"
 * to the model. Users still write their own dialogue after the prefix.
 */
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

/**
 * Seedance 2.0 reference-to-video endpoint. Multimodal references:
 *   - image_urls: up to 9 images (≤30MB each)
 *   - video_urls: up to 3 videos (combined 2-15s, ≤50MB total)
 *   - audio_urls: up to 3 audio clips (combined ≤15s, ≤15MB each)
 *   - Cross-modality combined cap: ≤12 files total
 *
 * Auto-generates audio + lipsync per fal docs at
 * https://fal.ai/models/bytedance/seedance-2.0/reference-to-video
 *
 * When the caller passes `audioUrls` / `videoUrls` but the prompt doesn't
 * reference any `@AudioN` / `@VideoN` token, we auto-prepend the missing
 * references so the model actually consumes them. The user remains
 * responsible for the dialogue text (e.g. `"hello, my friend"`).
 */
function buildSeedanceReference(
  input: FalVideoRequestBuilderInput,
  allowedResolutions: readonly string[],
): Record<string, unknown> {
  // Prefer audioBindings when available (carry character names from the
  // Workbench harvest). Fall back to audioUrls verbatim for callers that
  // don't know about bindings (smoke tests, video-pipeline service, etc.).
  const audioBindings =
    input.audioBindings && input.audioBindings.length > 0
      ? input.audioBindings.slice(0, 3)
      : input.audioUrls && input.audioUrls.length > 0
        ? input.audioUrls.slice(0, 3).map((url) => ({ url }))
        : []
  const audioUrls = audioBindings.map((binding) => binding.url)
  const videoUrls =
    input.videoUrls && input.videoUrls.length > 0
      ? input.videoUrls.slice(0, 3)
      : []

  // Reference endpoint mandates image_urls (at least 1, up to 9). Use the
  // multi-reference array when provided, falling back to wrapping the single
  // referenceImage for legacy single-image callers.
  const imageRefs =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : [requireReferenceImage(input)]
  // fal cap: image_urls + video_urls + audio_urls ≤ 12 total. Trim images
  // first since the audio + video references are deliberately user-supplied
  // and shouldn't be silently dropped.
  const maxImages = Math.max(1, 12 - videoUrls.length - audioUrls.length)
  const imageUrls = imageRefs.slice(0, Math.min(9, maxImages))

  let prompt = input.prompt
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
        input.resolution,
        input.videoDefaults,
        allowedResolutions,
        '720p',
      ) ?? '720p',
    duration: pickSeedanceDuration(input.duration),
    aspect_ratio: pickString(
      input.aspectRatio,
      FAL_EXTENDED_ASPECT_RATIOS,
      '16:9',
    ),
    generate_audio: input.videoDefaults?.generateAudio ?? true,
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

function buildBody(
  input: FalVideoRequestBuilderInput,
  mode: FalVideoMode,
): Record<string, unknown> {
  switch (normalizeModelId(input.modelId)) {
    case AI_MODELS.KLING_V3_PRO:
      return buildKlingV3Pro(input, mode)
    case AI_MODELS.VEO_31:
      return buildVeo31(input, mode)
    case AI_MODELS.HAPPYHORSE_10:
      return buildHappyHorse10(input, mode)
    case AI_MODELS.LTX_23:
      return buildLtx23(input, mode)
    case AI_MODELS.SEEDANCE_20:
      return buildSeedance20(input, mode, ['480p', '720p', '1080p'])
    case AI_MODELS.SEEDANCE_20_FAST:
      return buildSeedance20(input, mode, ['480p', '720p'])
    case AI_MODELS.SEEDANCE_20_REFERENCE:
      return buildSeedanceReference(input, ['480p', '720p', '1080p'])
    case AI_MODELS.SEEDANCE_20_FAST_REFERENCE:
      return buildSeedanceReference(input, ['480p', '720p'])
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
    isDocumentationVerified: true,
  }
}
