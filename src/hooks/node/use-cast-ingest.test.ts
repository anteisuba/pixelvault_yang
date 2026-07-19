import { describe, expect, it } from 'vitest'

import { NODE_STUDIO_INGEST_REJECT_REASON_IDS } from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { evaluateCastIngest, previewIngestCapacity } from './use-cast-ingest'

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

function makeEdge(
  id: string,
  source: string,
  target: string,
): NodeWorkflowEdge {
  return { id, source, target } as NodeWorkflowEdge
}

describe('evaluateCastIngest', () => {
  it('rejects a self-loop', () => {
    const node = makeNode('n1', NODE_TYPE_IDS.seedance)
    expect(evaluateCastIngest(node, node, [], [])).toEqual({
      legal: false,
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.typeMismatch,
    })
  })

  it('allows a character card into a video node (matches canConnectNodeTypes)', () => {
    const character = makeNode('character-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(
      evaluateCastIngest(character, video, [], [character, video]),
    ).toEqual({ legal: true })
  })

  it('rejects a type the connection matrix does not allow (voice into a shot)', () => {
    const voice = makeNode('voice-1', NODE_TYPE_IDS.voice)
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    expect(evaluateCastIngest(voice, shot, [], [voice, shot])).toEqual({
      legal: false,
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.typeMismatch,
    })
  })

  it('rejects a card that is already fed into the target (already含该卡)', () => {
    const character = makeNode('character-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    const edges = [makeEdge('e1', 'character-1', 'video-1')]
    expect(
      evaluateCastIngest(character, video, edges, [character, video]),
    ).toEqual({
      legal: false,
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.duplicate,
    })
  })

  it('does not raise capacityFull when the target has no model selected (limit unknowable)', () => {
    const character = makeNode('character-2', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    // 10 pre-existing image-contributing upstream nodes, but no model on the
    // target → the cap is unknowable, so the check must not fire at all
    // (task packet §6.3: "上限不可得则只说「参考位已满」" — here that means it
    // never claims full without a number to back it).
    const upstream = Array.from({ length: 10 }, (_, i) =>
      makeNode(`existing-${i}`, NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
      }),
    )
    const edges = upstream.map((node, i) =>
      makeEdge(`e${i}`, node.id, video.id),
    )
    expect(
      evaluateCastIngest(character, video, edges, [
        ...upstream,
        character,
        video,
      ]),
    ).toEqual({ legal: true })
  })

  it('raises capacityFull with current/limit once a model caps the reference slots', () => {
    const character = makeNode('character-2', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance, {
      model: {
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        modelId: 'gemini-3.1-flash-image-preview',
        apiKeyId: 'key-1',
      },
    })
    // Enough pre-existing image-contributing upstream nodes to exceed any
    // realistic per-model cap, regardless of its exact configured value.
    const upstream = Array.from({ length: 20 }, (_, i) =>
      makeNode(`existing-${i}`, NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
      }),
    )
    const edges = upstream.map((node, i) =>
      makeEdge(`e${i}`, node.id, video.id),
    )
    const result = evaluateCastIngest(character, video, edges, [
      ...upstream,
      character,
      video,
    ])
    expect(result.legal).toBe(false)
    expect(result.reason).toBe(
      NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull,
    )
    expect(result.limit).toBeGreaterThan(0)
    expect(result.current).toBeGreaterThanOrEqual(result.limit ?? 0)
  })

  it("R3-6 出场组: previewIngestCapacity counts a collector's full onStage set, not just 1 per node", () => {
    const character = makeNode('character-2', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance, {
      model: {
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        modelId: 'gemini-3.1-flash-image-preview',
        apiKeyId: 'key-1',
      },
    })
    // One collector, no onStage — pre-R3-6 baseline: 1 node = 1 slot.
    const plainCollector = makeNode('plain', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.background,
      mediaUrl: 'https://cdn/plain.png',
    })
    // A second collector with two onStage extras — should count as 3 slots
    // (primary + 2 extras), not 1.
    const stagedCollector = makeNode('staged', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      mediaUrl: 'https://cdn/staged-primary.png',
      referenceAssets: [
        {
          id: 'r1',
          url: 'https://cdn/staged-extra1.png',
          role: 'pose',
          weight: 0.72,
          source: 'upload',
          onStage: true,
        },
        {
          id: 'r2',
          url: 'https://cdn/staged-extra2.png',
          role: 'style',
          weight: 0.72,
          source: 'upload',
          onStage: true,
        },
      ],
    })
    const nodes = [character, video, plainCollector, stagedCollector]
    const edges = [
      makeEdge('e1', plainCollector.id, video.id),
      makeEdge('e2', stagedCollector.id, video.id),
    ]
    const result = previewIngestCapacity(character, video, edges, nodes)
    expect(result).not.toBeNull()
    // plainCollector contributes 1 (no onStage extras), stagedCollector
    // contributes 3 (primary + 2 onStage extras) → 4 total, not 2.
    expect(result?.current).toBe(4)
  })

  it('never raises capacityFull for a voice source (no known cap for that pool)', () => {
    const voice = makeNode('voice-1', NODE_TYPE_IDS.voice)
    const character = makeNode('character-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    expect(
      evaluateCastIngest(voice, character, [], [voice, character]),
    ).toEqual({ legal: true })
  })

  // S5f A「画布实体拖拽吞噬全覆盖」— these combinations were already legal per
  // canConnectNodeTypes before this slice (the matrix itself is untouched);
  // what S5f adds is the native-canvas-drag GESTURE that now reaches
  // evaluateCastIngest for them too (StudioNodeWorkbench.handleNodeDragStop).
  // Locking the legality contract in here as regression coverage for the
  // five task-packet rows, independent of the drag/DOM plumbing.

  it('row① allows a collector card (character/background) into a shot node', () => {
    const character = makeNode('character-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const background = makeNode('background-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.background,
    })
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    expect(evaluateCastIngest(character, shot, [], [character, shot])).toEqual({
      legal: true,
    })
    expect(
      evaluateCastIngest(background, shot, [], [background, shot]),
    ).toEqual({ legal: true })
  })

  it('row② allows voice into a video node (旁白) as well as into a character', () => {
    const voice = makeNode('voice-1', NODE_TYPE_IDS.voice)
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(evaluateCastIngest(voice, video, [], [voice, video])).toEqual({
      legal: true,
    })
  })

  it('row③ allows a reference video into a video node', () => {
    const videoReference = makeNode('video-ref-1', NODE_TYPE_IDS.videoReference)
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(
      evaluateCastIngest(videoReference, video, [], [videoReference, video]),
    ).toEqual({ legal: true })
  })

  it('row⑤ allows a loose (role-less) image directly into a video node', () => {
    const looseImage = makeNode('image-1', NODE_TYPE_IDS.image)
    const video = makeNode('video-1', NODE_TYPE_IDS.seedance)
    expect(
      evaluateCastIngest(looseImage, video, [], [looseImage, video]),
    ).toEqual({ legal: true })
  })

  it('row⑤ rejects a loose (role-less) image dropped on a shot node (矩阵只认 character/background 来源，not a bug)', () => {
    const looseImage = makeNode('image-1', NODE_TYPE_IDS.image)
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    expect(
      evaluateCastIngest(looseImage, shot, [], [looseImage, shot]),
    ).toEqual({
      legal: false,
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.typeMismatch,
    })
  })
})
