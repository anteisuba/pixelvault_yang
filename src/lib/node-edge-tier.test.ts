import { describe, expect, it } from 'vitest'

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import {
  edgePairKey,
  NODE_EDGE_TIER_IDS,
  resolveNodeEdgeTier,
  resolveNodeEdgeVisibility,
} from './node-edge-tier'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

function makeEdge(source: string, target: string): NodeWorkflowEdge {
  return { id: `${source}->${target}`, source, target } as NodeWorkflowEdge
}

describe('resolveNodeEdgeTier', () => {
  it('classifies a legacy shot image → seedance as backbone (静帧先审再喂)', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.shot)
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(resolveNodeEdgeTier(makeEdge(shot.id, video.id), shot, video)).toBe(
      NODE_EDGE_TIER_IDS.backbone,
    )
  })

  it('classifies a unified image[role=shot] → seedance as backbone', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(resolveNodeEdgeTier(makeEdge(shot.id, video.id), shot, video)).toBe(
      NODE_EDGE_TIER_IDS.backbone,
    )
  })

  it('classifies seedance → seedance (前片引用) as backbone', () => {
    const clipA = makeNode('video-a', NODE_TYPE_IDS.seedance)
    const clipB = makeNode('video-b', NODE_TYPE_IDS.seedance)
    expect(
      resolveNodeEdgeTier(makeEdge(clipA.id, clipB.id), clipA, clipB),
    ).toBe(NODE_EDGE_TIER_IDS.backbone)
  })

  it('classifies any video source → videoMerge as backbone', () => {
    const merge = makeNode('merge-1', NODE_TYPE_IDS.videoMerge)
    const seedanceSource = makeNode('video-1', NODE_TYPE_IDS.seedance)
    const videoReferenceSource = makeNode(
      'video-ref-1',
      NODE_TYPE_IDS.videoReference,
    )
    const mergeSource = makeNode('merge-2', NODE_TYPE_IDS.videoMerge)

    for (const source of [seedanceSource, videoReferenceSource, mergeSource]) {
      expect(
        resolveNodeEdgeTier(makeEdge(source.id, merge.id), source, merge),
      ).toBe(NODE_EDGE_TIER_IDS.backbone)
    }
  })

  it('classifies character/background references into seedance as ingredient', () => {
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    const legacyCharacter = makeNode(
      'character-1',
      NODE_TYPE_IDS.characterImage,
    )
    const legacyBackground = makeNode(
      'background-1',
      NODE_TYPE_IDS.backgroundImage,
    )
    const unifiedCharacter = makeNode('character-2', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const unifiedBackground = makeNode('background-2', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.background,
    })

    for (const source of [
      legacyCharacter,
      legacyBackground,
      unifiedCharacter,
      unifiedBackground,
    ]) {
      expect(
        resolveNodeEdgeTier(makeEdge(source.id, video.id), source, video),
      ).toBe(NODE_EDGE_TIER_IDS.ingredient)
    }
  })

  it('classifies voice → character (listening donor) as ingredient', () => {
    const voice = makeNode('voice-1', NODE_TYPE_IDS.voice)
    const character = makeNode('character-1', NODE_TYPE_IDS.characterImage)
    expect(
      resolveNodeEdgeTier(makeEdge(voice.id, character.id), voice, character),
    ).toBe(NODE_EDGE_TIER_IDS.ingredient)
  })

  it('classifies voice → seedance (narration donor) as ingredient', () => {
    const voice = makeNode('voice-1', NODE_TYPE_IDS.voice)
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(
      resolveNodeEdgeTier(makeEdge(voice.id, video.id), voice, video),
    ).toBe(NODE_EDGE_TIER_IDS.ingredient)
  })

  it('classifies videoReference → seedance as ingredient (motion/style ref, not mainline)', () => {
    const reference = makeNode('video-ref-1', NODE_TYPE_IDS.videoReference)
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(
      resolveNodeEdgeTier(makeEdge(reference.id, video.id), reference, video),
    ).toBe(NODE_EDGE_TIER_IDS.ingredient)
  })

  it('classifies closeup → character as ingredient', () => {
    const closeup = makeNode('closeup-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.closeup,
    })
    const character = makeNode('character-1', NODE_TYPE_IDS.characterImage)
    expect(
      resolveNodeEdgeTier(
        makeEdge(closeup.id, character.id),
        closeup,
        character,
      ),
    ).toBe(NODE_EDGE_TIER_IDS.ingredient)
  })

  it('classifies shotText → seedance as ingredient', () => {
    const shotText = makeNode('shot-text-1', NODE_TYPE_IDS.shotText)
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(
      resolveNodeEdgeTier(makeEdge(shotText.id, video.id), shotText, video),
    ).toBe(NODE_EDGE_TIER_IDS.ingredient)
  })

  it('classifies a loose (role-less) image → seedance as ingredient', () => {
    const looseImage = makeNode('image-1', NODE_TYPE_IDS.image)
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(
      resolveNodeEdgeTier(makeEdge(looseImage.id, video.id), looseImage, video),
    ).toBe(NODE_EDGE_TIER_IDS.ingredient)
  })

  it('does not backbone a character/background reference feeding a shot image (only shot→seedance is backbone)', () => {
    const character = makeNode('character-1', NODE_TYPE_IDS.characterImage)
    const shot = makeNode('shot-1', NODE_TYPE_IDS.shot)
    expect(
      resolveNodeEdgeTier(makeEdge(character.id, shot.id), character, shot),
    ).toBe(NODE_EDGE_TIER_IDS.ingredient)
  })
})

describe('resolveNodeEdgeVisibility', () => {
  it('a backbone edge always renders, regardless of selection/generating/collapse', () => {
    expect(
      resolveNodeEdgeVisibility({
        tier: NODE_EDGE_TIER_IDS.backbone,
        endpointSelected: false,
        targetGenerating: false,
        relationsCollapsed: false,
      }),
    ).toBe(true)
    expect(
      resolveNodeEdgeVisibility({
        tier: NODE_EDGE_TIER_IDS.backbone,
        endpointSelected: false,
        targetGenerating: false,
        relationsCollapsed: true,
      }),
    ).toBe(true)
  })

  // FB-B（真机反馈后拍板反转默认）: 不收起（会话默认）= 全显，成分边即使
  // 未选中/未生成也照样渲染（神经中性墨线；石绿 revealed 由调用方另行叠加）。
  it('an ingredient edge shows by default (relationsCollapsed=false) with no selection/generating', () => {
    expect(
      resolveNodeEdgeVisibility({
        tier: NODE_EDGE_TIER_IDS.ingredient,
        endpointSelected: false,
        targetGenerating: false,
        relationsCollapsed: false,
      }),
    ).toBe(true)
  })

  it('collapsing (relationsCollapsed=true) hides an ingredient edge with no selection/generating', () => {
    expect(
      resolveNodeEdgeVisibility({
        tier: NODE_EDGE_TIER_IDS.ingredient,
        endpointSelected: false,
        targetGenerating: false,
        relationsCollapsed: true,
      }),
    ).toBe(false)
  })

  it('a collapsed ingredient edge still reveals when an endpoint is selected', () => {
    expect(
      resolveNodeEdgeVisibility({
        tier: NODE_EDGE_TIER_IDS.ingredient,
        endpointSelected: true,
        targetGenerating: false,
        relationsCollapsed: true,
      }),
    ).toBe(true)
  })

  it('a collapsed ingredient edge still reveals while its target is generating', () => {
    expect(
      resolveNodeEdgeVisibility({
        tier: NODE_EDGE_TIER_IDS.ingredient,
        endpointSelected: false,
        targetGenerating: true,
        relationsCollapsed: true,
      }),
    ).toBe(true)
  })
})

describe('edgePairKey', () => {
  it('joins source and target with a separator that cannot collide with a bare id', () => {
    expect(edgePairKey('a', 'b')).toBe('a::b')
  })

  it('is order-sensitive (a→b is not the same pair as b→a)', () => {
    expect(edgePairKey('a', 'b')).not.toBe(edgePairKey('b', 'a'))
  })
})
