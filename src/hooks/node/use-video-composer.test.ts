import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
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
  data?: Record<string, unknown>,
): NodeWorkflowEdge {
  return { id, source, target, ...(data ? { data } : {}) } as NodeWorkflowEdge
}

function renderComposer(prompt = '') {
  const data = { prompt, status: 'idle' } as NodeWorkflowNodeData
  return renderHook(() => useVideoComposer('video1', data)).result.current
}

function renderComposerWithData(data: Partial<NodeWorkflowNodeData>) {
  const fullData = {
    prompt: '',
    status: 'idle',
    ...data,
  } as NodeWorkflowNodeData
  return renderHook(() => useVideoComposer('video1', fullData)).result.current
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

  it('surfaces a closeup as an insertable @token tagged to its character (§9 B)', () => {
    // closeup → character → video: closeup is resolved 1-hop from the character,
    // rides image_urls right behind it (slot 1), and its × detaches the
    // closeup→character edge, not the video edge.
    graphState.nodes = [
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
    graphState.edges = [
      makeEdge('e-cu', 'cu1', 'char1'),
      makeEdge('e-char', 'char1', 'video1'),
    ]

    const tokens = renderComposer().referenceTokens
    const character = tokens.find((token) => token.kind === 'character')
    const closeup = tokens.find((token) => token.kind === 'closeup')
    expect(character).toMatchObject({ token: '@剑修', imageSlotIndex: 0 })
    // No `insertable: false` → default insertable (it has a @token).
    expect(closeup).toMatchObject({
      id: 'cu1',
      kind: 'closeup',
      token: '@autoName.closeup2', // auto-numbered off its image slot (index 1)
      imageSlotIndex: 1,
      parentCharacterId: 'char1',
      edgeId: 'e-cu',
    })
    expect(closeup?.insertable).not.toBe(false)
  })

  it('uses a user-given closeup name over the auto number', () => {
    graphState.nodes = [
      makeNode('cu1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.closeup,
        characterName: '剑修脸',
        mediaUrl: 'https://cdn/cu1.png',
      }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '剑修',
        mediaUrl: 'https://cdn/char1.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [
      makeEdge('e-cu', 'cu1', 'char1'),
      makeEdge('e-char', 'char1', 'video1'),
    ]

    const closeup = renderComposer().referenceTokens.find(
      (token) => token.kind === 'closeup',
    )
    expect(closeup?.token).toBe('@剑修脸')
  })
})

describe('useVideoComposer referencedTokenIds (V-3a 管理素材面板)', () => {
  it('marks a token referenced when its @token literally appears in the prompt', () => {
    graphState.nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '角色A',
        imageUrl: 'https://cdn.test/char.png',
      }),
      makeNode('bg1', NODE_TYPE_IDS.backgroundImage, {
        backgroundName: '教室',
        imageUrl: 'https://cdn.test/bg.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [
      makeEdge('e-char', 'char1', 'video1'),
      makeEdge('e-bg', 'bg1', 'video1'),
    ]

    const composer = renderComposer('@角色A 走进 @教室')
    expect(composer.referencedTokenIds.has('char1')).toBe(true)
    expect(composer.referencedTokenIds.has('bg1')).toBe(true)
  })

  it('leaves a connected-but-unmentioned token out of referencedTokenIds', () => {
    graphState.nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '角色A',
        imageUrl: 'https://cdn.test/char.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-char', 'char1', 'video1')]

    const composer = renderComposer('一段完全没有提到 @ 的 prompt')
    expect(composer.referencedTokenIds.size).toBe(0)
  })

  it('matches a voice by its POSITIONAL @AudioN token, not its display label', () => {
    // §0-6 图↔音同名绑定: the voice's `label` is its display name, but what
    // MentionInput actually inserts/matches is the token string minus `@`
    // (e.g. "Audio1"), not the label — see VideoComposer's handleTokenInsert.
    graphState.nodes = [
      makeNode('voice1', NODE_TYPE_IDS.voice, {
        voiceName: '旁白甲',
        voiceReferenceAudioUrl: 'https://cdn.test/voice.mp3',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-voice', 'voice1', 'video1')]

    const referencedByLabel = renderComposer('旁白甲 说话').referencedTokenIds
    expect(referencedByLabel.size).toBe(0)

    const referencedByToken = renderComposer('@Audio1 说话').referencedTokenIds
    expect(referencedByToken.has('voice1')).toBe(true)
  })

  it('empty prompt / no tokens yields an empty referencedTokenIds set', () => {
    graphState.nodes = [makeNode('video1', NODE_TYPE_IDS.seedance)]
    graphState.edges = []
    expect(renderComposer('').referencedTokenIds.size).toBe(0)
  })
})

const SEEDANCE_MODEL = {
  optionId: 'seedance-ref',
  modelId: AI_MODELS.SEEDANCE_20_REFERENCE,
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
}

describe('useVideoComposer maxReferenceImages (R3-6b §1)', () => {
  it('resolves the model cap from data.model', () => {
    graphState.nodes = [makeNode('video1', NODE_TYPE_IDS.seedance)]
    graphState.edges = []
    const composer = renderComposerWithData({ model: SEEDANCE_MODEL })
    expect(composer.maxReferenceImages).toBe(9)
  })

  it('is undefined when no model is selected', () => {
    graphState.nodes = [makeNode('video1', NODE_TYPE_IDS.seedance)]
    graphState.edges = []
    expect(renderComposer().maxReferenceImages).toBeUndefined()
  })
})

describe('useVideoComposer sendPreview (R3-6b §2 发送图例预览)', () => {
  it('reflects the live translated prompt + legend for a named reference', () => {
    graphState.nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '凛',
        mediaUrl: 'https://cdn.test/char.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-char', 'char1', 'video1')]

    const composer = renderComposerWithData({
      prompt: '@凛 走进房间',
      model: SEEDANCE_MODEL,
    })

    expect(composer.sendPreview.translatedPrompt).toContain('@Image1')
    expect(composer.sendPreview.images).toEqual([
      expect.objectContaining({ url: 'https://cdn.test/char.png', index: 1 }),
    ])
    expect(composer.sendPreview.overflow).toEqual([])
  })

  it('surfaces cap-truncated candidates as overflow, matching the model cap', () => {
    const nodes = [
      makeNode('video1', NODE_TYPE_IDS.seedance),
      ...Array.from({ length: 3 }, (_, i) =>
        makeNode(`char${i}`, NODE_TYPE_IDS.characterImage, {
          mediaUrl: `https://cdn.test/char${i}.png`,
        }),
      ),
    ]
    graphState.nodes = nodes
    graphState.edges = [0, 1, 2].map((i) =>
      makeEdge(`e${i}`, `char${i}`, 'video1'),
    )

    // maxReferenceImages resolves from getMaxReferenceImages — use a model
    // whose cap is smaller than the 3 connected candidates by picking a
    // non-reference model id via the same adapter (default cap = 1).
    const composer = renderComposerWithData({
      model: {
        optionId: 'seedream',
        modelId: 'unknown-model-not-in-overrides',
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
      },
    })

    expect(composer.maxReferenceImages).toBe(1)
    expect(composer.sendPreview.assembledImageCount).toBe(1)
    expect(composer.sendPreview.overflow).toHaveLength(2)
  })
})

describe('useVideoComposer R3-6b §3 每镜覆写 (galleryAssets.stagedForVideo / stageOverrideActive)', () => {
  it('defaults stagedForVideo to the card onStage set when the edge carries no override', () => {
    graphState.nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '凛',
        mediaUrl: 'https://cdn.test/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn.test/extra1.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn.test/extra2.png',
            role: 'style',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [makeEdge('e-char', 'char1', 'video1')]

    const character = renderComposer().referenceTokens.find(
      (token) => token.kind === 'character',
    )
    expect(character?.stageOverrideActive).toBe(false)
    expect(character?.galleryAssets).toEqual([
      expect.objectContaining({ id: 'r1', stagedForVideo: true }),
      expect.objectContaining({ id: 'r2', stagedForVideo: false }),
    ])
  })

  it('an active edge override replaces the card onStage set and flags stageOverrideActive', () => {
    graphState.nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '凛',
        mediaUrl: 'https://cdn.test/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn.test/card-default.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn.test/override-pick.png',
            role: 'style',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [
      makeEdge('e-char', 'char1', 'video1', {
        stageOverrideUrls: ['https://cdn.test/override-pick.png'],
      }),
    ]

    const character = renderComposer().referenceTokens.find(
      (token) => token.kind === 'character',
    )
    expect(character?.stageOverrideActive).toBe(true)
    expect(character?.galleryAssets).toEqual([
      expect.objectContaining({ id: 'r1', stagedForVideo: false }),
      expect.objectContaining({ id: 'r2', stagedForVideo: true }),
    ])
  })

  it('an explicit empty override array stages only the primary (stageOverrideActive still true)', () => {
    graphState.nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        characterName: '凛',
        mediaUrl: 'https://cdn.test/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn.test/extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    graphState.edges = [
      makeEdge('e-char', 'char1', 'video1', { stageOverrideUrls: [] }),
    ]

    const character = renderComposer().referenceTokens.find(
      (token) => token.kind === 'character',
    )
    expect(character?.stageOverrideActive).toBe(true)
    expect(character?.galleryAssets).toEqual([
      expect.objectContaining({ id: 'r1', stagedForVideo: false }),
    ])
  })
})
