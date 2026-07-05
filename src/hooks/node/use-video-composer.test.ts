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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
    // character token (named) + keyframe token (projection-only 镜头卡).
    const character = tokens.find((token) => token.kind === 'character')
    const keyframe = tokens.find((token) => token.kind === 'keyframe')
    expect(character).toMatchObject({
      id: 'char1',
      token: '@角色A',
      imageSlotIndex: 1,
      edgeId: 'e-char',
    })
    // Keyframe rides image_urls first → slot 0.
    expect(keyframe).toMatchObject({ id: 'frame1', imageSlotIndex: 0 })
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

  it('surfaces a keyframe node as a projection-only 镜头卡 token (图N order)', () => {
    graphState.nodes = [
      makeNode('kf1', NODE_TYPE_IDS.frameImage, {
        imageUrl: 'https://cdn.test/kf.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-kf', 'kf1', 'video1')]

    const kf = renderComposer().referenceTokens.find(
      (token) => token.kind === 'keyframe',
    )
    expect(kf).toMatchObject({
      id: 'kf1',
      kind: 'keyframe',
      token: '',
      insertable: false,
      mediaUrl: 'https://cdn.test/kf.png',
      imageSlotIndex: 0,
      edgeId: 'e-kf',
    })
  })

  it('auto-numbers an upstream video source as an insertable @token (§9 D)', () => {
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
      token: '@autoName.video1',
      insertable: true,
      mediaUrl: 'https://cdn.test/ref-thumb.webp',
      videoSlotIndex: 0,
      edgeId: 'e-ref',
    })
  })

  it('auto-numbers an unnamed character/background/shot off its real image slot (§9 C)', () => {
    graphState.nodes = [
      makeNode('bg1', NODE_TYPE_IDS.backgroundImage, {
        imageUrl: 'https://cdn.test/bg.png',
      }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '角色A',
        imageUrl: 'https://cdn.test/char.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [
      makeEdge('e-bg', 'bg1', 'video1'),
      makeEdge('e-char', 'char1', 'video1'),
    ]

    const tokens = renderComposer().referenceTokens
    const background = tokens.find((token) => token.kind === 'background')
    const character = tokens.find((token) => token.kind === 'character')
    // Unnamed background auto-numbers off its OWN image_urls slot (index 0) —
    // the number matches the 图N badge exactly, not a separate per-kind count.
    expect(background).toMatchObject({ token: '@autoName.background1' })
    // A user-named reference keeps its own name regardless of auto-numbering.
    expect(character).toMatchObject({ token: '@角色A' })
  })

  it('leaves a medialess unnamed reference without a token (no payload slot to number)', () => {
    graphState.nodes = [
      makeNode('bg1', NODE_TYPE_IDS.backgroundImage, {}),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-bg', 'bg1', 'video1')]

    const tokens = renderComposer().referenceTokens
    expect(tokens[0]).toMatchObject({ token: '', imageSlotIndex: undefined })
  })
})
