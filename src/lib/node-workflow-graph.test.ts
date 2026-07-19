import { describe, expect, it } from 'vitest'

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import {
  buildReferenceAssetLegendEntries,
  buildShotReferenceLegend,
  buildVideoReferenceLegend,
  getEdgeStageOverrideUrls,
  getNodeMediaUrl,
  getNodePrimaryMediaUrl,
  getNodeStageMediaUrls,
  getSeedanceReferenceKind,
  getUpstreamNodes,
  harvestUpstreamAudioBindings,
  harvestUpstreamCloseupUrls,
  harvestUpstreamImageReferences,
  harvestUpstreamImageUrls,
  harvestUpstreamShotTextPrompt,
  harvestUpstreamVideoImageReferences,
  harvestUpstreamVideoUrls,
  harvestUpstreamVoiceAudioUrls,
  isKeyframeNode,
  isShotNode,
  isShotTextNode,
  isVideoSourceNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
  mergePromptWithUpstreamText,
  summarizeUpstreamSeedanceReferences,
  type UpstreamImageReference,
  type VideoLegendImageReference,
  type VideoReferenceLegendLabels,
} from './node-workflow-graph'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Partial<NodeWorkflowNode['data']> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      prompt: '',
      status: 'idle',
      ...data,
    } as NodeWorkflowNode['data'],
  }
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  data?: Record<string, unknown>,
): NodeWorkflowEdge {
  return { id, source, target, ...(data ? { data } : {}) } as NodeWorkflowEdge
}

describe('node-workflow-graph predicates', () => {
  it('classifies visual reference nodes', () => {
    expect(
      isVisualReferenceNode(makeNode('a', NODE_TYPE_IDS.characterImage)),
    ).toBe(true)
    expect(isVisualReferenceNode(makeNode('b', NODE_TYPE_IDS.shot))).toBe(true)
    expect(
      isVisualReferenceNode(makeNode('c', NODE_TYPE_IDS.backgroundImage)),
    ).toBe(true)
    expect(isVisualReferenceNode(makeNode('d', NODE_TYPE_IDS.frameImage))).toBe(
      false,
    )
    expect(isVisualReferenceNode(makeNode('e', NODE_TYPE_IDS.voice))).toBe(
      false,
    )
  })

  it('classifies keyframe / shotText / voice nodes', () => {
    expect(isKeyframeNode(makeNode('a', NODE_TYPE_IDS.frameImage))).toBe(true)
    expect(isKeyframeNode(makeNode('b', NODE_TYPE_IDS.shot))).toBe(false)
    expect(isShotTextNode(makeNode('c', NODE_TYPE_IDS.shotText))).toBe(true)
    expect(isShotTextNode(makeNode('d', NODE_TYPE_IDS.frameImage))).toBe(false)
    expect(isVoiceProfileNode(makeNode('e', NODE_TYPE_IDS.voice))).toBe(true)
    expect(isVoiceProfileNode(makeNode('f', NODE_TYPE_IDS.shotText))).toBe(
      false,
    )
  })
})

describe('isKeyframeNode (S5d frame 关键帧兼容迁移)', () => {
  it('still recognises the legacy role=frame / frameImage type unchanged', () => {
    expect(
      isKeyframeNode(makeNode('a', NODE_TYPE_IDS.image, { role: 'frame' })),
    ).toBe(true)
    expect(isKeyframeNode(makeNode('b', NODE_TYPE_IDS.frameImage))).toBe(true)
  })

  it('recognises a role-less image classified frameStart/frameEnd via imageCategory', () => {
    expect(
      isKeyframeNode(
        makeNode('a', NODE_TYPE_IDS.image, { imageCategory: 'frameStart' }),
      ),
    ).toBe(true)
    expect(
      isKeyframeNode(
        makeNode('b', NODE_TYPE_IDS.image, { imageCategory: 'frameEnd' }),
      ),
    ).toBe(true)
  })

  it('does not treat every category as a keyframe', () => {
    expect(
      isKeyframeNode(
        makeNode('a', NODE_TYPE_IDS.image, { imageCategory: 'style' }),
      ),
    ).toBe(false)
    expect(
      isKeyframeNode(makeNode('b', NODE_TYPE_IDS.image, { role: 'shot' })),
    ).toBe(false)
  })
})

describe('getSeedanceReferenceKind', () => {
  it('resolves unified image nodes by role', () => {
    expect(
      getSeedanceReferenceKind(
        makeNode('a', NODE_TYPE_IDS.image, { role: 'character' }),
      ),
    ).toBe('character')
    expect(
      getSeedanceReferenceKind(
        makeNode('b', NODE_TYPE_IDS.image, { role: 'background' }),
      ),
    ).toBe('background')
    // shot is a named reference (镜头); frame is not surfaced as a chip.
    expect(
      getSeedanceReferenceKind(
        makeNode('c', NODE_TYPE_IDS.image, { role: 'shot' }),
      ),
    ).toBe('shot')
    expect(
      getSeedanceReferenceKind(
        makeNode('d', NODE_TYPE_IDS.image, { role: 'frame' }),
      ),
    ).toBeNull()
    // A role-less image (freshly added) is not a named reference yet.
    expect(
      getSeedanceReferenceKind(makeNode('e', NODE_TYPE_IDS.image)),
    ).toBeNull()
  })

  it('resolves legacy per-type + voice nodes', () => {
    expect(
      getSeedanceReferenceKind(makeNode('a', NODE_TYPE_IDS.characterImage)),
    ).toBe('character')
    expect(
      getSeedanceReferenceKind(makeNode('b', NODE_TYPE_IDS.backgroundImage)),
    ).toBe('background')
    expect(getSeedanceReferenceKind(makeNode('shot', NODE_TYPE_IDS.shot))).toBe(
      'shot',
    )
    expect(getSeedanceReferenceKind(makeNode('c', NODE_TYPE_IDS.voice))).toBe(
      'voice',
    )
    expect(
      getSeedanceReferenceKind(makeNode('d', NODE_TYPE_IDS.shotText)),
    ).toBeNull()
  })
})

describe('getNodeMediaUrl', () => {
  it('prefers imageUrl over mediaUrl', () => {
    expect(
      getNodeMediaUrl({
        prompt: '',
        status: 'idle',
        imageUrl: 'https://cdn/img.png',
        mediaUrl: 'https://cdn/other.png',
      }),
    ).toBe('https://cdn/img.png')
  })

  it('falls back to mediaUrl', () => {
    expect(
      getNodeMediaUrl({
        prompt: '',
        status: 'idle',
        mediaUrl: 'https://cdn/media.png',
      }),
    ).toBe('https://cdn/media.png')
  })

  it('returns undefined when neither is set', () => {
    expect(getNodeMediaUrl({ prompt: '', status: 'idle' })).toBeUndefined()
  })
})

describe('getNodePrimaryMediaUrl (V-2 主图)', () => {
  it('prefers the ★-starred referenceAssets entry over mediaUrl', () => {
    expect(
      getNodePrimaryMediaUrl({
        prompt: '',
        status: 'idle',
        mediaUrl: 'https://cdn/media.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/ref1.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
          },
          {
            id: 'r2',
            url: 'https://cdn/ref2.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
        ],
      }),
    ).toBe('https://cdn/ref2.png')
  })

  it('falls back to getNodeMediaUrl when nothing is starred (旧存档兼容)', () => {
    expect(
      getNodePrimaryMediaUrl({
        prompt: '',
        status: 'idle',
        mediaUrl: 'https://cdn/media.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/ref1.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ).toBe('https://cdn/media.png')
  })

  it('falls back to the first referenceAssets entry for a 融合-only card with no mediaUrl', () => {
    expect(
      getNodePrimaryMediaUrl({
        prompt: '',
        status: 'idle',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/ref1.png',
            role: 'identity',
            weight: 0.72,
            source: 'canvas',
          },
          {
            id: 'r2',
            url: 'https://cdn/ref2.png',
            role: 'identity',
            weight: 0.72,
            source: 'canvas',
          },
        ],
      }),
    ).toBe('https://cdn/ref1.png')
  })

  it('returns undefined for a fully empty card', () => {
    expect(
      getNodePrimaryMediaUrl({ prompt: '', status: 'idle' }),
    ).toBeUndefined()
  })
})

describe('getNodeStageMediaUrls (R3-6 出场组)', () => {
  it('degrades to exactly [primary] when no entry carries onStage (旧存档零漂移)', () => {
    expect(
      getNodeStageMediaUrls({
        prompt: '',
        status: 'idle',
        mediaUrl: 'https://cdn/media.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/ref1.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ).toEqual(['https://cdn/media.png'])
  })

  it('returns [] for a fully empty card', () => {
    expect(getNodeStageMediaUrls({ prompt: '', status: 'idle' })).toEqual([])
  })

  it('puts the ★-starred primary first, then onStage entries in array order', () => {
    expect(
      getNodeStageMediaUrls({
        prompt: '',
        status: 'idle',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/extra1.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/primary.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
          {
            id: 'r3',
            url: 'https://cdn/extra2.png',
            role: 'style',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r4',
            url: 'https://cdn/notstaged.png',
            role: 'costume',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ).toEqual([
      'https://cdn/primary.png',
      'https://cdn/extra1.png',
      'https://cdn/extra2.png',
    ])
  })

  it('dedupes when the primary entry is ALSO marked onStage', () => {
    expect(
      getNodeStageMediaUrls({
        prompt: '',
        status: 'idle',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/primary.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ).toEqual(['https://cdn/primary.png', 'https://cdn/extra.png'])
  })

  // R3-6b §3 每镜覆写
  it('override branch: forces the primary into position 0 even when the override array omits it', () => {
    expect(
      getNodeStageMediaUrls(
        {
          prompt: '',
          status: 'idle',
          referenceAssets: [
            {
              id: 'r1',
              url: 'https://cdn/primary.png',
              role: 'identity',
              weight: 0.72,
              source: 'upload',
              isPrimary: true,
            },
            {
              id: 'r2',
              url: 'https://cdn/onstage-but-ignored.png',
              role: 'pose',
              weight: 0.72,
              source: 'upload',
              onStage: true,
            },
          ],
        },
        ['https://cdn/override1.png', 'https://cdn/override2.png'],
      ),
    ).toEqual([
      'https://cdn/primary.png',
      'https://cdn/override1.png',
      'https://cdn/override2.png',
    ])
  })

  it('override branch: an EMPTY override array resolves to [primary] only, ignoring the card onStage set', () => {
    expect(
      getNodeStageMediaUrls(
        {
          prompt: '',
          status: 'idle',
          referenceAssets: [
            {
              id: 'r1',
              url: 'https://cdn/primary.png',
              role: 'identity',
              weight: 0.72,
              source: 'upload',
              isPrimary: true,
            },
            {
              id: 'r2',
              url: 'https://cdn/onstage-but-ignored.png',
              role: 'pose',
              weight: 0.72,
              source: 'upload',
              onStage: true,
            },
          ],
        },
        [],
      ),
    ).toEqual(['https://cdn/primary.png'])
  })

  it('overrideUrls omitted entirely (undefined) keeps the pre-R3-6b onStage fallback', () => {
    expect(
      getNodeStageMediaUrls({
        prompt: '',
        status: 'idle',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/primary.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ).toEqual(['https://cdn/primary.png', 'https://cdn/extra.png'])
  })
})

describe('getEdgeStageOverrideUrls (R3-6b §3)', () => {
  it('reads a well-formed stageOverrideUrls array off edge.data', () => {
    const edge = makeEdge('e1', 'char1', 'video1', {
      stageOverrideUrls: ['https://cdn/a.png', 'https://cdn/b.png'],
    })
    expect(getEdgeStageOverrideUrls(edge)).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
    ])
  })

  it('returns undefined for an edge with no data / no override field', () => {
    expect(getEdgeStageOverrideUrls(makeEdge('e1', 'a', 'b'))).toBeUndefined()
  })

  it('returns undefined for a missing edge', () => {
    expect(getEdgeStageOverrideUrls(undefined)).toBeUndefined()
  })

  it('degrades a malformed (non-array) value to undefined instead of throwing', () => {
    const edge = makeEdge('e1', 'char1', 'video1', {
      stageOverrideUrls: 'not-an-array',
    })
    expect(getEdgeStageOverrideUrls(edge)).toBeUndefined()
  })

  it('filters out non-string entries from a mixed-type array', () => {
    const edge = makeEdge('e1', 'char1', 'video1', {
      stageOverrideUrls: ['https://cdn/a.png', 42, null, 'https://cdn/b.png'],
    })
    expect(getEdgeStageOverrideUrls(edge)).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
    ])
  })

  it('an explicit empty array stays an empty array (not coerced to undefined)', () => {
    const edge = makeEdge('e1', 'char1', 'video1', { stageOverrideUrls: [] })
    expect(getEdgeStageOverrideUrls(edge)).toEqual([])
  })
})

describe('getUpstreamNodes', () => {
  it('returns only direct upstream nodes for a target', () => {
    const nodes = [
      makeNode('a', NODE_TYPE_IDS.characterImage),
      makeNode('b', NODE_TYPE_IDS.voice),
      makeNode('c', NODE_TYPE_IDS.seedance),
      makeNode('d', NODE_TYPE_IDS.frameImage),
    ]
    const edges = [
      makeEdge('e1', 'a', 'c'),
      makeEdge('e2', 'b', 'c'),
      // d → not connected to c
      makeEdge('e3', 'd', 'a'),
    ]

    const upstream = getUpstreamNodes('c', edges, nodes)

    expect(upstream.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('returns empty when no edges target the node', () => {
    const nodes = [makeNode('a', NODE_TYPE_IDS.shotText)]
    expect(getUpstreamNodes('a', [], nodes)).toEqual([])
  })
})

describe('harvestUpstreamImageUrls', () => {
  it('orders keyframe URLs before visual reference URLs', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/char.png',
      }),
      makeNode('frame', NODE_TYPE_IDS.frameImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/frame.png',
      }),
      makeNode('bg', NODE_TYPE_IDS.backgroundImage, {
        status: 'idle',
        imageUrl: 'https://cdn/bg.png',
      }),
    ]

    expect(harvestUpstreamImageUrls(upstream)).toEqual([
      'https://cdn/frame.png',
      'https://cdn/char.png',
      'https://cdn/bg.png',
    ])
  })

  it('deduplicates and skips empty URLs', () => {
    const upstream = [
      makeNode('a', NODE_TYPE_IDS.frameImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/x.png',
      }),
      makeNode('b', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/x.png',
      }),
      makeNode('c', NODE_TYPE_IDS.backgroundImage, { status: 'idle' }),
    ]
    expect(harvestUpstreamImageUrls(upstream)).toEqual(['https://cdn/x.png'])
  })

  it('ignores non-image upstream nodes', () => {
    const upstream = [
      makeNode('v', NODE_TYPE_IDS.voice, { status: 'idle' }),
      makeNode('t', NODE_TYPE_IDS.shotText, { status: 'idle' }),
    ]
    expect(harvestUpstreamImageUrls(upstream)).toEqual([])
  })

  it('excludes closeups from the direct harvest (they ride 1-hop via character)', () => {
    // A closeup is an image node with role=closeup but is NOT a visual
    // reference, so even wired directly it contributes nothing here.
    const upstream = [
      makeNode('cu', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.closeup,
        mediaUrl: 'https://cdn/closeup.png',
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream)).toEqual([])
  })

  it('V-2 主图: sends the ★-starred referenceAssets image instead of mediaUrl', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/char-alt.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream)).toEqual([
      'https://cdn/char-alt.png',
    ])
  })

  it('V-2 主图: a 融合-only card (no mediaUrl) now contributes its first referenceAssets image', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/fused.png',
            role: 'identity',
            weight: 0.72,
            source: 'canvas',
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream)).toEqual([
      'https://cdn/fused.png',
    ])
  })

  it('R3-6 出场组: a collector expands to its full onStage set (primary first)', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/extra1.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/notstaged.png',
            role: 'style',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream)).toEqual([
      'https://cdn/char.png',
      'https://cdn/extra1.png',
    ])
  })

  it('R3-6 出场组: a shot card (visual reference, not a collector) still sends only its primary', () => {
    const upstream = [
      makeNode('shot', NODE_TYPE_IDS.shot, {
        mediaUrl: 'https://cdn/shot.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/shot-extra.png',
            role: 'style',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream)).toEqual(['https://cdn/shot.png'])
  })

  // R3-6b §3 每镜覆写
  it('honors a collector→video edge stageOverrideUrls when edges + focalNodeId are supplied', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    const edges = [
      makeEdge('e-char', 'char', 'video1', {
        stageOverrideUrls: ['https://cdn/override-extra.png'],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream, edges, 'video1')).toEqual([
      'https://cdn/char.png',
      'https://cdn/override-extra.png',
    ])
  })

  it('falls back to the card onStage set when edges/focalNodeId are omitted (shot path zero-drift)', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream)).toEqual([
      'https://cdn/char.png',
      'https://cdn/card-default-extra.png',
    ])
  })

  it('a per-edge override only affects THAT edge — a second video keeps the card default', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    const edges = [
      makeEdge('e-char-v1', 'char', 'video1', {
        stageOverrideUrls: ['https://cdn/override-extra.png'],
      }),
      makeEdge('e-char-v2', 'char', 'video2'),
    ]
    expect(harvestUpstreamImageUrls(upstream, edges, 'video1')).toEqual([
      'https://cdn/char.png',
      'https://cdn/override-extra.png',
    ])
    expect(harvestUpstreamImageUrls(upstream, edges, 'video2')).toEqual([
      'https://cdn/char.png',
      'https://cdn/card-default-extra.png',
    ])
  })
})

describe('harvestUpstreamCloseupUrls (§9 B 1-hop)', () => {
  it('collects closeups attached to upstream characters, in character order', () => {
    // closeup → character → video: the closeup rides image_urls via the char.
    const nodes = [
      makeNode('cu1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.closeup,
        mediaUrl: 'https://cdn/cu1.png',
      }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '剑修',
        mediaUrl: 'https://cdn/char1.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e-cu', 'cu1', 'char1'),
      makeEdge('e-char', 'char1', 'video1'),
    ]
    expect(harvestUpstreamCloseupUrls('video1', edges, nodes)).toEqual([
      'https://cdn/cu1.png',
    ])
  })

  it('returns nothing when a closeup hangs off a non-character upstream', () => {
    // A closeup wired to a background (not a character) must not be harvested —
    // closeup only rides a character.
    const nodes = [
      makeNode('cu1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.closeup,
        mediaUrl: 'https://cdn/cu1.png',
      }),
      makeNode('bg1', NODE_TYPE_IDS.backgroundImage, {
        mediaUrl: 'https://cdn/bg.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e-cu', 'cu1', 'bg1'),
      makeEdge('e-bg', 'bg1', 'video1'),
    ]
    expect(harvestUpstreamCloseupUrls('video1', edges, nodes)).toEqual([])
  })
})

describe('isShotNode', () => {
  it('matches the legacy shot type and unified image role=shot', () => {
    expect(isShotNode(makeNode('a', NODE_TYPE_IDS.shot))).toBe(true)
    expect(
      isShotNode(makeNode('b', NODE_TYPE_IDS.image, { role: 'shot' })),
    ).toBe(true)
    // A role-less image defaults to shot (mirrors isVisualReferenceNode).
    expect(isShotNode(makeNode('c', NODE_TYPE_IDS.image))).toBe(true)
    expect(
      isShotNode(makeNode('d', NODE_TYPE_IDS.image, { role: 'character' })),
    ).toBe(false)
    expect(isShotNode(makeNode('e', NODE_TYPE_IDS.backgroundImage))).toBe(false)
  })
})

describe('harvestUpstreamImageReferences', () => {
  it('pairs character/background images with their subject name', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
      }),
      makeNode('bg', NODE_TYPE_IDS.backgroundImage, {
        imageUrl: 'https://cdn/bg.png',
        backgroundName: '拉海洛',
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream)).toEqual([
      { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
      { url: 'https://cdn/bg.png', kind: 'background', name: '拉海洛' },
    ])
  })

  it('V-2 主图: uses the ★-starred referenceAssets image for a shot node harvest', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/char-alt.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream)).toEqual([
      { url: 'https://cdn/char-alt.png', kind: 'character', name: 'yangyang' },
    ])
  })

  it('resolves unified image nodes by role and falls back to character.name', () => {
    const upstream = [
      makeNode('c', NODE_TYPE_IDS.image, {
        role: 'character',
        mediaUrl: 'https://cdn/c.png',
        character: {
          characterId: 'x',
          name: 'Charlie',
          visualSeed: 'soft-cyan-haired explorer',
        },
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream)).toEqual([
      { url: 'https://cdn/c.png', kind: 'character', name: 'Charlie' },
    ])
  })

  it('skips shot/frame/voice upstream + media-less nodes and dedupes by URL', () => {
    const upstream = [
      makeNode('shot', NODE_TYPE_IDS.shot, {
        mediaUrl: 'https://cdn/shot.png',
      }),
      makeNode('frame', NODE_TYPE_IDS.frameImage, {
        mediaUrl: 'https://cdn/frame.png',
      }),
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/v.mp3',
      }),
      makeNode('charNoMedia', NODE_TYPE_IDS.characterImage, {
        characterName: 'NoPic',
      }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/dup.png',
        characterName: 'A',
      }),
      makeNode('char2', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/dup.png',
        characterName: 'B',
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream)).toEqual([
      { url: 'https://cdn/dup.png', kind: 'character', name: 'A' },
    ])
  })

  it('leaves name undefined when the node has none', () => {
    const upstream = [
      makeNode('bg', NODE_TYPE_IDS.backgroundImage, {
        mediaUrl: 'https://cdn/bg.png',
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream)).toEqual([
      { url: 'https://cdn/bg.png', kind: 'background', name: undefined },
    ])
  })

  it('R3-6 出场组: expands a collector to primary + onStage extras, category-labeled when resolvable', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/prop.png',
            role: 'prop',
            weight: 0.72,
            source: 'upload',
            name: '古剑',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/plain-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream)).toEqual([
      { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
      { url: 'https://cdn/prop.png', name: '古剑', category: '道具' },
      // No asset.name on this extra → falls back to the SAME kind+name format
      // as the primary (§3.0a "无分类则同名同 kind 格式").
      {
        url: 'https://cdn/plain-extra.png',
        kind: 'character',
        name: 'yangyang',
      },
    ])
  })

  it('R3-6 出场组: a card with no onStage entries degrades to one entry per node (旧存档零漂移)', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/gallery-only.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream)).toEqual([
      { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
    ])
  })
})

describe('buildShotReferenceLegend', () => {
  it('labels each named reference by its final 1-based position', () => {
    const refByUrl = new Map<string, UpstreamImageReference>([
      [
        'https://cdn/char.png',
        { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
      ],
      [
        'https://cdn/bg.png',
        { url: 'https://cdn/bg.png', kind: 'background', name: '拉海洛' },
      ],
    ])
    const legend = buildShotReferenceLegend(
      ['https://cdn/manual.png', 'https://cdn/char.png', 'https://cdn/bg.png'],
      refByUrl,
    )
    expect(legend).toBe(
      '参考图说明：\n图2：角色「yangyang」\n图3：背景「拉海洛」',
    )
  })

  it('returns empty when no reference image has a known name', () => {
    expect(buildShotReferenceLegend(['https://cdn/x.png'], new Map())).toBe('')
    const refByUrl = new Map<string, UpstreamImageReference>([
      [
        'https://cdn/x.png',
        { url: 'https://cdn/x.png', kind: 'background', name: undefined },
      ],
    ])
    expect(buildShotReferenceLegend(['https://cdn/x.png'], refByUrl)).toBe('')
  })

  // S5d ③ 分类进图例: a category-labeled entry (a shot's own referenceAssets)
  // prints "图N = 名字（分类）" — a different format from the kind-based
  // "图N：角色「名字」" line above, so the model doesn't read it as a subject.
  it('labels a category entry with the "图N = 名字（分类）" format', () => {
    const refByUrl = new Map<string, UpstreamImageReference>([
      [
        'https://cdn/char.png',
        { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
      ],
      [
        'https://cdn/prop.png',
        { url: 'https://cdn/prop.png', name: '古剑', category: '道具' },
      ],
    ])
    const legend = buildShotReferenceLegend(
      ['https://cdn/char.png', 'https://cdn/prop.png'],
      refByUrl,
    )
    expect(legend).toBe(
      '参考图说明：\n图1：角色「yangyang」\n图2 = 古剑（道具）',
    )
  })
})

describe('buildReferenceAssetLegendEntries (S5d ③)', () => {
  it('builds a category-labeled legend entry per named asset', () => {
    const entries = buildReferenceAssetLegendEntries([
      {
        id: 'r1',
        url: 'https://cdn/prop.png',
        role: 'prop',
        weight: 0.7,
        source: 'upload',
        name: '古剑',
      },
    ])
    expect(entries.get('https://cdn/prop.png')).toEqual({
      url: 'https://cdn/prop.png',
      name: '古剑',
      category: '道具',
    })
  })

  it('uses customLabel for a custom-role asset', () => {
    const entries = buildReferenceAssetLegendEntries([
      {
        id: 'r1',
        url: 'https://cdn/x.png',
        role: 'custom',
        customLabel: '布景残片',
        weight: 0.7,
        source: 'upload',
        name: '碎片',
      },
    ])
    expect(entries.get('https://cdn/x.png')?.category).toBe('布景残片')
  })

  it('skips an unnamed asset and a custom-role asset with no typed label', () => {
    const entries = buildReferenceAssetLegendEntries([
      {
        id: 'r1',
        url: 'https://cdn/noname.png',
        role: 'prop',
        weight: 0.7,
        source: 'upload',
      },
      {
        id: 'r2',
        url: 'https://cdn/nolabel.png',
        role: 'custom',
        weight: 0.7,
        source: 'upload',
        name: '某物',
      },
    ])
    expect(entries.size).toBe(0)
  })

  it('returns an empty map for undefined/empty input', () => {
    expect(buildReferenceAssetLegendEntries(undefined).size).toBe(0)
    expect(buildReferenceAssetLegendEntries([]).size).toBe(0)
  })
})

describe('harvestUpstreamVideoImageReferences (§7.2⑦ 视频图例真源)', () => {
  it('maps character/background/shot + 1-hop closeup names by URL', () => {
    const nodes = [
      makeNode('cu1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.closeup,
        mediaUrl: 'https://cdn/cu.png',
        characterName: '剑修脸',
      }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '剑修',
      }),
      makeNode('bg1', NODE_TYPE_IDS.backgroundImage, {
        mediaUrl: 'https://cdn/bg.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e-cu', 'cu1', 'char1'),
      makeEdge('e-char', 'char1', 'video1'),
      makeEdge('e-bg', 'bg1', 'video1'),
    ]
    const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
    expect(map.get('https://cdn/char.png')).toEqual({
      kind: 'character',
      name: '剑修',
    })
    // closeup resolved 1-hop from its character, name from characterName.
    expect(map.get('https://cdn/cu.png')).toEqual({
      kind: 'closeup',
      name: '剑修脸',
    })
    // unnamed background → name undefined (caller auto-numbers it).
    expect(map.get('https://cdn/bg.png')).toEqual({
      kind: 'background',
      name: undefined,
    })
  })

  it('R3-6 出场组: expands a collector to primary + onStage extras, category-labeled when resolvable', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '剑修',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/prop.png',
            role: 'prop',
            weight: 0.72,
            source: 'upload',
            name: '古剑',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/plain-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e-char', 'char1', 'video1')]
    const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
    expect(map.get('https://cdn/char.png')).toEqual({
      kind: 'character',
      name: '剑修',
    })
    expect(map.get('https://cdn/prop.png')).toEqual({
      kind: 'character',
      name: '古剑',
      category: '道具',
    })
    // No asset.name → falls back to the SAME kind+name as the primary.
    expect(map.get('https://cdn/plain-extra.png')).toEqual({
      kind: 'character',
      name: '剑修',
    })
  })

  it('R3-6 出场组: a card with no onStage entries degrades to one map entry (旧存档零漂移)', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '剑修',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/gallery-only.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e-char', 'char1', 'video1')]
    const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
    expect(map.size).toBe(1)
    expect(map.get('https://cdn/char.png')).toEqual({
      kind: 'character',
      name: '剑修',
    })
  })

  // R3-6b §3 每镜覆写
  it('honors the collector→video edge stageOverrideUrls over the card onStage set', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '剑修',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/override-extra.png',
            role: 'prop',
            weight: 0.72,
            source: 'upload',
            name: '古剑',
          },
        ],
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e-char', 'char1', 'video1', {
        stageOverrideUrls: ['https://cdn/override-extra.png'],
      }),
    ]
    const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
    // The override-selected extra is present, category-labeled from its own
    // referenceAssets entry (same fallback harvestUpstreamImageReferences uses).
    expect(map.get('https://cdn/override-extra.png')).toEqual({
      kind: 'character',
      name: '古剑',
      category: '道具',
    })
    // The card-default extra (onStage=true but NOT in the override) is absent
    // — the override REPLACES the card's own curation for this one edge.
    expect(map.has('https://cdn/card-default-extra.png')).toBe(false)
  })

  // SF-2b (canvas-shot-frame-fold-2026-07 §-1): 镜头/首帧被 @token 引用时必须
  // 带上分类，与 imageCategory 图片同格式同管线（"名字（分类）"）。
  describe('SF-2b 镜头/首帧分类映射', () => {
    it('a directly-referenced shot (unified image role=shot) carries category 镜头', () => {
      const nodes = [
        makeNode('shot1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          mediaUrl: 'https://cdn/shot.png',
          shotName: '开场镜头',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-shot', 'shot1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/shot.png')).toEqual({
        kind: 'shot',
        name: '开场镜头',
        category: '镜头',
      })
    })

    it('legacy shot type produces the SAME categorized entry as image role=shot (engine equivalence)', () => {
      const nodes = [
        makeNode('shot1', NODE_TYPE_IDS.shot, {
          mediaUrl: 'https://cdn/shot.png',
          shotName: '开场镜头',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-shot', 'shot1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/shot.png')).toEqual({
        kind: 'shot',
        name: '开场镜头',
        category: '镜头',
      })
    })

    it('a directly-referenced frame (unified image role=frame) carries category 首帧, named via mediaLabel', () => {
      const nodes = [
        makeNode('frame1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.frame,
          mediaUrl: 'https://cdn/frame.png',
          mediaLabel: '开场首帧',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-frame', 'frame1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/frame.png')).toEqual({
        name: '开场首帧',
        category: '首帧',
      })
    })

    it('legacy frameImage type produces the SAME categorized entry as image role=frame (engine equivalence)', () => {
      const nodes = [
        makeNode('frame1', NODE_TYPE_IDS.frameImage, {
          mediaUrl: 'https://cdn/frame.png',
          mediaLabel: '开场首帧',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-frame', 'frame1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/frame.png')).toEqual({
        name: '开场首帧',
        category: '首帧',
      })
    })

    it('an unnamed frame falls back to an ordinal placeholder name instead of dropping the entry', () => {
      const nodes = [
        makeNode('frame1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.frame,
          mediaUrl: 'https://cdn/frame.png',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-frame', 'frame1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/frame.png')).toEqual({
        name: '首帧1',
        category: '首帧',
      })
    })

    it('a role-less image classified imageCategory=frameStart/frameEnd resolves the MORE SPECIFIC 关键帧首/关键帧尾 label', () => {
      const nodes = [
        makeNode('kf1', NODE_TYPE_IDS.image, {
          mediaUrl: 'https://cdn/kf-start.png',
          imageCategory: 'frameStart',
        }),
        makeNode('kf2', NODE_TYPE_IDS.image, {
          mediaUrl: 'https://cdn/kf-end.png',
          imageCategory: 'frameEnd',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [
        makeEdge('e-kf1', 'kf1', 'video1'),
        makeEdge('e-kf2', 'kf2', 'video1'),
      ]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/kf-start.png')).toEqual({
        name: '关键帧首1',
        category: '关键帧首',
      })
      expect(map.get('https://cdn/kf-end.png')).toEqual({
        name: '关键帧尾2',
        category: '关键帧尾',
      })
    })
  })
})

describe('buildVideoReferenceLegend (§7.2⑦ / §9 D)', () => {
  const labels: VideoReferenceLegendLabels = {
    title: '参考素材说明：',
    imagePrefix: '图',
    videoPrefix: '视',
    audioPrefix: '音',
    kindLabel: {
      character: '角色',
      background: '场景',
      shot: '镜头',
      closeup: '特写',
      video: '视频',
    },
    autoNamePrefix: {
      character: '角色',
      background: '场景',
      shot: '镜头',
      closeup: '特写',
      video: '视频',
    },
    characterVoiceSuffix: '的音色',
    narration: '旁白',
  }

  it('binds each image slot by its FINAL index, keyframes skipped, closeup auto-named', () => {
    // referenceImages: [keyframe(slot0, no name), char(slot1, named), closeup(slot2, auto)]
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/char.png', { kind: 'character', name: '剑修' }],
      ['https://cdn/cu.png', { kind: 'closeup' }],
    ])
    const legend = buildVideoReferenceLegend({
      referenceImages: [
        'https://cdn/kf.png',
        'https://cdn/char.png',
        'https://cdn/cu.png',
      ],
      imageRefByUrl,
      videoUrls: [],
      audioBindings: [],
      labels,
    })
    // char at index 1 → 图2；closeup unnamed at index 2 → 特写3 (matches the
    // composer's autoName('closeup', 2) token @特写3); keyframe skipped.
    expect(legend).toBe('参考素材说明：\n图2：角色「剑修」\n图3：特写「特写3」')
  })

  it('adds 视N and 音N lines (character voice vs 旁白)', () => {
    const legend = buildVideoReferenceLegend({
      referenceImages: [],
      imageRefByUrl: new Map(),
      videoUrls: ['https://cdn/ref.mp4'],
      audioBindings: [
        { url: 'https://cdn/a1.mp3', characterName: '剑修' },
        { url: 'https://cdn/a2.mp3' },
      ],
      labels,
    })
    expect(legend).toBe(
      '参考素材说明：\n视1：视频「视频1」\n音1：角色「剑修」的音色\n音2：旁白',
    )
  })

  it('returns empty when nothing is nameable', () => {
    expect(
      buildVideoReferenceLegend({
        referenceImages: ['https://cdn/kf.png'],
        imageRefByUrl: new Map(),
        videoUrls: [],
        audioBindings: [],
        labels,
      }),
    ).toBe('')
  })

  // R3-6 出场组: an EXTRA onStage image carrying a resolved category prints
  // "@ImageN = 名字（分类）" instead of the kind-based line — same branch
  // buildShotReferenceLegend already has, just under this legend's own
  // @Image-style imagePrefix (V-1 positional token).
  it('labels a category-carrying image reference with "prefixN = 名字（分类）"', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/char.png', { kind: 'character', name: '剑修' }],
      [
        'https://cdn/prop.png',
        { kind: 'character', name: '古剑', category: '道具' },
      ],
    ])
    const legend = buildVideoReferenceLegend({
      referenceImages: ['https://cdn/char.png', 'https://cdn/prop.png'],
      imageRefByUrl,
      videoUrls: [],
      audioBindings: [],
      labels,
    })
    expect(legend).toBe('参考素材说明：\n图1：角色「剑修」\n图2 = 古剑（道具）')
  })

  // SF-2b (canvas-shot-frame-fold-2026-07 §-1): a category-only entry (no
  // `kind` at all — a keyframe/首帧's shape) still prints the "=（分类）" line,
  // never the kind-based bracket wording (which would throw/undefined without
  // this branch, since there's no `labels.kindLabel[undefined]`).
  it('labels a kind-less category-only entry (keyframe shape) the same way', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/frame.png', { name: '开场首帧', category: '首帧' }],
    ])
    const legend = buildVideoReferenceLegend({
      referenceImages: ['https://cdn/frame.png'],
      imageRefByUrl,
      videoUrls: [],
      audioBindings: [],
      labels,
    })
    expect(legend).toBe('参考素材说明：\n图1 = 开场首帧（首帧）')
  })

  // SF-2b end-to-end: the REAL harvest (harvestUpstreamVideoImageReferences)
  // feeding the REAL legend builder — locks in owner's literal quoted format
  // "图N = 名字（镜头/首帧）" for both shot and frame, not just a hand-built map.
  describe('SF-2b end-to-end: 镜头/首帧引用后的图例文本含分类', () => {
    it('a directly-referenced shot prints "图N = 名字（镜头）"', () => {
      const nodes = [
        makeNode('shot1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          mediaUrl: 'https://cdn/shot.png',
          shotName: '开场镜头',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-shot', 'shot1', 'video1')]
      const imageRefByUrl = harvestUpstreamVideoImageReferences(
        'video1',
        edges,
        nodes,
      )
      const legend = buildVideoReferenceLegend({
        referenceImages: ['https://cdn/shot.png'],
        imageRefByUrl,
        videoUrls: [],
        audioBindings: [],
        labels,
      })
      expect(legend).toBe('参考素材说明：\n图1 = 开场镜头（镜头）')
    })

    it('a directly-referenced frame prints "图N = 名字（首帧）"', () => {
      const nodes = [
        makeNode('frame1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.frame,
          mediaUrl: 'https://cdn/frame.png',
          mediaLabel: '开场首帧',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-frame', 'frame1', 'video1')]
      const imageRefByUrl = harvestUpstreamVideoImageReferences(
        'video1',
        edges,
        nodes,
      )
      const legend = buildVideoReferenceLegend({
        referenceImages: ['https://cdn/frame.png'],
        imageRefByUrl,
        videoUrls: [],
        audioBindings: [],
        labels,
      })
      expect(legend).toBe('参考素材说明：\n图1 = 开场首帧（首帧）')
    })
  })
})

describe('isVideoSourceNode', () => {
  it('matches seedance nodes (video kind)', () => {
    expect(isVideoSourceNode(makeNode('s', NODE_TYPE_IDS.seedance))).toBe(true)
  })

  it('rejects image and audio nodes', () => {
    expect(isVideoSourceNode(makeNode('c', NODE_TYPE_IDS.characterImage))).toBe(
      false,
    )
    expect(isVideoSourceNode(makeNode('v', NODE_TYPE_IDS.voice))).toBe(false)
    expect(isVideoSourceNode(makeNode('t', NODE_TYPE_IDS.shotText))).toBe(false)
  })
})

describe('harvestUpstreamVideoUrls', () => {
  it('collects mediaUrl from upstream video-source nodes', () => {
    const upstream = [
      makeNode('s1', NODE_TYPE_IDS.seedance, {
        mediaUrl: 'https://cdn/clip-a.mp4',
      }),
      makeNode('s2', NODE_TYPE_IDS.seedance, {
        mediaUrl: 'https://cdn/clip-b.mp4',
      }),
    ]
    expect(harvestUpstreamVideoUrls(upstream)).toEqual([
      'https://cdn/clip-a.mp4',
      'https://cdn/clip-b.mp4',
    ])
  })

  it('skips video nodes without mediaUrl and dedupes', () => {
    const upstream = [
      makeNode('s1', NODE_TYPE_IDS.seedance),
      makeNode('s2', NODE_TYPE_IDS.seedance, {
        mediaUrl: '  https://cdn/clip.mp4  ',
      }),
      makeNode('s3', NODE_TYPE_IDS.seedance, {
        mediaUrl: 'https://cdn/clip.mp4',
      }),
    ]
    expect(harvestUpstreamVideoUrls(upstream)).toEqual(['https://cdn/clip.mp4'])
  })

  it('ignores non-video upstream nodes', () => {
    const upstream = [
      makeNode('img', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/x.png',
      }),
      makeNode('v', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/v.mp3',
      }),
    ]
    expect(harvestUpstreamVideoUrls(upstream)).toEqual([])
  })
})

describe('harvestUpstreamVoiceAudioUrls', () => {
  it('collects voiceReferenceAudioUrl from upstream voice nodes', () => {
    const upstream = [
      makeNode('v1', NODE_TYPE_IDS.voice, {
        status: 'idle',
        voiceReferenceAudioUrl: 'https://cdn/a.mp3',
      }),
      makeNode('v2', NODE_TYPE_IDS.voice, {
        status: 'idle',
        voiceReferenceAudioUrl: 'https://cdn/b.mp3',
      }),
    ]
    expect(harvestUpstreamVoiceAudioUrls(upstream)).toEqual([
      'https://cdn/a.mp3',
      'https://cdn/b.mp3',
    ])
  })

  it('skips voice nodes without an audio URL and deduplicates', () => {
    const upstream = [
      makeNode('v1', NODE_TYPE_IDS.voice, { status: 'idle' }),
      makeNode('v2', NODE_TYPE_IDS.voice, {
        status: 'idle',
        voiceReferenceAudioUrl: '  https://cdn/a.mp3  ',
      }),
      makeNode('v3', NODE_TYPE_IDS.voice, {
        status: 'idle',
        voiceReferenceAudioUrl: 'https://cdn/a.mp3',
      }),
    ]
    expect(harvestUpstreamVoiceAudioUrls(upstream)).toEqual([
      'https://cdn/a.mp3',
    ])
  })

  it('ignores non-voice upstream', () => {
    const upstream = [
      makeNode('img', NODE_TYPE_IDS.frameImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/x.png',
      }),
    ]
    expect(harvestUpstreamVoiceAudioUrls(upstream)).toEqual([])
  })
})

describe('harvestUpstreamShotTextPrompt', () => {
  it('joins shotText prompts with a blank line between beats', () => {
    const upstream = [
      makeNode('s1', NODE_TYPE_IDS.shotText, {
        status: 'idle',
        scene: 'rooftop, dusk',
        action: 'character looks out',
      }),
      makeNode('s2', NODE_TYPE_IDS.shotText, {
        status: 'idle',
        camera: 'slow push-in',
      }),
    ]

    expect(harvestUpstreamShotTextPrompt(upstream)).toBe(
      'rooftop, dusk\ncharacter looks out\n\nslow push-in',
    )
  })

  it('skips empty shotText nodes', () => {
    const upstream = [
      makeNode('s1', NODE_TYPE_IDS.shotText, { status: 'idle' }),
      makeNode('s2', NODE_TYPE_IDS.shotText, {
        status: 'idle',
        scene: 'forest',
      }),
    ]
    expect(harvestUpstreamShotTextPrompt(upstream)).toBe('forest')
  })

  it('ignores non-shotText upstream', () => {
    const upstream = [
      makeNode('v', NODE_TYPE_IDS.voice, {
        status: 'idle',
        voiceReferenceAudioUrl: 'https://cdn/v.mp3',
      }),
    ]
    expect(harvestUpstreamShotTextPrompt(upstream)).toBe('')
  })
})

describe('mergePromptWithUpstreamText', () => {
  it('puts upstream prompt before the base prompt', () => {
    expect(mergePromptWithUpstreamText('cinematic shot', 'rooftop, dusk')).toBe(
      'rooftop, dusk\n\ncinematic shot',
    )
  })

  it('returns the other side when one is empty', () => {
    expect(mergePromptWithUpstreamText('only base', '')).toBe('only base')
    expect(mergePromptWithUpstreamText('  ', 'only upstream')).toBe(
      'only upstream',
    )
  })

  it('returns empty when both are empty', () => {
    expect(mergePromptWithUpstreamText('', '   ')).toBe('')
  })
})

describe('harvestUpstreamAudioBindings', () => {
  it('prefers a finished Audio Clip over a Voice Profile donor sample', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        audioClip: {
          url: 'https://cdn/finished.mp3',
          generationId: 'audio-generation-1',
          role: 'speech',
        },
        voiceReferenceAudioUrl: 'https://cdn/donor.mp3',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e1', 'voiceA', 'seedance')]

    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      {
        url: 'https://cdn/finished.mp3',
        nodeId: 'voiceA',
        sourceKind: 'audio-clip',
      },
    ])
  })

  it('attaches character names to voices routed through a character node', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/voice-a.mp3',
      }),
      makeNode('charA', NODE_TYPE_IDS.characterImage, {
        characterName: 'Alice',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e1', 'voiceA', 'charA'),
      makeEdge('e2', 'charA', 'seedance'),
    ]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      {
        url: 'https://cdn/voice-a.mp3',
        nodeId: 'voiceA',
        characterName: 'Alice',
      },
    ])
  })

  it('emits unbound voices when wired directly to the focal node', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/voice-a.mp3',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e1', 'voiceA', 'seedance')]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      { url: 'https://cdn/voice-a.mp3', nodeId: 'voiceA' },
    ])
  })

  it('binds multiple characters to their respective voices', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/voice-a.mp3',
      }),
      makeNode('voiceB', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/voice-b.mp3',
      }),
      makeNode('charA', NODE_TYPE_IDS.characterImage, {
        characterName: 'Alice',
      }),
      makeNode('charB', NODE_TYPE_IDS.characterImage, {
        characterName: 'Bob',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e1', 'voiceA', 'charA'),
      makeEdge('e2', 'voiceB', 'charB'),
      makeEdge('e3', 'charA', 'seedance'),
      makeEdge('e4', 'charB', 'seedance'),
    ]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      {
        url: 'https://cdn/voice-a.mp3',
        nodeId: 'voiceA',
        characterName: 'Alice',
      },
      {
        url: 'https://cdn/voice-b.mp3',
        nodeId: 'voiceB',
        characterName: 'Bob',
      },
    ])
  })

  it('deduplicates the same voice URL appearing on multiple paths', () => {
    const nodes = [
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/voice.mp3',
      }),
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        characterName: 'Alice',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      // Same voice URL reachable both directly and through char.
      makeEdge('e1', 'voice', 'char'),
      makeEdge('e2', 'char', 'seedance'),
      makeEdge('e3', 'voice', 'seedance'),
    ]
    // Character-bound path takes priority, second path is dropped.
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      { url: 'https://cdn/voice.mp3', nodeId: 'voice', characterName: 'Alice' },
    ])
  })

  it('skips voice nodes with no recorded audio URL', () => {
    const nodes = [
      makeNode('voice', NODE_TYPE_IDS.voice),
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        characterName: 'Alice',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e1', 'voice', 'char'),
      makeEdge('e2', 'char', 'seedance'),
    ]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([])
  })

  it('uses character.name fallback when characterName is missing', () => {
    const nodes = [
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/v.mp3',
      }),
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        character: {
          characterId: 'char-1',
          name: 'Charlie',
          visualSeed: 'soft-cyan-haired explorer',
        },
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e1', 'voice', 'char'),
      makeEdge('e2', 'char', 'seedance'),
    ]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      { url: 'https://cdn/v.mp3', nodeId: 'voice', characterName: 'Charlie' },
    ])
  })

  it('carries the voice cover image through for the token thumbnail (§8.2)', () => {
    const nodes = [
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/v.mp3',
        voiceCoverImage: 'https://cdn/voice-cover.png',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e1', 'voice', 'seedance')]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      {
        url: 'https://cdn/v.mp3',
        nodeId: 'voice',
        coverImage: 'https://cdn/voice-cover.png',
      },
    ])
  })

  it('prefers the reference-audio cover over the system voice cover', () => {
    const nodes = [
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/v.mp3',
        voiceCoverImage: 'https://cdn/system-cover.png',
        voiceReferenceCoverImage: 'https://cdn/reference-cover.png',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e1', 'voice', 'seedance')]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      {
        url: 'https://cdn/v.mp3',
        nodeId: 'voice',
        coverImage: 'https://cdn/reference-cover.png',
      },
    ])
  })
})

describe('summarizeUpstreamSeedanceReferences', () => {
  it('counts images / videos and names character-routed audio', () => {
    const nodes = [
      makeNode('seedance', NODE_TYPE_IDS.seedance),
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        imageUrl: 'https://cdn/char.png',
        characterName: 'Alice',
      }),
      makeNode('frame', NODE_TYPE_IDS.frameImage, {
        imageUrl: 'https://cdn/frame.png',
      }),
      makeNode('clip', NODE_TYPE_IDS.videoReference, {
        mediaUrl: 'https://cdn/clip.mp4',
      }),
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/voice.mp3',
      }),
    ]
    const edges = [
      makeEdge('e1', 'char', 'seedance'),
      makeEdge('e2', 'frame', 'seedance'),
      makeEdge('e3', 'clip', 'seedance'),
      makeEdge('e4', 'voice', 'char'),
    ]

    expect(
      summarizeUpstreamSeedanceReferences('seedance', edges, nodes),
    ).toEqual({
      imageCount: 2,
      videoCount: 1,
      audio: [{ characterName: 'Alice' }],
    })
  })

  it('returns zeros when nothing is wired upstream', () => {
    const nodes = [makeNode('seedance', NODE_TYPE_IDS.seedance)]
    expect(summarizeUpstreamSeedanceReferences('seedance', [], nodes)).toEqual({
      imageCount: 0,
      videoCount: 0,
      audio: [],
    })
  })

  it('omits characterName for voices wired directly into the node', () => {
    const nodes = [
      makeNode('seedance', NODE_TYPE_IDS.seedance),
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn/voice.mp3',
      }),
    ]
    const edges = [makeEdge('e1', 'voice', 'seedance')]

    expect(
      summarizeUpstreamSeedanceReferences('seedance', edges, nodes),
    ).toEqual({
      imageCount: 0,
      videoCount: 0,
      audio: [{}],
    })
  })

  // R3-6b §3: the image count reflects a per-edge stage override, not just
  // the card's own onStage curation — this is the same harvest the actual
  // send path (harvestUpstreamImageUrls with edges+focalNodeId) uses.
  it('counts a per-edge stageOverrideUrls expansion, not the card onStage set', () => {
    const nodes = [
      makeNode('seedance', NODE_TYPE_IDS.seedance),
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        imageUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    const edges = [
      makeEdge('e1', 'char', 'seedance', {
        stageOverrideUrls: [
          'https://cdn/override1.png',
          'https://cdn/override2.png',
        ],
      }),
    ]

    expect(
      summarizeUpstreamSeedanceReferences('seedance', edges, nodes).imageCount,
    ).toBe(3)
  })
})
