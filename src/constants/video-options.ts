import type { AspectRatio } from '@/constants/config'
import { VIDEO_GENERATION } from '@/constants/config'

export const VIDEO_RESOLUTIONS = ['480p', '540p', '720p', '1080p'] as const
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]

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
