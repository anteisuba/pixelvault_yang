import { describe, expect, it, vi } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'

vi.mock('./BackgroundDetailBody', () => ({
  BackgroundDetailBody: () => null,
}))

vi.mock('./CharacterDetailBody', () => ({
  CharacterDetailBody: () => null,
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

vi.mock('./VideoReferenceDetailBody', () => ({
  VideoReferenceDetailBody: () => null,
}))

vi.mock('./VoiceDetailBody', () => ({
  VoiceDetailBody: () => null,
}))

import { LooseImageDetailBody } from './LooseImageDetailBody'
import { VideoReferenceDetailBody } from './VideoReferenceDetailBody'
import { NODE_DETAIL_REGISTRY } from './registry'

describe('NODE_DETAIL_REGISTRY', () => {
  it('uses the upload body for reference-video nodes', () => {
    expect(NODE_DETAIL_REGISTRY[NODE_TYPE_IDS.videoReference]).toBe(
      VideoReferenceDetailBody,
    )
  })

  // S5d ③: a role-less image node presents as `image` itself now.
  it('uses the loose-image body for the unified image node type', () => {
    expect(NODE_DETAIL_REGISTRY[NODE_TYPE_IDS.image]).toBe(LooseImageDetailBody)
  })
})
