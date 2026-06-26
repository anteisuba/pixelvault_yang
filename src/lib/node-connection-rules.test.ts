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

  it('allows character + background image references into shot', () => {
    // Legacy per-role types.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.characterImage, NODE_TYPE_IDS.shot),
    ).toBe(true)
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.backgroundImage, NODE_TYPE_IDS.shot),
    ).toBe(true)
    // Unified image source, resolved by sourceRole (4th arg).
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.image,
        NODE_TYPE_IDS.shot,
        undefined,
        NODE_IMAGE_ROLE_IDS.character,
      ),
    ).toBe(true)
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.image,
        NODE_TYPE_IDS.shot,
        undefined,
        NODE_IMAGE_ROLE_IDS.background,
      ),
    ).toBe(true)
    // Same edges land on a unified image target with role=shot.
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.characterImage,
        NODE_TYPE_IDS.image,
        NODE_IMAGE_ROLE_IDS.shot,
      ),
    ).toBe(true)
  })

  it('rejects non-reference sources into shot', () => {
    // shot/frame images are leaf outputs, not references → nothing to consume.
    expect(canConnectNodeTypes(NODE_TYPE_IDS.shot, NODE_TYPE_IDS.shot)).toBe(
      false,
    )
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.image,
        NODE_TYPE_IDS.shot,
        undefined,
        NODE_IMAGE_ROLE_IDS.shot,
      ),
    ).toBe(false)
    // Non-image sources never feed a shot.
    expect(canConnectNodeTypes(NODE_TYPE_IDS.voice, NODE_TYPE_IDS.shot)).toBe(
      false,
    )
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.shotText, NODE_TYPE_IDS.shot),
    ).toBe(false)
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
    // anything into a leaf/source node (shotText/voice/videoReference) → no.
    expect(
      canConnectNodeTypes(NODE_TYPE_IDS.seedance, NODE_TYPE_IDS.shotText),
    ).toBe(false)
    // frameImage doesn't read the graph → no image refs into it (shot does).
    expect(
      canConnectNodeTypes(
        NODE_TYPE_IDS.characterImage,
        NODE_TYPE_IDS.frameImage,
      ),
    ).toBe(false)
  })
})
