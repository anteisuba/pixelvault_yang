import { describe, expect, it } from 'vitest'

import { NODE_STUDIO_INGEST_REJECT_REASON_IDS } from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { evaluateCastIngest } from './use-cast-ingest'

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

  it('never raises capacityFull for a voice source (no known cap for that pool)', () => {
    const voice = makeNode('voice-1', NODE_TYPE_IDS.voice)
    const character = makeNode('character-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    expect(
      evaluateCastIngest(voice, character, [], [voice, character]),
    ).toEqual({ legal: true })
  })
})
