import { describe, expect, it } from 'vitest'

import {
  CANVAS_ADD_CATALOG,
  CANVAS_ADD_GROUP_IDS,
  CANVAS_ADD_INTENT_IDS,
  getCanvasAddCatalogItem,
} from '@/constants/canvas-add-catalog'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

describe('canvas add catalog', () => {
  it('exposes four user-intent groups with ten unique entries', () => {
    expect(CANVAS_ADD_CATALOG.map((group) => group.id)).toEqual([
      CANVAS_ADD_GROUP_IDS.image,
      CANVAS_ADD_GROUP_IDS.video,
      CANVAS_ADD_GROUP_IDS.audio,
      CANVAS_ADD_GROUP_IDS.organize,
    ])

    // 10 = 原 9 + 2026-08-02 新增的手动镜头文本（见下面那条反转用例）
    const items = CANVAS_ADD_CATALOG.flatMap((group) => group.items)
    expect(items).toHaveLength(10)
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
  })

  it('never exposes retired planners or legacy image types', () => {
    const exposedTypes = new Set(
      CANVAS_ADD_CATALOG.flatMap((group) =>
        group.items.map((item) => item.nodeType),
      ),
    )

    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.composer)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.agent)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.characterImage)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.backgroundImage)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.frameImage)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.shot)
  })

  // 2026-08-02 反转：这条断言原先写在上面那个用例里（标题还带着「or manual
  // shot text」），前提是「shotText 只由剧本笺投影产出，用户不该手动建」。
  // owner 拍板「助手这边只是自动生成，不用助手则用户手动输入然后生成 —— 是
  // 一种东西」后，手动这条路必须有入口，前提本身作废。
  // 手工建的节点没有 scriptRef，不受投影的孤儿清扫管辖（node-workflow-script-doc
  // 的删除逻辑只认有 ref 的节点），所以两条路可以共存而不打架。
  it('exposes shot text so the manual path has an entry point', () => {
    const exposedTypes = new Set(
      CANVAS_ADD_CATALOG.flatMap((group) =>
        group.items.map((item) => item.nodeType),
      ),
    )

    expect(exposedTypes).toContain(NODE_TYPE_IDS.shotText)
    expect(
      getCanvasAddCatalogItem(CANVAS_ADD_INTENT_IDS.videoShotText),
    ).toMatchObject({
      nodeType: NODE_TYPE_IDS.shotText,
      group: CANVAS_ADD_GROUP_IDS.video,
    })
  })

  it('maps organization and keyframe intents onto unified image roles', () => {
    expect(
      getCanvasAddCatalogItem(CANVAS_ADD_INTENT_IDS.imageKeyframe),
    ).toMatchObject({
      nodeType: NODE_TYPE_IDS.image,
      role: NODE_IMAGE_ROLE_IDS.frame,
    })
    expect(
      getCanvasAddCatalogItem(CANVAS_ADD_INTENT_IDS.organizeCharacter),
    ).toMatchObject({
      nodeType: NODE_TYPE_IDS.image,
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    expect(
      getCanvasAddCatalogItem(CANVAS_ADD_INTENT_IDS.organizeScene),
    ).toMatchObject({
      nodeType: NODE_TYPE_IDS.image,
      role: NODE_IMAGE_ROLE_IDS.background,
    })
  })
})
