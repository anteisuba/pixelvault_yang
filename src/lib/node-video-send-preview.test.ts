import { describe, expect, it } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
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

    // Migration guard: no @-mention hit → filterReferencedImages keeps the
    // full (capped) set, so images reflects all 2 that survived the cap.
    expect(preview.images.map((image) => image.url)).toEqual([
      'https://cdn/char1.png',
      'https://cdn/char2.png',
    ])
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
        voiceReferenceAudioUrl: 'https://cdn/voice.mp3',
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
    expect(preview.audioEntries).toEqual([{ index: 1, label: '旁白' }])
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
})
