import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

const { graphState } = vi.hoisted(() => ({
  graphState: {
    nodes: [] as NodeWorkflowNode[],
    edges: [] as NodeWorkflowEdge[],
  },
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => graphState.nodes,
  useEdges: () => graphState.edges,
}))

vi.mock('@/components/business/node/NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    modelOptionsByType: {},
    updateNodeData: vi.fn(),
    defaultVideoModel: undefined,
  }),
}))

import { useVideoComposer } from './use-video-composer'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Partial<NodeWorkflowNodeData> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data } as NodeWorkflowNodeData,
  }
}

function makeEdge(
  id: string,
  source: string,
  target: string,
): NodeWorkflowEdge {
  return { id, source, target } as NodeWorkflowEdge
}

function renderComposer() {
  const data = { prompt: '', status: 'idle' } as NodeWorkflowNodeData
  return renderHook(() => useVideoComposer('video1', data)).result.current
}

describe('useVideoComposer referenceTokens (§7 部门条 bookkeeping)', () => {
  it('ties imageSlotIndex to the real payload order (keyframes occupy slots first)', () => {
    // Payload order per harvestUpstreamImageUrls: keyframes first, then
    // visual references — so the character lands at index 1, not 0.
    graphState.nodes = [
      makeNode('frame1', NODE_TYPE_IDS.frameImage, {
        imageUrl: 'https://cdn.test/frame.png',
      }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '角色A',
        imageUrl: 'https://cdn.test/char.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [
      makeEdge('e-frame', 'frame1', 'video1'),
      makeEdge('e-char', 'char1', 'video1'),
    ]

    const tokens = renderComposer().referenceTokens
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({
      id: 'char1',
      kind: 'character',
      token: '@角色A',
      imageSlotIndex: 1,
      edgeId: 'e-char',
    })
  })

  it('leaves imageSlotIndex unset when the reference has no media yet', () => {
    graphState.nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '角色A',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-char', 'char1', 'video1')]

    const tokens = renderComposer().referenceTokens
    expect(tokens[0].imageSlotIndex).toBeUndefined()
    expect(tokens[0].edgeId).toBe('e-char')
  })

  it('absorbs a routed voice as the character boundVoice, not a standalone token (音色收进角色)', () => {
    // cast-redesign: voice → character → video means the voice IS the
    // character's 音色 — it rides the character token as boundVoice, and there
    // is NO separate voice token (音色收进角色，不单列).
    graphState.nodes = [
      makeNode('voice1', NODE_TYPE_IDS.voice, {
        voiceName: '卡提希娅',
        voiceReferenceAudioUrl: 'https://cdn.test/voice.mp3',
      }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '角色A',
        imageUrl: 'https://cdn.test/char.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [
      makeEdge('e-voice', 'voice1', 'char1'),
      makeEdge('e-char', 'char1', 'video1'),
    ]

    const tokens = renderComposer().referenceTokens
    expect(tokens.some((token) => token.kind === 'voice')).toBe(false)
    const character = tokens.find((token) => token.kind === 'character')
    expect(character?.boundVoice).toMatchObject({
      nodeId: 'voice1',
      label: '卡提希娅',
      ready: true,
      audioSlotIndex: 0,
      edgeId: 'e-voice',
    })
  })

  it('marks a routed voice WITHOUT reference audio as an unready boundVoice (不静默丢)', () => {
    // The character keeps its 音色 facet even when no reference audio is set —
    // ready=false so the UI dims the badge instead of hiding the wire.
    graphState.nodes = [
      makeNode('voice1', NODE_TYPE_IDS.voice, { voiceName: '卡提希娅' }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '角色A',
        imageUrl: 'https://cdn.test/char.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [
      makeEdge('e-voice', 'voice1', 'char1'),
      makeEdge('e-char', 'char1', 'video1'),
    ]

    const tokens = renderComposer().referenceTokens
    const character = tokens.find((token) => token.kind === 'character')
    expect(character?.boundVoice).toMatchObject({
      nodeId: 'voice1',
      ready: false,
    })
    expect(character?.boundVoice?.audioSlotIndex).toBeUndefined()
  })

  it('surfaces a voice wired DIRECTLY into the video as a 旁白 token', () => {
    graphState.nodes = [
      makeNode('voice1', NODE_TYPE_IDS.voice, {
        voiceReferenceAudioUrl: 'https://cdn.test/voice.mp3',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-voice', 'voice1', 'video1')]

    const tokens = renderComposer().referenceTokens
    expect(tokens[0]).toMatchObject({
      kind: 'voice',
      token: '@Audio1',
      audioSlotIndex: 0,
      insertable: true,
      edgeId: 'e-voice',
    })
  })

  it('leaves a character with no wired voice without a boundVoice', () => {
    graphState.nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '角色A',
        imageUrl: 'https://cdn.test/char.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-char', 'char1', 'video1')]

    const character = renderComposer().referenceTokens.find(
      (token) => token.kind === 'character',
    )
    expect(character?.boundVoice).toBeUndefined()
  })

  it('projects upstream video sources as projection-only tokens with 视N order', () => {
    graphState.nodes = [
      makeNode('ref1', NODE_TYPE_IDS.videoReference, {
        mediaUrl: 'https://cdn.test/ref.mp4',
        videoThumbnailUrl: 'https://cdn.test/ref-thumb.webp',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-ref', 'ref1', 'video1')]

    const tokens = renderComposer().referenceTokens
    expect(tokens[0]).toMatchObject({
      id: 'ref1',
      kind: 'video',
      token: '',
      insertable: false,
      mediaUrl: 'https://cdn.test/ref-thumb.webp',
      videoSlotIndex: 0,
      edgeId: 'e-ref',
    })
  })
})
