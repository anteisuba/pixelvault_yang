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
import { isNodeDetailFamily, NODE_DETAIL_SLOT_REGISTRY } from './registry'

describe('NODE_DETAIL_SLOT_REGISTRY', () => {
  it('uses the upload body for reference-video nodes', () => {
    expect(NODE_DETAIL_SLOT_REGISTRY[NODE_TYPE_IDS.videoReference]).toBe(
      VideoReferenceDetailBody,
    )
  })

  it('uses the real merge body for video-merge nodes', () => {
    expect(NODE_DETAIL_SLOT_REGISTRY[NODE_TYPE_IDS.videoMerge]).toBe(
      VideoMergeDetailBody,
    )
  })

  // S5d ③: a role-less image node presents as `image` itself now.
  // ⚠ 这条守的是「散图不许落回 shot 默认」——`图片（素材）` 与 `镜头图（生成）`
  //   在 ＋添加 菜单上是两个东西。
  it('uses the loose-image body for the unified image node type', () => {
    expect(NODE_DETAIL_SLOT_REGISTRY[NODE_TYPE_IDS.image]).toBe(
      LooseImageDetailBody,
    )
  })

  /**
   * ⚠ 断言的**意图**从第一天起没变：＋添加 菜单能建出来的类型，不许落进一个
   * 谁也没为它设计过的面板。变的只是它怎么被保证：
   * S3–S7 期间靠「两张表里至少有一张有它」，S8 起靠**穷举的 Record 类型**——
   * 少一个族编译就过不去。这条测试因此降级成一道运行时复核，
   * 真正的闸门在 `registry.ts` 的类型上。
   */
  it('gives every exposed add-catalog intent a dedicated detail body', () => {
    for (const item of CANVAS_ADD_CATALOG.flatMap((group) => group.items)) {
      const presentationType = item.role
        ? NODE_IMAGE_ROLE_TO_LEGACY_TYPE[item.role]
        : item.nodeType
      expect(
        isNodeDetailFamily(presentationType),
        `${item.id} 必须有专属 detail body`,
      ).toBe(true)
    }
  })

  /**
   * ⚠ 已退役的旧 planner（composer / agent）**不该**出现在槽表里。
   * 它们的 enum 值必须留着（存量项目还有这类节点，删了整份 state parse 失败），
   * 但两条水化路径都在渲染前把它们剥掉 —— 给它们编一个 body 只会是死代码。
   */
  it('已退役的 composer / agent 不进槽表', () => {
    expect(isNodeDetailFamily(NODE_TYPE_IDS.composer)).toBe(false)
    expect(isNodeDetailFamily(NODE_TYPE_IDS.agent)).toBe(false)
  })
})
