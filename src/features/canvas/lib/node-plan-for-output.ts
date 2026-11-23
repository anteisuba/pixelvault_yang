import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { GenerationRecord } from '@/types'
import type { NodeV4Data } from '@/types/node-workflow'

/**
 * 素材库里的一件产物 → 落成哪种画布卡。外壳素材库、剪辑台素材页、手机加节点抽屉
 * 「从素材库选」三处共用这一张判据表，⛔ 各写一份、⛔ 按扩展名猜。
 */
export function planNodeForOutput(outputType: GenerationRecord['outputType']): {
  readonly kind: NodeV4Data['kind']
  readonly subtype: NodeV4Data['subtype']
} {
  if (outputType === 'VIDEO') {
    return {
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
    }
  }
  if (outputType === 'AUDIO') {
    return {
      kind: NODE_MEDIA_KIND_IDS.audio,
      subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    }
  }
  return {
    kind: NODE_MEDIA_KIND_IDS.image,
    subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result,
  }
}
