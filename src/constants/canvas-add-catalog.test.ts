import { describe, expect, it } from 'vitest'

import {
  CANVAS_ADD_CATALOG,
  CANVAS_ADD_GROUP_IDS,
  CANVAS_ADD_INTENT_IDS,
  getCanvasAddCatalogItem,
} from '@/constants/canvas-add-catalog'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

describe('canvas add catalog', () => {
  it('exposes four user-intent groups with nine unique entries', () => {
    expect(CANVAS_ADD_CATALOG.map((group) => group.id)).toEqual([
      CANVAS_ADD_GROUP_IDS.image,
      CANVAS_ADD_GROUP_IDS.video,
      CANVAS_ADD_GROUP_IDS.audio,
      CANVAS_ADD_GROUP_IDS.organize,
    ])

    const items = CANVAS_ADD_CATALOG.flatMap((group) => group.items)
    expect(items).toHaveLength(9)
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
  })

  it('never exposes retired planners, legacy image types, or manual shot text', () => {
    const exposedTypes = new Set(
      CANVAS_ADD_CATALOG.flatMap((group) =>
        group.items.map((item) => item.nodeType),
      ),
    )

    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.composer)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.agent)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.shotText)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.characterImage)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.backgroundImage)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.frameImage)
    expect(exposedTypes).not.toContain(NODE_TYPE_IDS.shot)
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
