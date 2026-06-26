/**
 * Capability-contract rebind preview (canvas-baseline §5.1, draft B2).
 *
 * When a video node switches model brand, its bound upstream references must be
 * re-mapped against the new model's capability contract: compatible bindings
 * map automatically; incompatible ones are surfaced ("将忽略"), never silently
 * dropped. Pure + React-free so it tests in isolation.
 *
 * Today the only capability-dependent binding is voice (audio): a model whose
 * audio mode is `reference` accepts voice cloning; an `auto` model generates its
 * own audio and ignores the voice binding. Image references (character /
 * background / shot) map on every surfaced video model, so they are always 'map'.
 */

import { getVideoAudioCapability } from '@/constants/video-model-capabilities'

export type VideoReferenceKind = 'character' | 'background' | 'shot' | 'voice'
export type VideoRebindStatus = 'map' | 'ignore'

export interface VideoRebindPreviewItem {
  kind: VideoReferenceKind
  status: VideoRebindStatus
}

export function computeVideoRebindPreview(
  referenceKinds: readonly VideoReferenceKind[],
  targetModelId: string | undefined,
): VideoRebindPreviewItem[] {
  const acceptsVoice =
    getVideoAudioCapability(targetModelId).mode === 'reference'
  return referenceKinds.map((kind) => ({
    kind,
    status: kind === 'voice' ? (acceptsVoice ? 'map' : 'ignore') : 'map',
  }))
}

export function hasIgnoredRebindings(
  items: readonly VideoRebindPreviewItem[],
): boolean {
  return items.some((item) => item.status === 'ignore')
}
