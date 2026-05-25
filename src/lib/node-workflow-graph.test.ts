import { describe, expect, it } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import {
  getNodeMediaUrl,
  getUpstreamNodes,
  harvestUpstreamImageUrls,
  harvestUpstreamShotTextPrompt,
  harvestUpstreamVoiceAudioUrls,
  isKeyframeNode,
  isShotTextNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
  mergePromptWithUpstreamText,
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
): NodeWorkflowEdge {
  return { id, source, target } as NodeWorkflowEdge
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
