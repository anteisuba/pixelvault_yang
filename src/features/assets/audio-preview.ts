import {
  DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE,
  getAudioAssetPreviewImage,
} from '@/features/assets/constants'
import type { GenerationRecord } from '@/types'

/**
 * 音频封面回退链（page §6）—— 整页素材库与挑选弹框同一份：
 * 缩略图 → 预览图 → 快照里的音色封面 / 封面 → 按模型 + 音色找的内置图 → 默认图。
 *
 * 返回**全部**候选（已去掉空值）：整页那边某张加载失败就往下一张走；挑选弹框取第一张。
 */
export function getAudioPreviewCandidates(
  generation: GenerationRecord,
): string[] {
  const snapshot = isPlainObject(generation.snapshot)
    ? generation.snapshot
    : null
  const voiceId = getSnapshotString(snapshot, 'voiceId')
  const voiceCoverImage =
    getSnapshotString(snapshot, 'voiceCoverImage') ??
    getSnapshotString(snapshot, 'coverImage')

  return [
    generation.thumbnailUrl,
    generation.previewUrl,
    voiceCoverImage,
    getAudioAssetPreviewImage(generation.model, voiceId),
    DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE,
  ].filter((url): url is string => Boolean(url))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSnapshotString(
  snapshot: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!snapshot) return null
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
