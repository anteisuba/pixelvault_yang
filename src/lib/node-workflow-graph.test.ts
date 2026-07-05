import { describe, expect, it } from 'vitest'

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import {
  buildShotReferenceLegend,
  buildVideoReferenceLegend,
  getNodeMediaUrl,
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
})
