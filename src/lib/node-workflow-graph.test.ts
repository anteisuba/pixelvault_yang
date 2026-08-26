import { describe, expect, it } from 'vitest'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_REVIEW_STATE_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import {
  NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY,
  NODE_STUDIO_KEYFRAME_LEGEND_UNCLASSIFIED_CATEGORY,
  NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS,
} from '@/constants/node-studio'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import {
  buildReferenceAssetLegendEntries,
  buildShotReferenceLegend,
  buildVideoReferenceLegend,
  getEdgeStageOverrideUrls,
  getNodeMediaUrl,
  getNodePrimaryMediaUrl,
  getNodeStageMediaUrls,
  getSeedanceReferenceKind,
  getUpstreamNodes,
  harvestUpstreamAudioBindings,
  harvestUpstreamCloseupUrls,
  harvestUpstreamImageReferences,
  harvestUpstreamImageUrls,
  harvestUpstreamShotTextPrompt,
  harvestUpstreamVideoImageReferences,
  harvestUpstreamVideoUrls,
  isKeyframeNode,
  isShotNode,
  isShotTextNode,
  isVideoSourceNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
  mergePromptWithUpstreamText,
  resolveGenerateTargetKind,
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
  data?: Record<string, unknown>,
): NodeWorkflowEdge {
  return { id, source, target, ...(data ? { data } : {}) } as NodeWorkflowEdge
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

/**
 * 《画布修法》02 节刀 1：`inferComposerHost`（use-generate-composer.ts）与
 * `planNodeAssistantOps` 的 `generate` op（node-assistant-op-plan.ts）此前
 * 各自手写「身份卡 / text 不是生成目标」，两处注释互称同源。这个函数是它们
 * 现在真正共用的地基——这里只锁这一个函数自己的契约；两个调用方各自「再收
 * 窄到哪些媒体种类」仍由它们自己的既有测试覆盖
 * （use-generate-composer.test.ts 的 `inferComposerHost` 用例、
 * node-assistant-op-plan.test.ts 的 notGeneratable / video 放行用例）。
 */
describe('resolveGenerateTargetKind (生成目标判据的公共地基)', () => {
  it('身份卡（角色卡/背景卡）统一返回 undefined —— 不管是新 role 写法还是旧类型名', () => {
    for (const node of [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
      }),
      makeNode('c2', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
      }),
      makeNode('c3', NODE_TYPE_IDS.characterImage),
      makeNode('c4', NODE_TYPE_IDS.backgroundImage),
    ]) {
      expect(resolveGenerateTargetKind(node), node.id).toBeUndefined()
    }
  })

  it('text 节点（shotText）返回 undefined —— 没有落生成结果的地方', () => {
    expect(
      resolveGenerateTargetKind(makeNode('t1', NODE_TYPE_IDS.shotText)),
    ).toBeUndefined()
  })

  it('没有媒体种类的节点类型（composer/agent 自身）返回 undefined', () => {
    expect(
      resolveGenerateTargetKind(makeNode('n1', NODE_TYPE_IDS.composer)),
    ).toBeUndefined()
    expect(
      resolveGenerateTargetKind(makeNode('n2', NODE_TYPE_IDS.agent)),
    ).toBeUndefined()
  })

  it('image/audio/video 节点各自返回自己的种类 —— 不排除 video（差异化收窄留给调用方）', () => {
    expect(resolveGenerateTargetKind(makeNode('i1', NODE_TYPE_IDS.image))).toBe(
      NODE_MEDIA_KIND_IDS.image,
    )
    expect(resolveGenerateTargetKind(makeNode('v1', NODE_TYPE_IDS.voice))).toBe(
      NODE_MEDIA_KIND_IDS.audio,
    )
    expect(
      resolveGenerateTargetKind(makeNode('s1', NODE_TYPE_IDS.seedance)),
    ).toBe(NODE_MEDIA_KIND_IDS.video)
  })

  it('图这一侧（镜头/关键帧/特写 role）不受身份卡判据影响', () => {
    for (const role of [
      NODE_IMAGE_ROLE_IDS.shot,
      NODE_IMAGE_ROLE_IDS.frame,
      NODE_IMAGE_ROLE_IDS.closeup,
    ]) {
      expect(
        resolveGenerateTargetKind(
          makeNode(`i-${role}`, NODE_TYPE_IDS.image, { role }),
        ),
        role,
      ).toBe(NODE_MEDIA_KIND_IDS.image)
    }
  })
})

describe('isKeyframeNode (S5d frame 关键帧兼容迁移)', () => {
  it('still recognises the legacy role=frame / frameImage type unchanged', () => {
    expect(
      isKeyframeNode(makeNode('a', NODE_TYPE_IDS.image, { role: 'frame' })),
    ).toBe(true)
    expect(isKeyframeNode(makeNode('b', NODE_TYPE_IDS.frameImage))).toBe(true)
  })

  it('recognises a role-less image classified frameStart/frameEnd via imageCategory', () => {
    expect(
      isKeyframeNode(
        makeNode('a', NODE_TYPE_IDS.image, { imageCategory: 'frameStart' }),
      ),
    ).toBe(true)
    expect(
      isKeyframeNode(
        makeNode('b', NODE_TYPE_IDS.image, { imageCategory: 'frameEnd' }),
      ),
    ).toBe(true)
  })

  it('does not treat every category as a keyframe', () => {
    expect(
      isKeyframeNode(
        makeNode('a', NODE_TYPE_IDS.image, { imageCategory: 'style' }),
      ),
    ).toBe(false)
    expect(
      isKeyframeNode(makeNode('b', NODE_TYPE_IDS.image, { role: 'shot' })),
    ).toBe(false)
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
    // 无 role 的 image 按 shot 处理——与 isVisualReferenceNode（同样是
    // `role ?? shot`）和实际的图片载荷收割保持一致。2e783d5b 之前这里返回
    // null，和那两处对不上：节点会被收割进载荷却不出现在 chips 里。
    expect(getSeedanceReferenceKind(makeNode('e', NODE_TYPE_IDS.image))).toBe(
      'shot',
    )
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

describe('getNodePrimaryMediaUrl (V-2 主图)', () => {
  it('prefers the ★-starred referenceAssets entry over mediaUrl', () => {
    expect(
      getNodePrimaryMediaUrl({
        prompt: '',
        status: 'idle',
        mediaUrl: 'https://cdn/media.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/ref1.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
          },
          {
            id: 'r2',
            url: 'https://cdn/ref2.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
        ],
      }),
    ).toBe('https://cdn/ref2.png')
  })

  it('falls back to getNodeMediaUrl when nothing is starred (旧存档兼容)', () => {
    expect(
      getNodePrimaryMediaUrl({
        prompt: '',
        status: 'idle',
        mediaUrl: 'https://cdn/media.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/ref1.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ).toBe('https://cdn/media.png')
  })

  it('falls back to the first referenceAssets entry for a 融合-only card with no mediaUrl', () => {
    expect(
      getNodePrimaryMediaUrl({
        prompt: '',
        status: 'idle',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/ref1.png',
            role: 'identity',
            weight: 0.72,
            source: 'canvas',
          },
          {
            id: 'r2',
            url: 'https://cdn/ref2.png',
            role: 'identity',
            weight: 0.72,
            source: 'canvas',
          },
        ],
      }),
    ).toBe('https://cdn/ref1.png')
  })

  it('returns undefined for a fully empty card', () => {
    expect(
      getNodePrimaryMediaUrl({ prompt: '', status: 'idle' }),
    ).toBeUndefined()
  })
})

describe('getNodeStageMediaUrls (R3-6 出场组)', () => {
  it('degrades to exactly [primary] when no entry carries onStage (旧存档零漂移)', () => {
    expect(
      getNodeStageMediaUrls({
        prompt: '',
        status: 'idle',
        mediaUrl: 'https://cdn/media.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/ref1.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ).toEqual(['https://cdn/media.png'])
  })

  it('returns [] for a fully empty card', () => {
    expect(getNodeStageMediaUrls({ prompt: '', status: 'idle' })).toEqual([])
  })

  it('puts the ★-starred primary first, then onStage entries in array order', () => {
    expect(
      getNodeStageMediaUrls({
        prompt: '',
        status: 'idle',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/extra1.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/primary.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
          {
            id: 'r3',
            url: 'https://cdn/extra2.png',
            role: 'style',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r4',
            url: 'https://cdn/notstaged.png',
            role: 'costume',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ).toEqual([
      'https://cdn/primary.png',
      'https://cdn/extra1.png',
      'https://cdn/extra2.png',
    ])
  })

  it('dedupes when the primary entry is ALSO marked onStage', () => {
    expect(
      getNodeStageMediaUrls({
        prompt: '',
        status: 'idle',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/primary.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ).toEqual(['https://cdn/primary.png', 'https://cdn/extra.png'])
  })

  // R3-6b §3 每镜覆写
  it('override branch: forces the primary into position 0 even when the override array omits it', () => {
    expect(
      getNodeStageMediaUrls(
        {
          prompt: '',
          status: 'idle',
          referenceAssets: [
            {
              id: 'r1',
              url: 'https://cdn/primary.png',
              role: 'identity',
              weight: 0.72,
              source: 'upload',
              isPrimary: true,
            },
            {
              id: 'r2',
              url: 'https://cdn/onstage-but-ignored.png',
              role: 'pose',
              weight: 0.72,
              source: 'upload',
              onStage: true,
            },
          ],
        },
        ['https://cdn/override1.png', 'https://cdn/override2.png'],
      ),
    ).toEqual([
      'https://cdn/primary.png',
      'https://cdn/override1.png',
      'https://cdn/override2.png',
    ])
  })

  it('override branch: an EMPTY override array resolves to [primary] only, ignoring the card onStage set', () => {
    expect(
      getNodeStageMediaUrls(
        {
          prompt: '',
          status: 'idle',
          referenceAssets: [
            {
              id: 'r1',
              url: 'https://cdn/primary.png',
              role: 'identity',
              weight: 0.72,
              source: 'upload',
              isPrimary: true,
            },
            {
              id: 'r2',
              url: 'https://cdn/onstage-but-ignored.png',
              role: 'pose',
              weight: 0.72,
              source: 'upload',
              onStage: true,
            },
          ],
        },
        [],
      ),
    ).toEqual(['https://cdn/primary.png'])
  })

  it('overrideUrls omitted entirely (undefined) keeps the pre-R3-6b onStage fallback', () => {
    expect(
      getNodeStageMediaUrls({
        prompt: '',
        status: 'idle',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/primary.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ).toEqual(['https://cdn/primary.png', 'https://cdn/extra.png'])
  })
})

describe('getEdgeStageOverrideUrls (R3-6b §3)', () => {
  it('reads a well-formed stageOverrideUrls array off edge.data', () => {
    const edge = makeEdge('e1', 'char1', 'video1', {
      stageOverrideUrls: ['https://cdn/a.png', 'https://cdn/b.png'],
    })
    expect(getEdgeStageOverrideUrls(edge)).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
    ])
  })

  it('returns undefined for an edge with no data / no override field', () => {
    expect(getEdgeStageOverrideUrls(makeEdge('e1', 'a', 'b'))).toBeUndefined()
  })

  it('returns undefined for a missing edge', () => {
    expect(getEdgeStageOverrideUrls(undefined)).toBeUndefined()
  })

  it('degrades a malformed (non-array) value to undefined instead of throwing', () => {
    const edge = makeEdge('e1', 'char1', 'video1', {
      stageOverrideUrls: 'not-an-array',
    })
    expect(getEdgeStageOverrideUrls(edge)).toBeUndefined()
  })

  it('filters out non-string entries from a mixed-type array', () => {
    const edge = makeEdge('e1', 'char1', 'video1', {
      stageOverrideUrls: ['https://cdn/a.png', 42, null, 'https://cdn/b.png'],
    })
    expect(getEdgeStageOverrideUrls(edge)).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
    ])
  })

  it('an explicit empty array stays an empty array (not coerced to undefined)', () => {
    const edge = makeEdge('e1', 'char1', 'video1', { stageOverrideUrls: [] })
    expect(getEdgeStageOverrideUrls(edge)).toEqual([])
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

// ── 审核门（包 4 / §4.2 Q3「未过审不得进视频」是硬规则）─────────────────
describe('审核门 —— 只有 approved 能进下游', () => {
  it('blocks awaiting_review + rejected on the video harvest, and says which', () => {
    const upstream = [
      makeNode('ok', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/ok.png',
      }),
      makeNode('pending', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/pending.png',
        mediaReview: {
          'https://cdn/pending.png': { state: 'awaiting_review' },
        },
      }),
      makeNode('nope', NODE_TYPE_IDS.backgroundImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/nope.png',
        mediaReview: { 'https://cdn/nope.png': { state: 'rejected' } },
      }),
    ]

    const harvested = harvestUpstreamImageUrls(upstream)
    // 'ok' 从来没被标过 —— 祖父条款让它照常通过。
    expect(harvested.urls).toEqual(['https://cdn/ok.png'])
    // 排除时必须能说出是谁、为什么：静默少发一张比不挡更糟。
    expect(harvested.blocked).toEqual([
      {
        url: 'https://cdn/pending.png',
        nodeId: 'pending',
        state: 'awaiting_review',
      },
      { url: 'https://cdn/nope.png', nodeId: 'nope', state: 'rejected' },
    ])
  })

  it('blocks on the shot-image harvest too — the second, separate path', () => {
    // 两条收割链：视频侧走 harvestUpstreamImageUrls，镜头图侧走
    // harvestUpstreamImageReferences。只挡一条等于没挡。
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        characterName: '小林',
        mediaUrl: 'https://cdn/char.png',
        mediaReview: { 'https://cdn/char.png': { state: 'awaiting_review' } },
      }),
    ]

    const harvested = harvestUpstreamImageReferences(upstream)
    expect(harvested.references).toEqual([])
    expect(harvested.blocked).toEqual([
      { url: 'https://cdn/char.png', nodeId: 'char', state: 'awaiting_review' },
    ])
  })

  it('blocks a rejected closeup on the 1-hop path', () => {
    // 特写走 1 跳，一样骑 image_urls —— 只挡直连那层会留后门。
    const nodes = [
      makeNode('video1', NODE_TYPE_IDS.seedance, { status: 'idle' }),
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/char.png',
      }),
      makeNode('close', NODE_TYPE_IDS.image, {
        status: 'idle',
        role: NODE_IMAGE_ROLE_IDS.closeup,
        mediaUrl: 'https://cdn/close.png',
        mediaReview: { 'https://cdn/close.png': { state: 'rejected' } },
      }),
    ]
    const edges = [
      makeEdge('e1', 'char', 'video1'),
      makeEdge('e2', 'close', 'char'),
    ]

    const harvested = harvestUpstreamCloseupUrls('video1', edges, nodes)
    expect(harvested.urls).toEqual([])
    expect(harvested.blocked).toEqual([
      { url: 'https://cdn/close.png', nodeId: 'close', state: 'rejected' },
    ])
  })

  it('leaves every pre-existing project untouched (祖父条款)', () => {
    // 存量项目一个 mediaReview 都没有。若「查不到＝待审」，这里会全被挡下，
    // 等于全站回归 —— 这条断言就是那道保险。
    const upstream = [
      makeNode('a', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/a.png',
      }),
      makeNode('b', NODE_TYPE_IDS.backgroundImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/b.png',
      }),
    ]
    const harvested = harvestUpstreamImageUrls(upstream)
    expect(harvested.urls).toEqual(['https://cdn/a.png', 'https://cdn/b.png'])
    expect(harvested.blocked).toEqual([])
  })
})

describe('harvestUpstreamImageUrls — 首尾帧顺序', () => {
  it('首帧排在尾帧前面，与上游节点顺序无关', () => {
    // 这就是 §1 第 ② 层丢掉的那件事：首尾区别一直存在于 imageCategory，采集时没读它，
    // 两张关键帧按上游顺序入列 → provider 收到一组无序的图，视频不会以第二张结尾。
    const upstream = [
      makeNode('end', NODE_TYPE_IDS.image, {
        status: 'idle',
        imageCategory: 'frameEnd',
        mediaUrl: 'https://cdn/end.png',
      }),
      makeNode('start', NODE_TYPE_IDS.image, {
        status: 'idle',
        imageCategory: 'frameStart',
        mediaUrl: 'https://cdn/start.png',
      }),
    ]

    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/start.png',
      'https://cdn/end.png',
    ])
  })

  it('keyframeUrls 只含关键帧，参考图不混进来', () => {
    // 位置约定只在「全是关键帧」时成立：`urls` = [首帧, 角色图] 也是两条，下游按位置
    // 取就会把角色图当尾帧。所以关键帧那一段要单独交出来。
    const upstream = [
      makeNode('start', NODE_TYPE_IDS.image, {
        status: 'idle',
        imageCategory: 'frameStart',
        mediaUrl: 'https://cdn/start.png',
      }),
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/character.png',
      }),
    ]

    const harvested = harvestUpstreamImageUrls(upstream)
    expect(harvested.urls).toEqual([
      'https://cdn/start.png',
      'https://cdn/character.png',
    ])
    expect(harvested.keyframeUrls).toEqual(['https://cdn/start.png'])
  })

  it('keyframeUrls 是 urls 的真前缀 —— 被审核门挡下的关键帧不算数', () => {
    // 选一张压根没发出去的图当尾帧，等于凭空发明了一帧。
    const upstream = [
      makeNode('start', NODE_TYPE_IDS.image, {
        status: 'idle',
        imageCategory: 'frameStart',
        mediaUrl: 'https://cdn/start.png',
      }),
      makeNode('end', NODE_TYPE_IDS.image, {
        status: 'idle',
        imageCategory: 'frameEnd',
        mediaUrl: 'https://cdn/end.png',
        mediaReview: {
          'https://cdn/end.png': { state: NODE_REVIEW_STATE_IDS.rejected },
        },
      }),
    ]

    const harvested = harvestUpstreamImageUrls(upstream)
    expect(harvested.keyframeUrls).toEqual(['https://cdn/start.png'])
    for (const url of harvested.keyframeUrls) {
      expect(harvested.urls).toContain(url)
    }
  })

  it('没有分类的旧关键帧算首帧，存量图送出的第一张不变', () => {
    // 旧的 role==='frame' 节点没有 imageCategory。它们必须仍按原上游顺序排在最前，
    // 否则存量项目里「第一张就是首帧」的既有行为会被这次改动悄悄改掉。
    const upstream = [
      makeNode('legacy-a', NODE_TYPE_IDS.frameImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/legacy-a.png',
      }),
      makeNode('legacy-b', NODE_TYPE_IDS.frameImage, {
        status: 'idle',
        mediaUrl: 'https://cdn/legacy-b.png',
      }),
      makeNode('end', NODE_TYPE_IDS.image, {
        status: 'idle',
        imageCategory: 'frameEnd',
        mediaUrl: 'https://cdn/end.png',
      }),
    ]

    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/legacy-a.png',
      'https://cdn/legacy-b.png',
      'https://cdn/end.png',
    ])
  })

  it('同类关键帧之间保持上游顺序（排序必须稳定）', () => {
    const upstream = ['s1', 's2', 's3'].map((id) =>
      makeNode(id, NODE_TYPE_IDS.image, {
        status: 'idle',
        imageCategory: 'frameStart',
        mediaUrl: `https://cdn/${id}.png`,
      }),
    )

    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/s1.png',
      'https://cdn/s2.png',
      'https://cdn/s3.png',
    ])
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

    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
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
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/x.png',
    ])
  })

  it('ignores non-image upstream nodes', () => {
    const upstream = [
      makeNode('v', NODE_TYPE_IDS.voice, { status: 'idle' }),
      makeNode('t', NODE_TYPE_IDS.shotText, { status: 'idle' }),
    ]
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([])
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
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([])
  })

  it('V-2 主图: sends the ★-starred referenceAssets image instead of mediaUrl', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/char-alt.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/char-alt.png',
    ])
  })

  it('V-2 主图: a 融合-only card (no mediaUrl) now contributes its first referenceAssets image', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/fused.png',
            role: 'identity',
            weight: 0.72,
            source: 'canvas',
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/fused.png',
    ])
  })

  it('R3-6 出场组: a collector expands to its full onStage set (primary first)', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/extra1.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/notstaged.png',
            role: 'style',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/char.png',
      'https://cdn/extra1.png',
    ])
  })

  it('R3-6 出场组: a shot card (visual reference, not a collector) still sends only its primary', () => {
    const upstream = [
      makeNode('shot', NODE_TYPE_IDS.shot, {
        mediaUrl: 'https://cdn/shot.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/shot-extra.png',
            role: 'style',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/shot.png',
    ])
  })

  // R3-6b §3 每镜覆写
  it('honors a collector→video edge stageOverrideUrls when edges + focalNodeId are supplied', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    const edges = [
      makeEdge('e-char', 'char', 'video1', {
        stageOverrideUrls: ['https://cdn/override-extra.png'],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream, edges, 'video1').urls).toEqual([
      'https://cdn/char.png',
      'https://cdn/override-extra.png',
    ])
  })

  it('falls back to the card onStage set when edges/focalNodeId are omitted (shot path zero-drift)', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual([
      'https://cdn/char.png',
      'https://cdn/card-default-extra.png',
    ])
  })

  it('a per-edge override only affects THAT edge — a second video keeps the card default', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    const edges = [
      makeEdge('e-char-v1', 'char', 'video1', {
        stageOverrideUrls: ['https://cdn/override-extra.png'],
      }),
      makeEdge('e-char-v2', 'char', 'video2'),
    ]
    expect(harvestUpstreamImageUrls(upstream, edges, 'video1').urls).toEqual([
      'https://cdn/char.png',
      'https://cdn/override-extra.png',
    ])
    expect(harvestUpstreamImageUrls(upstream, edges, 'video2').urls).toEqual([
      'https://cdn/char.png',
      'https://cdn/card-default-extra.png',
    ])
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
    expect(harvestUpstreamCloseupUrls('video1', edges, nodes).urls).toEqual([
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
    expect(harvestUpstreamCloseupUrls('video1', edges, nodes).urls).toEqual([])
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
    expect(harvestUpstreamImageReferences(upstream).references).toEqual([
      { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
      { url: 'https://cdn/bg.png', kind: 'background', name: '拉海洛' },
    ])
  })

  // 画布修法 08-A：这个函数此前直读 characterName/backgroundName（本文件私有
  // 的 readCharacterName/readBackgroundName），不过共享解析器的机器值守卫。
  // 「选已有图」写入口把上传备注常量当名字写进这两个字段时，送进模型的镜头
  // 图例会原样带上那串机器备注。改走 resolveNodeDisplayName 之后必须回落 undefined。
  it('丢掉已知上传备注机器串，不把它当图例名字送给模型', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'Node Studio character output',
      }),
      makeNode('bg', NODE_TYPE_IDS.backgroundImage, {
        imageUrl: 'https://cdn/bg.png',
        backgroundName: 'Node Studio image node output',
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream).references).toEqual([
      { url: 'https://cdn/char.png', kind: 'character', name: undefined },
      { url: 'https://cdn/bg.png', kind: 'background', name: undefined },
    ])
  })

  it('V-2 主图: uses the ★-starred referenceAssets image for a shot node harvest', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/char-alt.png',
            role: 'identity',
            weight: 0.72,
            source: 'upload',
            isPrimary: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream).references).toEqual([
      { url: 'https://cdn/char-alt.png', kind: 'character', name: 'yangyang' },
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
    expect(harvestUpstreamImageReferences(upstream).references).toEqual([
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
        voiceClipUrl: 'https://cdn/v.mp3',
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
    expect(harvestUpstreamImageReferences(upstream).references).toEqual([
      { url: 'https://cdn/dup.png', kind: 'character', name: 'A' },
    ])
  })

  it('leaves name undefined when the node has none', () => {
    const upstream = [
      makeNode('bg', NODE_TYPE_IDS.backgroundImage, {
        mediaUrl: 'https://cdn/bg.png',
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream).references).toEqual([
      { url: 'https://cdn/bg.png', kind: 'background', name: undefined },
    ])
  })

  it('R3-6 出场组: expands a collector to primary + onStage extras, category-labeled when resolvable', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/prop.png',
            role: 'prop',
            weight: 0.72,
            source: 'upload',
            name: '古剑',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/plain-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream).references).toEqual([
      { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
      { url: 'https://cdn/prop.png', name: '古剑', category: '道具' },
      // No asset.name on this extra → falls back to the SAME kind+name format
      // as the primary (§3.0a "无分类则同名同 kind 格式").
      {
        url: 'https://cdn/plain-extra.png',
        kind: 'character',
        name: 'yangyang',
      },
    ])
  })

  it('R3-6 出场组: a card with no onStage entries degrades to one entry per node (旧存档零漂移)', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/gallery-only.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
    ]
    expect(harvestUpstreamImageReferences(upstream).references).toEqual([
      { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
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

  // S5d ③ 分类进图例: a category-labeled entry (a shot's own referenceAssets)
  // prints "图N = 名字（分类）" — a different format from the kind-based
  // "图N：角色「名字」" line above, so the model doesn't read it as a subject.
  it('labels a category entry with the "图N = 名字（分类）" format', () => {
    const refByUrl = new Map<string, UpstreamImageReference>([
      [
        'https://cdn/char.png',
        { url: 'https://cdn/char.png', kind: 'character', name: 'yangyang' },
      ],
      [
        'https://cdn/prop.png',
        { url: 'https://cdn/prop.png', name: '古剑', category: '道具' },
      ],
    ])
    const legend = buildShotReferenceLegend(
      ['https://cdn/char.png', 'https://cdn/prop.png'],
      refByUrl,
    )
    expect(legend).toBe(
      '参考图说明：\n图1：角色「yangyang」\n图2 = 古剑（道具）',
    )
  })
})

describe('buildReferenceAssetLegendEntries (S5d ③)', () => {
  it('builds a category-labeled legend entry per named asset', () => {
    const entries = buildReferenceAssetLegendEntries([
      {
        id: 'r1',
        url: 'https://cdn/prop.png',
        role: 'prop',
        weight: 0.7,
        source: 'upload',
        name: '古剑',
      },
    ])
    expect(entries.get('https://cdn/prop.png')).toEqual({
      url: 'https://cdn/prop.png',
      name: '古剑',
      category: '道具',
    })
  })

  it('uses customLabel for a custom-role asset', () => {
    const entries = buildReferenceAssetLegendEntries([
      {
        id: 'r1',
        url: 'https://cdn/x.png',
        role: 'custom',
        customLabel: '布景残片',
        weight: 0.7,
        source: 'upload',
        name: '碎片',
      },
    ])
    expect(entries.get('https://cdn/x.png')?.category).toBe('布景残片')
  })

  it('skips an unnamed asset and a custom-role asset with no typed label', () => {
    const entries = buildReferenceAssetLegendEntries([
      {
        id: 'r1',
        url: 'https://cdn/noname.png',
        role: 'prop',
        weight: 0.7,
        source: 'upload',
      },
      {
        id: 'r2',
        url: 'https://cdn/nolabel.png',
        role: 'custom',
        weight: 0.7,
        source: 'upload',
        name: '某物',
      },
    ])
    expect(entries.size).toBe(0)
  })

  it('returns an empty map for undefined/empty input', () => {
    expect(buildReferenceAssetLegendEntries(undefined).size).toBe(0)
    expect(buildReferenceAssetLegendEntries([]).size).toBe(0)
  })
})

describe('harvestUpstreamVideoImageReferences (§7.2⑦ 视频图例真源)', () => {
  /**
   * ⚠ 回归（owner 2026-08-09 真机点出）：一张上传进来的图，卡片标题写着
   * 「漂泊者_全身_官方_0016」，图例与槽架里却叫「镜头2」。
   *
   * 根因是名字解析各写各的 —— 这里原本只读
   * `characterName` / `backgroundName` / `shotName` 三个字段，够不到
   * `mediaLabel` / `sourceLabel`，于是退回 autoName 兜底；而卡片标题、候选菜单、
   * 连线提示走的是全仓唯一的 `resolveNodeDisplayName`（它认那两个字段）。
   * 同一个节点两个名字，取决于你在哪看，且**用户看到的那个 @ 不出来**。
   *
   * ⭐ 同一个文件里当时就不自洽：关键帧那一支早已在读 `mediaLabel`。
   */
  it('⚠ 回归：上传图的 mediaLabel 就是它的名字，不该退回 autoName', () => {
    const nodes = [
      makeNode('loose1', NODE_TYPE_IDS.image, {
        mediaUrl: 'https://cdn/loose.png',
        mediaLabel: '漂泊者_全身_官方_0016',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e-loose', 'loose1', 'video1')]
    expect(
      harvestUpstreamVideoImageReferences('video1', edges, nodes).get(
        'https://cdn/loose.png',
      )?.name,
    ).toBe('漂泊者_全身_官方_0016')
  })

  it('用户起的名字优先于 mediaLabel（shotName 在解析链上更靠前）', () => {
    const nodes = [
      makeNode('shot1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.shot,
        mediaUrl: 'https://cdn/shot.png',
        mediaLabel: 'IMG_2024_final_v3',
        shotName: '开场远景',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e-shot', 'shot1', 'video1')]
    expect(
      harvestUpstreamVideoImageReferences('video1', edges, nodes).get(
        'https://cdn/shot.png',
      )?.name,
    ).toBe('开场远景')
  })

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

  // 画布修法 08-A：closeup 分支此前直读 characterName（本函数私有的通用 trim
  // 版 readName），够不到共享解析器的机器值守卫；关键帧分支同理直读
  // mediaLabel。「选已有图」写入口把上传备注常量当名字写进这两个字段时，
  // 送进模型的视频图例会原样带上那串机器备注。
  it('⚠ 回归：closeup / 关键帧丢掉已知上传备注机器串，退回 undefined/autoName', () => {
    const nodes = [
      makeNode('cu1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.closeup,
        mediaUrl: 'https://cdn/cu.png',
        characterName: 'Node Studio character output',
      }),
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '剑修',
      }),
      makeNode('frame1', NODE_TYPE_IDS.frameImage, {
        mediaUrl: 'https://cdn/frame.png',
        mediaLabel: 'Node Studio image node output',
        imageCategory: 'frameStart',
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e-cu', 'cu1', 'char1'),
      makeEdge('e-char', 'char1', 'video1'),
      makeEdge('e-frame', 'frame1', 'video1'),
    ]
    const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
    expect(map.get('https://cdn/cu.png')).toEqual({
      kind: 'closeup',
      name: undefined,
    })
    // 关键帧没有专有身份字段，未命名时退回 `${category}${ordinal}`——不是机
    // 器串本身，也不是空字符串。
    expect(map.get('https://cdn/frame.png')?.name).not.toBe(
      'Node Studio image node output',
    )
  })

  it('R3-6 出场组: expands a collector to primary + onStage extras, category-labeled when resolvable', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '剑修',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/prop.png',
            role: 'prop',
            weight: 0.72,
            source: 'upload',
            name: '古剑',
            onStage: true,
          },
          {
            id: 'r2',
            url: 'https://cdn/plain-extra.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e-char', 'char1', 'video1')]
    const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
    expect(map.get('https://cdn/char.png')).toEqual({
      kind: 'character',
      name: '剑修',
    })
    expect(map.get('https://cdn/prop.png')).toEqual({
      kind: 'character',
      name: '古剑',
      category: '道具',
    })
    // No asset.name → falls back to the SAME kind+name as the primary.
    expect(map.get('https://cdn/plain-extra.png')).toEqual({
      kind: 'character',
      name: '剑修',
    })
  })

  it('R3-6 出场组: a card with no onStage entries degrades to one map entry (旧存档零漂移)', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '剑修',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/gallery-only.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
          },
        ],
      }),
      makeNode('video1', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e-char', 'char1', 'video1')]
    const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
    expect(map.size).toBe(1)
    expect(map.get('https://cdn/char.png')).toEqual({
      kind: 'character',
      name: '剑修',
    })
  })

  // R3-6b §3 每镜覆写
  it('honors the collector→video edge stageOverrideUrls over the card onStage set', () => {
    const nodes = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: '剑修',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default-extra.png',
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
    const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
    // The override-selected extra is present, category-labeled from its own
    // referenceAssets entry (same fallback harvestUpstreamImageReferences uses).
    expect(map.get('https://cdn/override-extra.png')).toEqual({
      kind: 'character',
      name: '古剑',
      category: '道具',
    })
    // The card-default extra (onStage=true but NOT in the override) is absent
    // — the override REPLACES the card's own curation for this one edge.
    expect(map.has('https://cdn/card-default-extra.png')).toBe(false)
  })

  // SF-2b (canvas-shot-frame-fold-2026-07 §-1): 镜头/首帧被 @token 引用时必须
  // 带上分类，与 imageCategory 图片同格式同管线（"名字（分类）"）。
  describe('SF-2b 镜头/首帧分类映射', () => {
    it('a directly-referenced shot (unified image role=shot) carries category 镜头', () => {
      const nodes = [
        makeNode('shot1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          mediaUrl: 'https://cdn/shot.png',
          shotName: '开场镜头',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-shot', 'shot1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/shot.png')).toEqual({
        kind: 'shot',
        name: '开场镜头',
        category: '镜头',
      })
    })

    it('legacy shot type produces the SAME categorized entry as image role=shot (engine equivalence)', () => {
      const nodes = [
        makeNode('shot1', NODE_TYPE_IDS.shot, {
          mediaUrl: 'https://cdn/shot.png',
          shotName: '开场镜头',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-shot', 'shot1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/shot.png')).toEqual({
        kind: 'shot',
        name: '开场镜头',
        category: '镜头',
      })
    })

    it('a directly-referenced frame (unified image role=frame) carries category 首帧, named via mediaLabel', () => {
      const nodes = [
        makeNode('frame1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.frame,
          mediaUrl: 'https://cdn/frame.png',
          mediaLabel: '开场首帧',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-frame', 'frame1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/frame.png')).toEqual({
        name: '开场首帧',
        category: '首帧',
      })
    })

    it('legacy frameImage type produces the SAME categorized entry as image role=frame (engine equivalence)', () => {
      const nodes = [
        makeNode('frame1', NODE_TYPE_IDS.frameImage, {
          mediaUrl: 'https://cdn/frame.png',
          mediaLabel: '开场首帧',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-frame', 'frame1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/frame.png')).toEqual({
        name: '开场首帧',
        category: '首帧',
      })
    })

    it('an unnamed frame falls back to an ordinal placeholder name instead of dropping the entry', () => {
      const nodes = [
        makeNode('frame1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.frame,
          mediaUrl: 'https://cdn/frame.png',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-frame', 'frame1', 'video1')]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      expect(map.get('https://cdn/frame.png')).toEqual({
        name: '首帧1',
        category: '首帧',
      })
    })

    it('a role-less image classified imageCategory=frameStart/frameEnd resolves the MORE SPECIFIC 关键帧首/关键帧尾 label', () => {
      const nodes = [
        makeNode('kf1', NODE_TYPE_IDS.image, {
          mediaUrl: 'https://cdn/kf-start.png',
          imageCategory: 'frameStart',
        }),
        makeNode('kf2', NODE_TYPE_IDS.image, {
          mediaUrl: 'https://cdn/kf-end.png',
          imageCategory: 'frameEnd',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [
        makeEdge('e-kf1', 'kf1', 'video1'),
        makeEdge('e-kf2', 'kf2', 'video1'),
      ]
      const map = harvestUpstreamVideoImageReferences('video1', edges, nodes)
      // 断言读常量而不是写死字面量：这条测的是「**选了更具体的那个角色**」，不是
      // 那个角色当下叫什么字。2026-08-08 按 cleanup §2.2 把「关键帧首/尾」改成
      // 「首帧/尾帧」时，写死的字面量就是唯一红掉的地方 —— 它锁错了东西。
      const startLabel = NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS.frameStart
      const endLabel = NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS.frameEnd
      expect(map.get('https://cdn/kf-start.png')).toEqual({
        name: `${startLabel}1`,
        category: startLabel,
      })
      expect(map.get('https://cdn/kf-end.png')).toEqual({
        name: `${endLabel}2`,
        category: endLabel,
      })
    })

    // 图例说谎（2026-08-09 修）。三组夹具锁住兜底的全部行为：都没标 / 都标了 /
    // 混合。⚠ 断言一律读常量，不写字面量 —— 这条测的是「**第二张不再自称首帧**」，
    // 不是那个角色当下叫什么字（159f0518 就是被写死的字面量绊过一次）。
    describe('无分类关键帧的兜底分类（不得双双自称首帧）', () => {
      const looseKeyframe = (id: string) =>
        makeNode(id, NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.frame,
          mediaUrl: `https://cdn/${id}.png`,
        })
      const wire = [
        makeEdge('e-a', 'kfA', 'video1'),
        makeEdge('e-b', 'kfB', 'video1'),
      ]
      const frameLabel = NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY.frame
      const neutralLabel = NODE_STUDIO_KEYFRAME_LEGEND_UNCLASSIFIED_CATEGORY

      it('两个都没标：第一条仍是首帧，第二条走中性文案', () => {
        const map = harvestUpstreamVideoImageReferences('video1', wire, [
          looseKeyframe('kfA'),
          looseKeyframe('kfB'),
          makeNode('video1', NODE_TYPE_IDS.seedance),
        ])
        expect(map.get('https://cdn/kfA.png')).toEqual({
          name: `${frameLabel}1`,
          category: frameLabel,
        })
        // 缺陷时期这里是 { name: '首帧2', category: '首帧' } —— 名字与分类两处
        // 都说首帧，模型分不出首尾。
        expect(map.get('https://cdn/kfB.png')).toEqual({
          name: `${neutralLabel}2`,
          category: neutralLabel,
        })
      })

      it('两个都标了：各自的具体分类照旧，兜底不介入', () => {
        const map = harvestUpstreamVideoImageReferences('video1', wire, [
          makeNode('kfA', NODE_TYPE_IDS.image, {
            mediaUrl: 'https://cdn/kfA.png',
            imageCategory: 'frameStart',
          }),
          makeNode('kfB', NODE_TYPE_IDS.image, {
            mediaUrl: 'https://cdn/kfB.png',
            imageCategory: 'frameEnd',
          }),
          makeNode('video1', NODE_TYPE_IDS.seedance),
        ])
        const startLabel = NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS.frameStart
        const endLabel = NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS.frameEnd
        expect(map.get('https://cdn/kfA.png')?.category).toBe(startLabel)
        expect(map.get('https://cdn/kfB.png')?.category).toBe(endLabel)
      })

      it('混合：标了的用自己的分类，没标的按序位兜底', () => {
        const map = harvestUpstreamVideoImageReferences('video1', wire, [
          looseKeyframe('kfA'),
          makeNode('kfB', NODE_TYPE_IDS.image, {
            mediaUrl: 'https://cdn/kfB.png',
            imageCategory: 'frameEnd',
          }),
          makeNode('video1', NODE_TYPE_IDS.seedance),
        ])
        expect(map.get('https://cdn/kfA.png')?.category).toBe(frameLabel)
        expect(map.get('https://cdn/kfB.png')?.category).toBe(
          NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS.frameEnd,
        )
      })
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

  // R3-6 出场组: an EXTRA onStage image carrying a resolved category prints
  // "@ImageN = 名字（分类）" instead of the kind-based line — same branch
  // buildShotReferenceLegend already has, just under this legend's own
  // @Image-style imagePrefix (V-1 positional token).
  it('labels a category-carrying image reference with "prefixN = 名字（分类）"', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/char.png', { kind: 'character', name: '剑修' }],
      [
        'https://cdn/prop.png',
        { kind: 'character', name: '古剑', category: '道具' },
      ],
    ])
    const legend = buildVideoReferenceLegend({
      referenceImages: ['https://cdn/char.png', 'https://cdn/prop.png'],
      imageRefByUrl,
      videoUrls: [],
      audioBindings: [],
      labels,
    })
    expect(legend).toBe('参考素材说明：\n图1：角色「剑修」\n图2 = 古剑（道具）')
  })

  // SF-2b (canvas-shot-frame-fold-2026-07 §-1): a category-only entry (no
  // `kind` at all — a keyframe/首帧's shape) still prints the "=（分类）" line,
  // never the kind-based bracket wording (which would throw/undefined without
  // this branch, since there's no `labels.kindLabel[undefined]`).
  it('labels a kind-less category-only entry (keyframe shape) the same way', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/frame.png', { name: '开场首帧', category: '首帧' }],
    ])
    const legend = buildVideoReferenceLegend({
      referenceImages: ['https://cdn/frame.png'],
      imageRefByUrl,
      videoUrls: [],
      audioBindings: [],
      labels,
    })
    expect(legend).toBe('参考素材说明：\n图1 = 开场首帧（首帧）')
  })

  // SF-2b end-to-end: the REAL harvest (harvestUpstreamVideoImageReferences)
  // feeding the REAL legend builder — locks in owner's literal quoted format
  // "图N = 名字（镜头/首帧）" for both shot and frame, not just a hand-built map.
  describe('SF-2b end-to-end: 镜头/首帧引用后的图例文本含分类', () => {
    it('a directly-referenced shot prints "图N = 名字（镜头）"', () => {
      const nodes = [
        makeNode('shot1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          mediaUrl: 'https://cdn/shot.png',
          shotName: '开场镜头',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-shot', 'shot1', 'video1')]
      const imageRefByUrl = harvestUpstreamVideoImageReferences(
        'video1',
        edges,
        nodes,
      )
      const legend = buildVideoReferenceLegend({
        referenceImages: ['https://cdn/shot.png'],
        imageRefByUrl,
        videoUrls: [],
        audioBindings: [],
        labels,
      })
      expect(legend).toBe('参考素材说明：\n图1 = 开场镜头（镜头）')
    })

    it('a directly-referenced frame prints "图N = 名字（首帧）"', () => {
      const nodes = [
        makeNode('frame1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.frame,
          mediaUrl: 'https://cdn/frame.png',
          mediaLabel: '开场首帧',
        }),
        makeNode('video1', NODE_TYPE_IDS.seedance),
      ]
      const edges = [makeEdge('e-frame', 'frame1', 'video1')]
      const imageRefByUrl = harvestUpstreamVideoImageReferences(
        'video1',
        edges,
        nodes,
      )
      const legend = buildVideoReferenceLegend({
        referenceImages: ['https://cdn/frame.png'],
        imageRefByUrl,
        videoUrls: [],
        audioBindings: [],
        labels,
      })
      expect(legend).toBe('参考素材说明：\n图1 = 开场首帧（首帧）')
    })
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
        voiceClipUrl: 'https://cdn/v.mp3',
      }),
    ]
    expect(harvestUpstreamVideoUrls(upstream)).toEqual([])
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
        voiceClipUrl: 'https://cdn/v.mp3',
      }),
    ]
    expect(harvestUpstreamShotTextPrompt(upstream)).toBe('')
  })

  /**
   * ⚠ 2026-08-10 真机实拍：同一段话在最终提示词里出现了**两遍**。文本引用改成
   * 「把内容原文粘进输入框」之后，一个文本节点可以同时以两种方式进请求 ——
   * 一条边（自动前置）+ 用户手动粘进去的那一段。胶囊时代挡这件事的是
   * `expandedNames`，胶囊退役后换成这条「正文里已经有就不再前置」。
   */
  it('正文里已经逐字含着这一段时，不再前置（否则同一段发两遍）', () => {
    const upstream = [
      makeNode('s1', NODE_TYPE_IDS.shotText, {
        status: 'idle',
        scene: 'rooftop, dusk',
      }),
      makeNode('s2', NODE_TYPE_IDS.shotText, {
        status: 'idle',
        scene: 'forest',
      }),
    ]

    // 用户把第一段粘进了正文 —— 它不该再被前置一次；没粘的第二段照旧前置。
    expect(
      harvestUpstreamShotTextPrompt(upstream, '前半句。rooftop, dusk 后半句。'),
    ).toBe('forest')
  })

  it('没给正文时行为与从前逐字一致（既有调用方零影响）', () => {
    const upstream = [
      makeNode('s1', NODE_TYPE_IDS.shotText, {
        status: 'idle',
        scene: 'rooftop, dusk',
      }),
    ]
    expect(harvestUpstreamShotTextPrompt(upstream)).toBe('rooftop, dusk')
    expect(harvestUpstreamShotTextPrompt(upstream, '')).toBe('rooftop, dusk')
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
  it('prefers a finished Audio Clip over a Voice Profile donor sample', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        audioClip: {
          url: 'https://cdn/finished.mp3',
          generationId: 'audio-generation-1',
          role: 'speech',
        },
        voiceClipUrl: 'https://cdn/donor.mp3',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e1', 'voiceA', 'seedance')]

    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      {
        url: 'https://cdn/finished.mp3',
        nodeId: 'voiceA',
        sourceKind: 'audio-clip',
      },
    ])
  })

  it('attaches character names to voices routed through a character node', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice-a.mp3',
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

  // 画布修法 08-A：这里此前用本文件私有的 readCharacterName（characterName
  // || character.name 优先链，不带机器值守卫）取角色名。「选已有图」写入口
  // 把上传备注常量当名字写进 characterName 时，角色绑定的 @AudioN 槽会把
  // 机器串当角色名显示。改走共享解析器后 characterName 字段整个不出现
  // （undefined 不参与 spread，与"从没起过名"的角色同一种形状）。
  it('丢掉已知上传备注机器串，不把它当角色名附到音频绑定上', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice-a.mp3',
      }),
      makeNode('charA', NODE_TYPE_IDS.characterImage, {
        characterName: 'Node Studio character output',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e1', 'voiceA', 'charA'),
      makeEdge('e2', 'charA', 'seedance'),
    ]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      { url: 'https://cdn/voice-a.mp3', nodeId: 'voiceA' },
    ])
  })

  it('emits unbound voices when wired directly to the focal node', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice-a.mp3',
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
        voiceClipUrl: 'https://cdn/voice-a.mp3',
      }),
      makeNode('voiceB', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice-b.mp3',
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
        voiceClipUrl: 'https://cdn/voice.mp3',
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

  // ⚠ 这条锁的是「**一个音频字段都没有**的音色节点」，不是「系统音色」——
  // 上游账本担心它把缺陷钉成了期望值，实测没有：夹具的 data 里连
  // `voiceSampleUrl` 都没有，所以接上第 3 档取值后它照样绿。真正没人守的是
  // 下面两条（系统音色 = 只有 voiceId + voiceSampleUrl），2026-08-09 补。
  it('skips voice nodes with no audio field at all', () => {
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

  // 系统音色送不出声（2026-08-09 修）：Fish 音色库选出来的音色只有 `voiceId` +
  // `voiceSampleUrl`，此前这里回空数组 —— 用户接了音色、界面也显示接上了，
  // 最终 `audio_urls` 却是空的，且不进任何提示。
  it('emits a binding for a SYSTEM voice that only carries a library clip', () => {
    const nodes = [
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceId: 'sys-tender',
        voiceName: '温柔女声',
        voiceClipUrl: 'https://cdn/sample.mp3',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e1', 'voice', 'seedance')]
    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      { url: 'https://cdn/sample.mp3', nodeId: 'voice' },
    ])
  })

  // ⚠ 这里原本有一条「上传的参考音频优先于系统样本」—— 2026-08-10 字段收敛后
  // 那两个字段合成了一个 `voiceClipUrl`，收割层已经无从「挑错」，这条测试的前提
  // 不存在了。优先级问题整体搬进了迁移（老节点两个字段都有值时取哪个），
  // 由 `node-workflow-migrate-voice-clip.test.ts` 守着。

  it('uses character.name fallback when characterName is missing', () => {
    const nodes = [
      makeNode('voice', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/v.mp3',
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
        voiceClipUrl: 'https://cdn/v.mp3',
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
        voiceClipUrl: 'https://cdn/v.mp3',
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
        voiceClipUrl: 'https://cdn/voice.mp3',
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
        voiceClipUrl: 'https://cdn/voice.mp3',
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

  // R3-6b §3: the image count reflects a per-edge stage override, not just
  // the card's own onStage curation — this is the same harvest the actual
  // send path (harvestUpstreamImageUrls with edges+focalNodeId) uses.
  it('counts a per-edge stageOverrideUrls expansion, not the card onStage set', () => {
    const nodes = [
      makeNode('seedance', NODE_TYPE_IDS.seedance),
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        imageUrl: 'https://cdn/char.png',
        referenceAssets: [
          {
            id: 'r1',
            url: 'https://cdn/card-default.png',
            role: 'pose',
            weight: 0.72,
            source: 'upload',
            onStage: true,
          },
        ],
      }),
    ]
    const edges = [
      makeEdge('e1', 'char', 'seedance', {
        stageOverrideUrls: [
          'https://cdn/override1.png',
          'https://cdn/override2.png',
        ],
      }),
    ]

    expect(
      summarizeUpstreamSeedanceReferences('seedance', edges, nodes).imageCount,
    ).toBe(3)
  })
})
