import { describe, expect, it } from 'vitest'

import {
  CANVAS_ADD_CATALOG,
  CANVAS_ADD_GROUP_IDS,
  CANVAS_ADD_INTENT_IDS,
  getCanvasAddCatalogItem,
} from '@/constants/canvas-add-catalog'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'

describe('canvas add catalog', () => {
  it('按 v4 四类分组，顺序是依赖顺序（先有字，最后合成动的）', () => {
    expect(CANVAS_ADD_CATALOG.map((group) => group.id)).toEqual([
      CANVAS_ADD_GROUP_IDS.text,
      CANVAS_ADD_GROUP_IDS.image,
      CANVAS_ADD_GROUP_IDS.audio,
      CANVAS_ADD_GROUP_IDS.video,
    ])
  })

  it('11 项，id 唯一，且每一项都落在自己那一组的 kind 上', () => {
    const items = CANVAS_ADD_CATALOG.flatMap((group) => group.items)
    expect(items).toHaveLength(11)
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
    // 分组 id 就是 kind —— 分错组等于菜单说的和建出来的不是一件事。
    for (const group of CANVAS_ADD_CATALOG) {
      for (const item of group.items) {
        expect(item.v4.kind).toBe(group.id)
      }
    }
  })

  it('每一项的 v4 身份逐条钉死（菜单说什么就建什么）', () => {
    const expected: Record<string, { kind: string; subtype: string }> = {
      [CANVAS_ADD_INTENT_IDS.textScript]: {
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
      },
      [CANVAS_ADD_INTENT_IDS.textRule]: {
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.rule,
      },
      [CANVAS_ADD_INTENT_IDS.textNote]: {
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.shotNote,
      },
      [CANVAS_ADD_INTENT_IDS.imageShot]: {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
      },
      [CANVAS_ADD_INTENT_IDS.imageCharacter]: {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character,
      },
      [CANVAS_ADD_INTENT_IDS.imageBackground]: {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.background,
      },
      [CANVAS_ADD_INTENT_IDS.imageResult]: {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result,
      },
      [CANVAS_ADD_INTENT_IDS.audioVoice]: {
        kind: NODE_MEDIA_KIND_IDS.audio,
        subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
      },
      // 「音色」是 `audio.voice` 的一种**用法**（连进 timbre 口），不是第四个子型。
      [CANVAS_ADD_INTENT_IDS.audioTimbre]: {
        kind: NODE_MEDIA_KIND_IDS.audio,
        subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
      },
      [CANVAS_ADD_INTENT_IDS.videoShot]: {
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      },
      [CANVAS_ADD_INTENT_IDS.videoClip]: {
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
      },
    }
    for (const [intentId, v4] of Object.entries(expected)) {
      expect(
        getCanvasAddCatalogItem(intentId as keyof typeof expected as never).v4,
      ).toEqual(v4)
    }
  })

  /**
   * 首/尾帧不是一种节点，而是一张图**连进镜头的哪个口**。造得出「注定没有槽的
   * 关键帧」的入口本身就是双轨的根（2026-08-09 owner「连根拔」）。
   */
  it('没有「关键帧」项 —— 首尾是槽不是节点', () => {
    const ids = CANVAS_ADD_CATALOG.flatMap((group) =>
      group.items.map((item) => item.id),
    )
    expect(ids.some((id) => id.includes('keyframe'))).toBe(false)
    expect(ids.some((id) => id.includes('frame'))).toBe(false)
  })

  it('未知意图不静默兜底，直接抛', () => {
    expect(() => getCanvasAddCatalogItem('image.nope' as never)).toThrow()
  })
})
