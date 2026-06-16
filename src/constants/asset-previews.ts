import { AI_MODELS } from '@/constants/models/enum'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

export const DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE =
  '/asset-previews/audio-default.svg'

export const AUDIO_ASSET_PREVIEW_IMAGES_BY_VOICE_ID: Readonly<
  Record<string, string>
> = {}

export const AUDIO_ASSET_PREVIEW_IMAGES_BY_MODEL: Readonly<
  Record<string, string>
> = {}

export function getAudioAssetPreviewImage(
  modelId: string,
  voiceId?: string | null,
): string {
  if (voiceId) {
    const voicePreview = AUDIO_ASSET_PREVIEW_IMAGES_BY_VOICE_ID[voiceId]
    if (voicePreview) return voicePreview

    if (modelId === AI_MODELS.FISH_AUDIO_S2_PRO) {
      return `${AI_PROVIDER_ENDPOINTS.FISH_AUDIO_ASSETS}/coverimage/${voiceId}`
    }
  }

  return (
    AUDIO_ASSET_PREVIEW_IMAGES_BY_MODEL[modelId] ??
    DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE
  )
}
