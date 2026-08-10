import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { buildVideoSendPreview } from './node-video-send-preview'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Partial<NodeWorkflowNode['data']> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data } as NodeWorkflowNode['data'],
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

const AUTO_NAME_PREFIX = {
  character: '角色',
  background: '场景',
  shot: '镜头',
  closeup: '特写',
  video: '视频',
}

describe('buildVideoSendPreview (R3-6b §2 发送图例预览)', () => {
  it('binds a named character reference to @Image1 in the translated prompt and legend', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '凛',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance, { prompt: '@凛 走进房间' }),
    ]
    const edges = [makeEdge('e-char', 'char1', 'video1')]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[1].data,
      edges,
      nodes,
      maxReferenceImages: 9,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.translatedPrompt).toBe('@Image1（凛） 走进房间')
    expect(preview.legend).toContain('角色「凛」')
    expect(preview.images).toEqual([
      {
        url: 'https://cdn/char.png',
        index: 1,
        name: '凛',
        kind: 'character',
        category: undefined,
      },
    ])
    expect(preview.overflow).toEqual([])
    expect(preview.assembledImageCount).toBe(1)
  })

  it('sends a directly connected role-less image instead of silently dropping it', () => {
    const nodes = [
      makeNode('loose1', NODE_TYPE_IDS.image, {
        mediaUrl: 'https://cdn/loose.png',
        mediaLabel: '甲板静帧',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance, {
        prompt: '让画面里的风衣轻轻摆动',
      }),
    ]
    const edges = [makeEdge('e-loose', 'loose1', 'video1')]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[1].data,
      edges,
      nodes,
      maxReferenceImages: 9,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.images).toEqual([
      {
        url: 'https://cdn/loose.png',
        index: 1,
        // ⚠ 这里原本期望的是 `'镜头1'`（autoName 兜底）—— 夹具明明给了
        // `mediaLabel: '甲板静帧'`，图例里却叫「镜头1」。那条期望**锁的是缺陷**：
        // 名字解析只读 characterName/backgroundName/shotName 三个字段，够不到
        // mediaLabel，于是同一个节点在卡片标题上叫「甲板静帧」、在图例与槽架里
        // 叫「镜头1」。2026-08-09 owner 真机点出来，改用全仓唯一的
        // `resolveNodeDisplayName` 后，用户起的名字终于能一路走到模型那里。
        name: '甲板静帧',
        kind: 'shot',
        category: '镜头',
      },
    ])
    expect(preview.assembledImageCount).toBe(1)
    expect(preview.overflow).toEqual([])
  })

  it('lists cap-truncated candidates as overflow, independent of the images list', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char1.png',
        characterName: 'A',
      }),
      makeNode('char2', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char2.png',
        characterName: 'B',
      }),
      makeNode('char3', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char3.png',
        characterName: 'C',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance, {
        prompt: '一段没有@提及的镜头',
      }),
    ]
    const edges = [
      makeEdge('e1', 'char1', 'video1'),
      makeEdge('e2', 'char2', 'video1'),
      makeEdge('e3', 'char3', 'video1'),
    ]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[3].data,
      edges,
      nodes,
      maxReferenceImages: 2,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    // 槽位顺序即发送顺序，上限之外的进 overflow。
    expect(preview.images.map((image) => image.url)).toEqual([
      'https://cdn/char1.png',
      'https://cdn/char2.png',
    ])
    expect(preview.overflow).toEqual([
      { url: 'https://cdn/char3.png', name: 'C' },
    ])
    expect(preview.assembledImageCount).toBe(2)
  })

  /**
   * ⚠ 行为变更（2026-08-09，`@` narrowing 退役）：这条原本断言「被 `@` 提到的图
   * 能突破上限被救回来」—— 收窄先于截断跑，于是 C 虽然排第 3、上限是 2，仍然是
   * 唯一发出去的那张。
   *
   * 那等于让「在正文里提一句」变成**优先级机制**，而优先级的真相应该只有一个：
   * 槽架里的顺序。契约（`canvas-slot-rack.md` §一）把「发什么」判给槽架之后，
   * 正文只负责位置标注，不该再能改变谁进谁不进。
   *
   * 现在：按槽位顺序发 A、B，C 超出上限进 dropped（UI 上标「不会发送」）。用户
   * 正文里那个 `@C` 因为翻译不到位置而退化成普通文字 —— **诚实**：容量不够就是
   * 不够，不能因为提到它就凭空多一个位置。
   */
  it('超出上限的图不会因为「正文提到了它」而被救回来', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char1.png',
        characterName: 'A',
      }),
      makeNode('char2', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char2.png',
        characterName: 'B',
      }),
      makeNode('char3', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char3.png',
        characterName: 'C',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance, { prompt: '镜头缓缓推向@C' }),
    ]
    const edges = [
      makeEdge('e1', 'char1', 'video1'),
      makeEdge('e2', 'char2', 'video1'),
      makeEdge('e3', 'char3', 'video1'),
    ]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[3].data,
      edges,
      nodes,
      maxReferenceImages: 2,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    // 按槽位顺序发前两张，与「谁被提到」无关。
    expect(preview.images.map((image) => image.url)).toEqual([
      'https://cdn/char1.png',
      'https://cdn/char2.png',
    ])
    // C 没发出去，所以 @C 不该翻译成一个载荷里不存在的 @ImageN。
    expect(preview.translatedPrompt).toBe('镜头缓缓推向@C')
    expect(preview.overflow).toEqual([
      { url: 'https://cdn/char3.png', name: 'C' },
    ])
    expect(preview.assembledImageCount).toBe(2)
  })

  it('skips capping entirely when maxReferenceImages is undefined (model unknown)', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char1.png',
      }),
      makeNode('char2', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char2.png',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e1', 'char1', 'video1'),
      makeEdge('e2', 'char2', 'video1'),
    ]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[2].data,
      edges,
      nodes,
      maxReferenceImages: undefined,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.overflow).toEqual([])
    expect(preview.assembledImageCount).toBe(2)
  })

  it('honors a per-edge stageOverrideUrls when composing the candidate set', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '凛',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default.png',
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

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[1].data,
      edges,
      nodes,
      maxReferenceImages: 9,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.images.map((image) => image.url)).toEqual([
      'https://cdn/char.png',
      'https://cdn/override-extra.png',
    ])
    expect(
      preview.images.some(
        (image) => image.url === 'https://cdn/card-default.png',
      ),
    ).toBe(false)
  })

  it('lists video and audio entries alongside the image list', () => {
    const nodes = [
      makeNode('clip1', NODE_TYPE_IDS.videoReference, {
        mediaUrl: 'https://cdn/clip.mp4',
      }),
      makeNode('voice1', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice.mp3',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e-clip', 'clip1', 'video1'),
      makeEdge('e-voice', 'voice1', 'video1'),
    ]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[2].data,
      edges,
      nodes,
      maxReferenceImages: 9,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.videoUrls).toEqual(['https://cdn/clip.mp4'])
    expect(preview.audioEntries).toEqual([
      {
        index: 1,
        label: '旁白',
        url: 'https://cdn/voice.mp3',
        characterName: undefined,
      },
    ])
  })

  it('returns empty structures for a node with nothing wired and no prompt', () => {
    const nodes = [makeNode('video1', NODE_TYPE_IDS.seedance)]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[0].data,
      edges: [],
      nodes,
      maxReferenceImages: 9,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.translatedPrompt).toBe('')
    expect(preview.legend).toBe('')
    expect(preview.images).toEqual([])
    expect(preview.overflow).toEqual([])
    expect(preview.assembledImageCount).toBe(0)
    expect(preview.videoUrls).toEqual([])
    expect(preview.audioEntries).toEqual([])
  })

  it('projects the same connected graph into Kling first-frame-only input', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '凛',
      }),
      makeNode('char2', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char-2.png',
        characterName: '澪',
      }),
      makeNode('clip1', NODE_TYPE_IDS.videoReference, {
        mediaUrl: 'https://cdn/clip.mp4',
      }),
      makeNode('voice1', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice.mp3',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance, { prompt: '雨夜前行' }),
    ]
    const edges = [
      makeEdge('e1', 'char1', 'video1'),
      makeEdge('e2', 'char2', 'video1'),
      makeEdge('e3', 'clip1', 'video1'),
      makeEdge('e4', 'voice1', 'video1'),
    ]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[4].data,
      edges,
      nodes,
      modelId: AI_MODELS.KLING_V3_PRO,
      adapterType: AI_ADAPTER_TYPES.FAL,
      maxReferenceImages: 9,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.request).toMatchObject({
      prompt: '雨夜前行',
      referenceImages: ['https://cdn/char.png'],
    })
    expect(preview.request.audioUrls).toBeUndefined()
    expect(preview.request.videoUrls).toBeUndefined()
    expect(preview.legend).toBe('')
    expect(preview.dropped).toEqual(
      expect.arrayContaining([
        {
          kind: 'audio',
          url: 'https://cdn/voice.mp3',
          reason: 'unsupported',
        },
        {
          kind: 'video',
          url: 'https://cdn/clip.mp4',
          reason: 'unsupported',
        },
        {
          kind: 'image',
          url: 'https://cdn/char-2.png',
          reason: 'model-limit',
        },
      ]),
    )
  })

  it('blocks Seedance Reference audio-only input instead of emitting an invalid request', () => {
    const nodes = [
      makeNode('voice1', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice.mp3',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance, { prompt: '说出台词' }),
    ]
    const edges = [makeEdge('e1', 'voice1', 'video1')]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[1].data,
      edges,
      nodes,
      modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
      adapterType: AI_ADAPTER_TYPES.FAL,
      maxReferenceImages: 9,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.blockers).toContain('audio-requires-visual')
    expect(preview.canSubmit).toBe(false)
  })

  it('keeps Gemini image-only and marks the missing execution route', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
      }),
      makeNode('voice1', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice.mp3',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance, { prompt: '向镜头挥手' }),
    ]
    const edges = [
      makeEdge('e1', 'char1', 'video1'),
      makeEdge('e2', 'voice1', 'video1'),
    ]

    const preview = buildVideoSendPreview({
      nodeId: 'video1',
      data: nodes[2].data,
      edges,
      nodes,
      modelId: AI_MODELS.GEMINI_OMNI_FLASH,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      maxReferenceImages: 14,
      autoNamePrefix: AUTO_NAME_PREFIX,
    })

    expect(preview.request.referenceImages).toEqual(['https://cdn/char.png'])
    expect(preview.request.audioUrls).toBeUndefined()
    expect(preview.blockers).toContain('execution-not-migrated')
    expect(preview.canSubmit).toBe(false)
  })
})
