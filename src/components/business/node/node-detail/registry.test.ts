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
import { NODE_DETAIL_REGISTRY } from './registry'

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

  it('gives every exposed add-catalog intent a dedicated detail body', () => {
    for (const item of CANVAS_ADD_CATALOG.flatMap((group) => group.items)) {
      const presentationType = item.role
        ? NODE_IMAGE_ROLE_TO_LEGACY_TYPE[item.role]
        : item.nodeType
      expect(
        NODE_DETAIL_REGISTRY[presentationType],
        `${item.id} must not fall through to GenericDetailBody`,
      ).toBeDefined()
    }
  })
})
