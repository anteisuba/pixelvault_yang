import type { AspectRatio } from '@/constants/config'
import { VIDEO_GENERATION } from '@/constants/config'

/**
 * Every resolution any video model can emit.
 */
export const VIDEO_RESOLUTIONS = [
  '480p',
  '540p',
  '720p',
  '768p',
  '1080p',
  '2k',
  '4k',
] as const
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]

/**
 * What a model gets when it declares no `supportedResolutions` of its own.
 * Deliberately **not** `VIDEO_RESOLUTIONS`: widening the union must not
 * silently hand higher resolutions to models that never opted in.
 */
export const DEFAULT_VIDEO_RESOLUTIONS = [
  '480p',
  '540p',
  '720p',
  '1080p',
] as const satisfies readonly VideoResolution[]

export const VIDEO_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
] as const satisfies readonly AspectRatio[]

export const DEFAULT_VIDEO_DURATIONS = VIDEO_GENERATION.DURATION_OPTIONS

export function isVideoResolution(value: string): value is VideoResolution {
  return VIDEO_RESOLUTIONS.includes(value as VideoResolution)
}
