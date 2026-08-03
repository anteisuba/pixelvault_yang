import { describe, expect, it, vi } from 'vitest'

import { CANVAS_ADD_CATALOG } from '@/constants/canvas-add-catalog'
import {
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_TYPE_IDS,
} from '@/constants/node-types'

vi.mock('./BackgroundDetailBody', () => ({
  BackgroundDetailBody: () => null,
}))

vi.mock('./CharacterDetailBody', () => ({
  CharacterDetailBody: () => null,
}))

vi.mock('./FrameDetailBody', () => ({
  FrameDetailBody: () => null,
}))

vi.mock('./LooseImageDetailBody', () => ({
  LooseImageDetailBody: () => null,
}))

vi.mock('./ShotDetailBody', () => ({
  ShotDetailBody: () => null,
}))

vi.mock('./ShotTextDetailBody', () => ({
  ShotTextDetailBody: () => null,
}))

vi.mock('./VideoDetailBody', () => ({
  VideoDetailBody: () => null,
}))

vi.mock('./VideoMergeDetailBody', () => ({
  VideoMergeDetailBody: () => null,
}))

vi.mock('./VideoReferenceDetailBody', () => ({
  VideoReferenceDetailBody: () => null,
}))

vi.mock('./VoiceDetailBody', () => ({
  VoiceDetailBody: () => null,
}))

import { LooseImageDetailBody } from './LooseImageDetailBody'
import { VideoMergeDetailBody } from './VideoMergeDetailBody'
import { VideoReferenceDetailBody } from './VideoReferenceDetailBody'
import { NODE_DETAIL_SLOT_REGISTRY, NODE_DETAIL_REGISTRY } from './registry'

describe('NODE_DETAIL_REGISTRY', () => {
  it('uses the upload body for reference-video nodes', () => {
    expect(NODE_DETAIL_REGISTRY[NODE_TYPE_IDS.videoReference]).toBe(
      VideoReferenceDetailBody,
    )
  })

  it('uses the real merge body for video-merge nodes', () => {
    expect(NODE_DETAIL_REGISTRY[NODE_TYPE_IDS.videoMerge]).toBe(
      VideoMergeDetailBody,
    )
  })

  // S5d ③: a role-less image node presents as `image` itself now.
  it('uses the loose-image body for the unified image node type', () => {
    expect(NODE_DETAIL_REGISTRY[NODE_TYPE_IDS.image]).toBe(LooseImageDetailBody)
  })

  /**
   * ⚠ 断言的**意图**没变：＋添加 菜单能建出来的类型，不许落 `GenericDetailBody` 兜底。
   * 变的是它要查几张表 —— 方向 E 迁移期两张表并存（槽表 + legacy 表），一个族只会
   * 在其中一张里。迁移完成后（S8）两表合一成穷举 Record，这条会跟着简化。
   */
  it('gives every exposed add-catalog intent a dedicated detail body', () => {
    for (const item of CANVAS_ADD_CATALOG.flatMap((group) => group.items)) {
      const presentationType = item.role
        ? NODE_IMAGE_ROLE_TO_LEGACY_TYPE[item.role]
        : item.nodeType
      const hasBody =
        NODE_DETAIL_SLOT_REGISTRY[presentationType] ??
        NODE_DETAIL_REGISTRY[presentationType]
      expect(
        hasBody,
        `${item.id} must not fall through to GenericDetailBody`,
      ).toBeDefined()
    }
  })

  it('迁到槽表的族从 legacy 表里移除，避免两张表指向同一个组件的两种签名', () => {
    for (const type of Object.keys(NODE_DETAIL_SLOT_REGISTRY)) {
      expect(
        NODE_DETAIL_REGISTRY[type as keyof typeof NODE_DETAIL_REGISTRY],
        `${type} 已在槽表里，不该同时留在 legacy 表`,
      ).toBeUndefined()
    }
  })
})
