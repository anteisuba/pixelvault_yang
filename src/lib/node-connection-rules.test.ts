import { describe, expect, it } from 'vitest'

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

import { canConnectNodeTypes } from './node-connection-rules'

describe('canConnectNodeTypes', () => {
  it('allows every edge the ScriptDoc projection creates', () => {
    // scriptDocToGraph: shotText/character/voice → seedance, seedance → merge.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.shotText, NODE_TYPE_IDS.seedance),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.characterImage, NODE_TYPE_IDS.seedance),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.voice, NODE_TYPE_IDS.seedance),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.seedance, NODE_TYPE_IDS.videoMerge),
    ).toBe(true)
  })

  it('allows the voice→character audio-binding hop', () => {
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.voice, NODE_TYPE_IDS.characterImage),
    ).toBe(true)
  })

  it('routes the unified image node by role', () => {
    // image (any role) → seedance reference, mirroring the legacy image types.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.image, NODE_TYPE_IDS.seedance),
    ).toBe(true)
    // voice → image[character] = the character audio-binding hop.
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.voice,
        NODE_TYPE_IDS.image,
        NODE_IMAGE_ROLE_IDS.character,
      ),
    ).toBe(true)
    // voice → image[shot|background|frame] → no (only character accepts voice).
    for (const role of [
      NODE_IMAGE_ROLE_IDS.shot,
      NODE_IMAGE_ROLE_IDS.background,
      NODE_IMAGE_ROLE_IDS.frame,
    ]) {
      expect(
        canConnectNodeTypes(NODE_TYPE_IDS.voice, NODE_TYPE_IDS.image, role),
      ).toBe(false)
    }
    // image target with no role → accepts nothing.
    expect(canConnectNodeTypes(NODE_TYPE_IDS.voice, NODE_TYPE_IDS.image)).toBe(
      false,
    )
  })

  it('allows all reference families + video chains into seedance', () => {
    for (const source of [
      NODE_TYPE_IDS.backgroundImage,
      NODE_TYPE_IDS.frameImage,
      NODE_TYPE_IDS.shot,
      NODE_TYPE_IDS.seedance,
      NODE_TYPE_IDS.videoReference,
      NODE_TYPE_IDS.videoMerge,
    ]) {
      expect(canConnectNodeTypes(source, NODE_TYPE_IDS.seedance)).toBe(true)
    }
  })

  it('allows video sources into videoMerge', () => {
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.videoReference,
        NODE_TYPE_IDS.videoMerge,
      ),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.videoMerge, NODE_TYPE_IDS.videoMerge),
    ).toBe(true)
  })

  it('rejects nonsense connections', () => {
    // voice into an image-gen node (not the character hop) → no.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.voice, NODE_TYPE_IDS.backgroundImage),
    ).toBe(false)
    // text into a character node → no.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.shotText, NODE_TYPE_IDS.characterImage),
    ).toBe(false)
    // anything into a leaf/source node (shotText/shot/voice/videoReference) → no.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.seedance, NODE_TYPE_IDS.shotText),
    ).toBe(false)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.characterImage, NODE_TYPE_IDS.shot),
    ).toBe(false)
    // image-gen nodes don't read the graph → no image refs into shot/frame.
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.characterImage,
        NODE_TYPE_IDS.frameImage,
      ),
    ).toBe(false)
  })
})
