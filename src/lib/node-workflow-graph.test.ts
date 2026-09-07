import { describe, expect, it } from 'vitest'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_REVIEW_STATE_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { NODE_SLOT_IDS, NODE_SLOT_TEXT_ROLE_IDS } from '@/constants/node-slots'
import {
  NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY,
  NODE_STUDIO_KEYFRAME_LEGEND_UNCLASSIFIED_CATEGORY,
  NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS,
} from '@/constants/node-studio'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'

import { assembleReferenceImagePayload } from './node-reference-payload'
import {
  assembleShotImageReferencePlan,
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
  harvestSlots,
  inferLegacySlot,
  isKeyframeNode,
  isShotNode,
  isShotTextNode,
  isVideoSourceNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
  mergeComposerReferenceAssets,
  mergePromptWithUpstreamText,
  keyframeSlotCategory,
  orderedKeyframeEntries,
  resolveEdgeSlot,
  resolveGenerateTargetKind,
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

// 画布修法包 F：composer 发送路（handleRunGenerateComposer）此前只认自己的
// referenceUrls，从不读图上游——一张连着角色卡的镜头图从这里发送会把角色参考
// 图静默丢掉，而工具条「生成」钮（handleGenerateMediaNode）一直都读。这个
// describe 块锁住修复后 composer 调的这个函数本身的行为（去重/容量/图例/
// 审核排除），以及它与工具条那条路在「无自有 referenceAssets、无宿主已有
// 媒体」的复现场景下逐项相等——这是本包验收硬线，「下次有人改其中一条会立刻
// 红」的落点就是这个 describe 块。
describe('assembleShotImageReferencePlan (画布修法包 F)', () => {
  it('merges own candidates with the upstream character/background harvest, own first', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
      }),
    ]
    const plan = assembleShotImageReferencePlan(
      ['https://cdn/own.png'],
      upstream,
      5,
    )
    expect(plan).toEqual({
      referenceImages: ['https://cdn/own.png', 'https://cdn/char.png'],
      legend: '参考图说明：\n图2：角色「yangyang」',
      blocked: [],
    })
  })

  it('dedupes a URL both the own candidates and the upstream harvest contribute, keeping the own-candidate position', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/char.png',
        characterName: 'yangyang',
      }),
    ]
    // 同一张图两条路都会带出来（composer 手动加了这张图，它又连着上游角色卡）
    // —— 不能在 referenceImages 里出现两次。
    const plan = assembleShotImageReferencePlan(
      ['https://cdn/char.png'],
      upstream,
      5,
    )
    expect(plan.referenceImages).toEqual(['https://cdn/char.png'])
    expect(plan.legend).toBe('参考图说明：\n图1：角色「yangyang」')
  })

  it('caps the merged list at maxReferenceImages, dropping upstream overflow after the own picks', () => {
    const upstream = [
      makeNode('char1', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/d.png',
        characterName: 'X',
      }),
      makeNode('char2', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/e.png',
        characterName: 'Y',
      }),
    ]
    const plan = assembleShotImageReferencePlan(
      ['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/c.png'],
      upstream,
      4,
    )
    // 落槽/上限函数还是 assembleReferenceImagePayload——合并后没有绕过它：
    // 'e.png' 排第 5 位，被 max=4 砍掉，图例也就只到第 4 位。
    expect(plan.referenceImages).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
      'https://cdn/c.png',
      'https://cdn/d.png',
    ])
    expect(plan.legend).toBe('参考图说明：\n图4：角色「X」')
  })

  it('surfaces upstream media the review gate excluded instead of silently dropping it', () => {
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        status: 'idle',
        characterName: '小林',
        mediaUrl: 'https://cdn/char.png',
        mediaReview: { 'https://cdn/char.png': { state: 'awaiting_review' } },
      }),
    ]
    const plan = assembleShotImageReferencePlan([], upstream, 5)
    expect(plan.referenceImages).toEqual([])
    expect(plan.legend).toBe('')
    expect(plan.blocked).toEqual([
      { url: 'https://cdn/char.png', nodeId: 'char', state: 'awaiting_review' },
    ])
  })

  it('degrades to the own candidates untouched (deduped) when there is no upstream — non-shot host or no host', () => {
    const plan = assembleShotImageReferencePlan(
      ['https://cdn/a.png', 'https://cdn/a.png', 'https://cdn/b.png'],
      [],
      5,
    )
    expect(plan).toEqual({
      referenceImages: ['https://cdn/a.png', 'https://cdn/b.png'],
      legend: '',
      blocked: [],
    })
  })

  it('包 F 复现场景：与工具条 handleGenerateMediaNode 的既有配方对同一上游产出逐项相等的 payload', () => {
    // 复现：一张连着「角色：常客」的镜头图，宿主自己没有 referenceAssets、也
    // 没有已生成媒体（`existingImageReference` 恒 undefined）——包 F 报告原文
    // 的场景。两条路唯一的候选来源都是这份上游收割。
    const upstream = [
      makeNode('char', NODE_TYPE_IDS.characterImage, {
        mediaUrl: 'https://cdn/regular.png',
        characterName: '常客',
      }),
    ]
    const maxReferenceImages = 5

    // 工具条 handleGenerateMediaNode 的既有配方（StudioNodeWorkbench.tsx，
    // isShotImageNode 分支，逐字照抄，不新写一份取数）：
    //   referenceCandidateSources = [existingImageReference, ...referenceAssets
    //     .map(url), ...upstreamImageReferences.map(url)]
    //   referenceImages = assembleReferenceImagePayload(referenceCandidateSources,
    //     maxReferenceImages).imageUrls
    //   referenceByUrl = new Map(buildReferenceAssetLegendEntries(referenceAssets))
    //     then overwritten by each upstream reference
    //   referenceLegend = buildShotReferenceLegend(referenceImages, referenceByUrl)
    // 本场景 existingImageReference=undefined、referenceAssets=[]，所以工具条侧
    // 的「own candidates」化简为 [undefined]。
    const toolbarHarvested = harvestUpstreamImageReferences(upstream)
    const toolbarReferenceByUrl = new Map<string, UpstreamImageReference>(
      buildReferenceAssetLegendEntries(undefined),
    )
    for (const reference of toolbarHarvested.references) {
      toolbarReferenceByUrl.set(reference.url, reference)
    }
    const toolbarReferenceImages = harvestUpstreamImageReferences(
      upstream,
    ).references.map((reference) => reference.url)
    const toolbarExpected = {
      referenceImages: toolbarReferenceImages,
      legend: buildShotReferenceLegend(
        toolbarReferenceImages,
        toolbarReferenceByUrl,
      ),
      blocked: toolbarHarvested.blocked,
    }

    // composer 发送路 handleRunGenerateComposer（修复后）：own candidates 是
    // `input.referenceUrls`——宿主没有媒体、用户没手动加参考图时恒 []。
    const composerActual = assembleShotImageReferencePlan(
      [],
      upstream,
      maxReferenceImages,
    )

    expect(composerActual).toEqual(toolbarExpected)
    expect(composerActual).toEqual({
      referenceImages: ['https://cdn/regular.png'],
      legend: '参考图说明：\n图1：角色「常客」',
      blocked: [],
    })

    // 改前的对照（复现证据）：composer 旧配方只有 assembleReferenceImagePayload
    // (input.referenceUrls, max) 一步，完全不读 upstream —— 同一个上游状态会
    // 产出 []，图例这一步过去根本不存在（PR 前 handleRunGenerateComposer 里
    // 没有 buildShotReferenceLegend 调用）。这正是包 F 报告的「静默丢掉角色
    // 参考图」。
    const preFixComposerReferenceImages = assembleReferenceImagePayload(
      [],
      maxReferenceImages,
    ).imageUrls
    expect(preFixComposerReferenceImages).toEqual([])
    expect(preFixComposerReferenceImages).not.toEqual(
      composerActual.referenceImages,
    )
  })
})

describe('mergeComposerReferenceAssets (包 F 续：只修抹掉、不改发送)', () => {
  const propAsset: NodeWorkflowReferenceAsset = {
    id: 'host-prop',
    url: 'https://cdn/prop.png',
    role: 'prop',
    weight: 0.7,
    source: 'upload',
    name: '古剑',
  }
  const composerAsset: NodeWorkflowReferenceAsset = {
    id: 'composer-1',
    url: 'https://cdn/picked.png',
    role: 'identity',
    weight: 0.72,
    source: 'asset',
  }

  it('复现场景：宿主手动加过的风格/道具参考图不再被 composer 反写抹掉', () => {
    const merged = mergeComposerReferenceAssets([propAsset], [composerAsset])

    // 宿主那条整个留下——role/weight/name 一个字段都没降级（分类图例靠它们）。
    expect(merged).toEqual([propAsset, composerAsset])
    // 改前的对照：composer 直接把自己这份写下去，宿主的道具图连同分类一起消失。
    expect([composerAsset]).not.toContainEqual(propAsset)
  })

  it('URL 撞车时保留宿主那条（信息更富），不塞第二条同 URL 的 defaultRole 条目', () => {
    const composerDuplicate: NodeWorkflowReferenceAsset = {
      id: 'composer-2',
      url: propAsset.url,
      role: 'identity',
      weight: 0.72,
      source: 'asset',
    }

    expect(
      mergeComposerReferenceAssets([propAsset], [composerDuplicate]),
    ).toEqual([propAsset])
  })

  it('宿主没有旧条目（新建的兄弟节点 / 未设过参考图）时退化成 composer 自己那份', () => {
    expect(mergeComposerReferenceAssets(undefined, [composerAsset])).toEqual([
      composerAsset,
    ])
    expect(mergeComposerReferenceAssets([], [composerAsset])).toEqual([
      composerAsset,
    ])
  })

  it('不改发送口径：合并只发生在落盘那一份，返回值不参与 referenceImages 的组装', () => {
    // 保住的道具图不在候选里 —— 发送仍然只由 own candidates + 上游收割决定。
    const plan = assembleShotImageReferencePlan([], [], 5)
    const merged = mergeComposerReferenceAssets([propAsset], [composerAsset])

    expect(merged.map((asset) => asset.url)).toContain(propAsset.url)
    expect(plan.referenceImages).not.toContain(propAsset.url)
    expect(plan.referenceImages).toEqual([])
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

  /**
   * 台账 X（owner 2026-08-29 拍板）：**绕过角色卡直挂**的音色此前恒无标签 ——
   * 送出预览里两条都写「旁白」，多角色对白片在 UI 上钉不到角色，而这正是
   * Seedance 2.5 官方推荐的写法（Images 1-2 are Character 1 … Audio 1）。
   */
  it('直挂的音色带上它自己声明的归属（audioOwnerName）', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice-a.mp3',
        audioOwnerName: '湊',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e1', 'voiceA', 'seedance')]

    expect(harvestUpstreamAudioBindings('seedance', edges, nodes)).toEqual([
      {
        url: 'https://cdn/voice-a.mp3',
        nodeId: 'voiceA',
        characterName: '湊',
      },
    ])
  })

  it('没声明归属时仍然不带 characterName（退化成无标签 @AudioN）', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice-a.mp3',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [makeEdge('e1', 'voiceA', 'seedance')]

    expect(
      harvestUpstreamAudioBindings('seedance', edges, nodes)[0],
    ).not.toHaveProperty('characterName')
  })

  it('⭐ 角色卡那条仍然优先 —— 同一段音频两路都连时不被直挂的归属盖掉', () => {
    const nodes = [
      makeNode('voiceA', NODE_TYPE_IDS.voice, {
        voiceClipUrl: 'https://cdn/voice-a.mp3',
        audioOwnerName: '手填的名字',
      }),
      makeNode('charA', NODE_TYPE_IDS.characterImage, {
        characterName: '角色卡上的名字',
      }),
      makeNode('seedance', NODE_TYPE_IDS.seedance),
    ]
    const edges = [
      makeEdge('e1', 'voiceA', 'charA'),
      makeEdge('e2', 'charA', 'seedance'),
      makeEdge('e3', 'voiceA', 'seedance'),
    ]

    const bindings = harvestUpstreamAudioBindings('seedance', edges, nodes)
    expect(bindings).toHaveLength(1)
    expect(bindings[0].characterName).toBe('角色卡上的名字')
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

/* ── 第三期 C3a：按槽收割 ─────────────────────────────────────────────── */

describe('inferLegacySlot', () => {
  it('maps every legacy position rule onto a named slot', () => {
    expect(
      inferLegacySlot(
        makeNode('kf-start', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          imageCategory: 'frameStart',
        }),
      ),
    ).toBe(NODE_SLOT_IDS.firstFrame)
    expect(
      inferLegacySlot(
        makeNode('kf-end', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          imageCategory: 'frameEnd',
        }),
      ),
    ).toBe(NODE_SLOT_IDS.lastFrame)
    // 旧 `role==='frame'` 没有分类 → rank 0 → 首帧（存量图不改送出的首帧）。
    expect(
      inferLegacySlot(
        makeNode('kf-legacy', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.frame,
        }),
      ),
    ).toBe(NODE_SLOT_IDS.firstFrame)
    expect(
      inferLegacySlot(
        makeNode('closeup', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.closeup,
        }),
      ),
    ).toBe(NODE_SLOT_IDS.closeup)
    expect(inferLegacySlot(makeNode('voice', NODE_TYPE_IDS.voice))).toBe(
      NODE_SLOT_IDS.voice,
    )
    expect(inferLegacySlot(makeNode('txt', NODE_TYPE_IDS.shotText))).toBe(
      NODE_SLOT_IDS.text,
    )
    expect(inferLegacySlot(makeNode('vid', NODE_TYPE_IDS.seedance))).toBe(
      NODE_SLOT_IDS.reference,
    )
    expect(
      inferLegacySlot(
        makeNode('char', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.character,
        }),
      ),
    ).toBe(NODE_SLOT_IDS.reference)
    // 既不是媒体源也不是文本的节点（助手）不是任何槽的源。
    expect(inferLegacySlot(makeNode('agent', NODE_TYPE_IDS.agent))).toBe(
      undefined,
    )
  })

  it('reproduces the legacy first/last rank order verbatim', () => {
    // 旧规则的既有夹具：两张 frameStart + 一张 frameEnd，稳定排序后
    // [startA, startC, endB]。⚠ 期望值写死成字面量而不是再调一次旧函数：
    // C3b 把 `orderKeyframes` 删了（收割层只留槽这一条判据），这一串就是它
    // 当时的返回值，锁在这里当回归基线。
    const startA = makeNode('a', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      imageCategory: 'frameStart',
      mediaUrl: 'https://cdn/a.png',
    })
    const endB = makeNode('b', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      imageCategory: 'frameEnd',
      mediaUrl: 'https://cdn/b.png',
    })
    const startC = makeNode('c', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      imageCategory: 'frameStart',
      mediaUrl: 'https://cdn/c.png',
    })
    const video = makeNode('v', NODE_TYPE_IDS.seedance)
    const nodes = [startA, endB, startC, video]
    const edges = [
      makeEdge('e1', 'a', 'v'),
      makeEdge('e2', 'b', 'v'),
      makeEdge('e3', 'c', 'v'),
    ]

    const slotOrder = orderedKeyframeEntries(
      harvestSlots('v', edges, nodes),
    ).map((entry) => entry.node.id)

    expect(slotOrder).toEqual(['a', 'c', 'b'])
    // 收割侧走的是同一条规则的节点列表版本 —— 两处不许各排各的。
    expect(
      harvestUpstreamImageUrls(getUpstreamNodes('v', edges, nodes), edges, 'v')
        .keyframeUrls,
    ).toEqual(['https://cdn/a.png', 'https://cdn/c.png', 'https://cdn/b.png'])
  })
})

describe('resolveEdgeSlot', () => {
  const clipSource = makeNode('clip', NODE_TYPE_IDS.seedance, {
    mediaUrl: 'https://cdn/clip.mp4',
  })

  it('prefers the slot written on the edge over inference', () => {
    const source = makeNode('img', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const target = makeNode('v', NODE_TYPE_IDS.seedance)
    const edge = {
      ...makeEdge('e1', 'img', 'v'),
      slot: NODE_SLOT_IDS.firstFrame,
    } as NodeWorkflowEdge
    expect(resolveEdgeSlot(edge, source, target)).toBe(NODE_SLOT_IDS.firstFrame)
  })

  it('narrows a video reference to `clip` when the target is a merge node', () => {
    const shot = makeNode('v', NODE_TYPE_IDS.seedance)
    const merge = makeNode('m', NODE_TYPE_IDS.videoMerge)
    expect(resolveEdgeSlot(makeEdge('e1', 'clip', 'v'), clipSource, shot)).toBe(
      NODE_SLOT_IDS.reference,
    )
    expect(
      resolveEdgeSlot(makeEdge('e2', 'clip', 'm'), clipSource, merge),
    ).toBe(NODE_SLOT_IDS.clip)
  })
})

describe('harvestSlots', () => {
  const first = makeNode('kf1', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.shot,
    imageCategory: 'frameStart',
    mediaUrl: 'https://cdn/first.png',
  })
  const last = makeNode('kf2', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.shot,
    imageCategory: 'frameEnd',
    mediaUrl: 'https://cdn/last.png',
  })
  const character = makeNode('char', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.character,
    mediaUrl: 'https://cdn/char.png',
  })
  const voice = makeNode('voice', NODE_TYPE_IDS.voice, {
    voiceClipUrl: 'https://cdn/voice.mp3',
  })
  const shotText = makeNode('txt', NODE_TYPE_IDS.shotText, {
    sceneDescription: '走廊',
  })
  const video = makeNode('v', NODE_TYPE_IDS.seedance)
  const nodes = [first, last, character, voice, shotText, video]

  const shape = (nodeId: string, edges: NodeWorkflowEdge[]) => {
    const slots = harvestSlots(nodeId, edges, nodes)
    return {
      first: slots.first?.node.id,
      last: slots.last?.node.id,
      reference: slots.reference.map((entry) => entry.node.id),
      voice: slots.voice.map((entry) => entry.node.id),
      text: slots.text.ordered.map((entry) => entry.node.id),
      textRoles: slots.text.ordered.map((entry) => entry.role),
      script: slots.text.script?.node.id,
    }
  }

  const expected = {
    first: 'kf1',
    last: 'kf2',
    reference: ['char'],
    voice: ['voice'],
    text: ['txt'],
    textRoles: [NODE_SLOT_TEXT_ROLE_IDS.script],
    script: 'txt',
  }

  it('harvests a slot-less v3 graph by inference', () => {
    expect(
      shape('v', [
        makeEdge('e1', 'kf1', 'v'),
        makeEdge('e2', 'kf2', 'v'),
        makeEdge('e3', 'char', 'v'),
        makeEdge('e4', 'voice', 'v'),
        makeEdge('e5', 'txt', 'v'),
      ]),
    ).toEqual(expected)
  })

  it('harvests an all-slots graph identically', () => {
    const withSlot = (
      id: string,
      source: string,
      slot: (typeof NODE_SLOT_IDS)[keyof typeof NODE_SLOT_IDS],
    ) => ({ ...makeEdge(id, source, 'v'), slot }) as NodeWorkflowEdge
    expect(
      shape('v', [
        withSlot('e1', 'kf1', NODE_SLOT_IDS.firstFrame),
        withSlot('e2', 'kf2', NODE_SLOT_IDS.lastFrame),
        withSlot('e3', 'char', NODE_SLOT_IDS.reference),
        withSlot('e4', 'voice', NODE_SLOT_IDS.voice),
        withSlot('e5', 'txt', NODE_SLOT_IDS.text),
      ]),
    ).toEqual(expected)
  })

  it('harvests a mixed graph identically (some edges carry a slot, some do not)', () => {
    expect(
      shape('v', [
        { ...makeEdge('e1', 'kf1', 'v'), slot: NODE_SLOT_IDS.firstFrame },
        makeEdge('e2', 'kf2', 'v'),
        { ...makeEdge('e3', 'char', 'v'), slot: NODE_SLOT_IDS.reference },
        makeEdge('e4', 'voice', 'v'),
        makeEdge('e5', 'txt', 'v'),
      ] as NodeWorkflowEdge[]),
    ).toEqual(expected)
  })

  it('lets an explicit slot override what the position rule would have guessed', () => {
    // 同一张关键帧图，边上说它是参考 → 它就是参考，不再进首帧槽。
    const slots = harvestSlots(
      'v',
      [
        { ...makeEdge('e1', 'kf1', 'v'), slot: NODE_SLOT_IDS.reference },
      ] as NodeWorkflowEdge[],
      nodes,
    )
    expect(slots.first).toBeUndefined()
    expect(slots.keyframes).toEqual([])
    expect(slots.reference.map((entry) => entry.node.id)).toEqual(['kf1'])
  })

  it('keeps an over-subscribed keyframe slot instead of swallowing it', () => {
    const extra = makeNode('kf3', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      imageCategory: 'frameStart',
      mediaUrl: 'https://cdn/extra.png',
    })
    const slots = harvestSlots(
      'v',
      [makeEdge('e1', 'kf1', 'v'), makeEdge('e2', 'kf3', 'v')],
      [...nodes, extra],
    )
    expect(slots.first?.node.id).toBe('kf1')
    expect(slots.keyframes.map((entry) => entry.node.id)).toEqual([
      'kf1',
      'kf3',
    ])
  })

  it('only walks direct edges — a voice bound to a character is that card slot', () => {
    const edges = [makeEdge('e1', 'char', 'v'), makeEdge('e2', 'voice', 'char')]
    expect(harvestSlots('v', edges, nodes).voice).toEqual([])
    expect(
      harvestSlots('char', edges, nodes).voice.map((e) => e.node.id),
    ).toEqual(['voice'])
  })
})

describe('keyframeSlotCategory', () => {
  it('translates the two keyframe slots back to the legend categories', () => {
    expect(keyframeSlotCategory(NODE_SLOT_IDS.firstFrame)).toBe('frameStart')
    expect(keyframeSlotCategory(NODE_SLOT_IDS.lastFrame)).toBe('frameEnd')
    expect(keyframeSlotCategory(NODE_SLOT_IDS.reference)).toBeUndefined()
  })
})

describe('slot-driven payload assembly', () => {
  // 一张存量 v3 图（一条边都不带 slot）：首帧 / 尾帧 / 参考 / 语音 / 三类文本
  // 各自要落到自己的位置。装配走槽，⛔ 不再按 `images[0]/[1]` 取首尾。
  const kfFirst = makeNode('kfA', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.shot,
    imageCategory: 'frameStart',
    mediaUrl: 'https://cdn/kfA.png',
  })
  const kfLast = makeNode('kfB', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.shot,
    imageCategory: 'frameEnd',
    mediaUrl: 'https://cdn/kfB.png',
  })
  const character = makeNode('char', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.character,
    mediaUrl: 'https://cdn/char.png',
  })
  const refVideo = makeNode('refvid', NODE_TYPE_IDS.videoReference, {
    mediaUrl: 'https://cdn/ref.mp4',
  })
  const voiceNode = makeNode('voice', NODE_TYPE_IDS.voice, {
    voiceClipUrl: 'https://cdn/v.mp3',
  })
  const script = makeNode('txt', NODE_TYPE_IDS.shotText, {
    sceneDescription: '走廊',
  })
  const video = makeNode('video', NODE_TYPE_IDS.seedance)
  const nodes = [kfFirst, kfLast, character, refVideo, voiceNode, script, video]
  const edges = [
    makeEdge('e1', 'kfA', 'video'),
    makeEdge('e2', 'kfB', 'video'),
    makeEdge('e3', 'char', 'video'),
    makeEdge('e4', 'refvid', 'video'),
    makeEdge('e5', 'voice', 'video'),
    makeEdge('e6', 'txt', 'video'),
  ]

  it('lands each slot in its own payload position', () => {
    const slots = harvestSlots('video', edges, nodes)

    // 首帧 / 尾帧：各取各的槽，不靠位置。
    expect(getNodeMediaUrl(slots.first!.node.data)).toBe('https://cdn/kfA.png')
    expect(getNodeMediaUrl(slots.last!.node.data)).toBe('https://cdn/kfB.png')

    // 参考：图与视频同槽（`video.shot.reference` 两种 kind 都收），各自去各自的
    // 载荷数组，由调用方按 kind 分流 —— 槽只回答「它是参考」。
    expect(slots.reference.map((entry) => entry.node.id)).toEqual([
      'char',
      'refvid',
    ])
    expect(harvestUpstreamVideoUrls([refVideo])).toEqual([
      'https://cdn/ref.mp4',
    ])

    // 语音：进 audio_urls。
    expect(slots.voice.map((entry) => entry.node.id)).toEqual(['voice'])
    expect(
      harvestUpstreamAudioBindings('video', edges, nodes).map((b) => b.url),
    ).toEqual(['https://cdn/v.mp3'])

    // 文本：v3 图里全是 script → 全部进正文，约束段为空（与旧行为一致）。
    expect(slots.text.script?.node.id).toBe('txt')
    expect(slots.text.style).toEqual([])
    expect(slots.text.character).toEqual([])
    expect(
      harvestUpstreamShotTextPrompt(
        slots.text.ordered.map((entry) => entry.node),
      ),
    ).toBe(
      harvestUpstreamShotTextPrompt(getUpstreamNodes('video', edges, nodes)),
    )
  })

  it('routes style / character text edges into the constraint segments', () => {
    const styleNode = makeNode('style', NODE_TYPE_IDS.shotText, {
      sceneDescription: '胶片颗粒',
    })
    const slots = harvestSlots(
      'video',
      [
        makeEdge('e6', 'txt', 'video'),
        {
          ...makeEdge('e7', 'style', 'video'),
          slot: NODE_SLOT_IDS.text,
        },
      ] as NodeWorkflowEdge[],
      [...nodes, styleNode],
    )
    // v3 边不带角色 → 两条都回落 script；约束段要靠 C3d 在连线时写 role。
    expect(slots.text.ordered.map((entry) => entry.role)).toEqual([
      NODE_SLOT_TEXT_ROLE_IDS.script,
      NODE_SLOT_TEXT_ROLE_IDS.script,
    ])
    expect(slots.text.script?.node.id).toBe('txt')
    expect(slots.text.ordered).toHaveLength(2)
  })
})

/* ── 第三期 C3b：五个 URL 收割器换底（按槽派生）───────────────────────── */

describe('C3b 收割器换底 · 存量 v3 图零漂移', () => {
  // 一张不带任何 `slot` 的存量图：改底之后每一条收割的输出必须逐字不变。
  // ⚠ 期望值是**改造前**跑出来的那一串（对拍夹具，见 C3b 报告），⛔ 不是照着
  // 新实现回填的——那样这条测试就只会证明「代码等于它自己」。
  const kfA = makeNode('kfA', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.shot,
    imageCategory: 'frameStart',
    mediaUrl: 'https://cdn/kfA.png',
  })
  const kfB = makeNode('kfB', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.shot,
    imageCategory: 'frameEnd',
    mediaUrl: 'https://cdn/kfB.png',
  })
  const kfC = makeNode('kfC', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.shot,
    imageCategory: 'frameStart',
    mediaUrl: 'https://cdn/kfC.png',
  })
  const kfLegacy = makeNode('kfL', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.frame,
    mediaUrl: 'https://cdn/kfL.png',
  })
  const character = makeNode('char', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.character,
    characterName: '阿岚',
    mediaUrl: 'https://cdn/char.png',
    referenceAssets: [
      { id: 'a1', url: 'https://cdn/char-primary.png', isPrimary: true },
      { id: 'a2', url: 'https://cdn/char-stage.png', onStage: true },
      { id: 'a3', url: 'https://cdn/char-off.png' },
    ] as NodeWorkflowReferenceAsset[],
  })
  const background = makeNode('bg', NODE_TYPE_IDS.backgroundImage, {
    mediaUrl: 'https://cdn/bg.png',
  })
  const closeupA = makeNode('cu', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.closeup,
    mediaUrl: 'https://cdn/cu.png',
  })
  const closeupB = makeNode('cu2', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.closeup,
    mediaUrl: 'https://cdn/cu2.png',
  })
  const voiceDirect = makeNode('vd', NODE_TYPE_IDS.voice, {
    voiceClipUrl: 'https://cdn/vd.mp3',
    audioOwnerName: '旁白甲',
  })
  const voiceBound = makeNode('vb', NODE_TYPE_IDS.voice, {
    voiceClipUrl: 'https://cdn/vb.mp3',
  })
  const text = makeNode('t1', NODE_TYPE_IDS.shotText, {
    scene: '走廊',
  })
  const refVideo = makeNode('rv', NODE_TYPE_IDS.videoReference, {
    mediaUrl: 'https://cdn/ref.mp4',
  })
  const video = makeNode('video', NODE_TYPE_IDS.seedance)
  const nodes = [
    kfA,
    kfB,
    kfC,
    kfLegacy,
    character,
    background,
    closeupA,
    closeupB,
    voiceDirect,
    voiceBound,
    text,
    refVideo,
    video,
  ]
  const edges = [
    makeEdge('e1', 'kfA', 'video'),
    makeEdge('e2', 'kfB', 'video'),
    makeEdge('e3', 'kfC', 'video'),
    makeEdge('e4', 'kfL', 'video'),
    makeEdge('e5', 'char', 'video'),
    makeEdge('e6', 'bg', 'video'),
    makeEdge('e7', 'cu', 'char'),
    makeEdge('e8', 'cu2', 'char'),
    makeEdge('e9', 'vd', 'video'),
    makeEdge('e10', 'vb', 'char'),
    makeEdge('e11', 't1', 'video'),
    makeEdge('e12', 'rv', 'video'),
  ]
  const upstream = getUpstreamNodes('video', edges, nodes)

  it('图：关键帧段仍是 urls 的真前缀，首帧档在前、同档保序', () => {
    const harvested = harvestUpstreamImageUrls(upstream, edges, 'video')
    expect(harvested.urls).toEqual([
      'https://cdn/kfA.png',
      'https://cdn/kfC.png',
      'https://cdn/kfL.png',
      'https://cdn/kfB.png',
      'https://cdn/char-primary.png',
      'https://cdn/char-stage.png',
      'https://cdn/bg.png',
    ])
    expect(harvested.keyframeUrls).toEqual(
      harvested.urls.slice(0, harvested.keyframeUrls.length),
    )
    expect(harvested.keyframeUrls).toEqual([
      'https://cdn/kfA.png',
      'https://cdn/kfC.png',
      'https://cdn/kfL.png',
      'https://cdn/kfB.png',
    ])
  })

  it('图：不传 edges/focalNodeId 时按旧位置规则推断，结果同上（镜头图那条路）', () => {
    expect(harvestUpstreamImageUrls(upstream).urls).toEqual(
      harvestUpstreamImageUrls(upstream, edges, 'video').urls,
    )
  })

  it('特写 / 音频 / 视频 / 文本：顺序按 nodes 序，@ImageN 不漂', () => {
    expect(harvestUpstreamCloseupUrls('video', edges, nodes).urls).toEqual([
      'https://cdn/cu.png',
      'https://cdn/cu2.png',
    ])
    // pass 1（绑在角色卡上）先于 pass 2（直挂），与改造前一致。
    expect(harvestUpstreamAudioBindings('video', edges, nodes)).toEqual([
      { url: 'https://cdn/vb.mp3', nodeId: 'vb', characterName: '阿岚' },
      { url: 'https://cdn/vd.mp3', nodeId: 'vd', characterName: '旁白甲' },
    ])
    expect(harvestUpstreamVideoUrls(upstream, edges, 'video')).toEqual([
      'https://cdn/ref.mp4',
    ])
    expect(harvestUpstreamShotTextPrompt(upstream)).toBe('走廊')
  })
})

describe('C3b 收割器换底 · 边上写了槽就听边的', () => {
  const keyframe = makeNode('kf', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.shot,
    imageCategory: 'frameStart',
    mediaUrl: 'https://cdn/kf.png',
  })
  const character = makeNode('char', NODE_TYPE_IDS.image, {
    role: NODE_IMAGE_ROLE_IDS.character,
    mediaUrl: 'https://cdn/char.png',
  })
  const video = makeNode('video', NODE_TYPE_IDS.seedance)
  const nodes = [keyframe, character, video]
  const edges = [
    { ...makeEdge('e1', 'kf', 'video'), slot: NODE_SLOT_IDS.reference },
    { ...makeEdge('e2', 'char', 'video'), slot: NODE_SLOT_IDS.firstFrame },
  ] as NodeWorkflowEdge[]

  it('一张 frameStart 的图被连成 reference 就不再占首帧位，反之亦然', () => {
    const upstream = getUpstreamNodes('video', edges, nodes)
    const harvested = harvestUpstreamImageUrls(upstream, edges, 'video')
    expect(harvested.keyframeUrls).toEqual(['https://cdn/char.png'])
    expect(harvested.urls).toEqual([
      'https://cdn/char.png',
      'https://cdn/kf.png',
    ])
    // 同一张图，不给 edges → 回落旧位置规则，存量调用方零漂移。
    expect(harvestUpstreamImageUrls(upstream).keyframeUrls).toEqual([
      'https://cdn/kf.png',
    ])
  })

  it('合并节点的 clip 槽照样进 video_urls —— 参考与片段两个槽一起认', () => {
    const clipA = makeNode('a', NODE_TYPE_IDS.seedance, {
      mediaUrl: 'https://cdn/a.mp4',
    })
    const clipB = makeNode('b', NODE_TYPE_IDS.seedance, {
      mediaUrl: 'https://cdn/b.mp4',
    })
    const merge = makeNode('m', NODE_TYPE_IDS.videoMerge)
    const mergeEdges = [makeEdge('e1', 'a', 'm'), makeEdge('e2', 'b', 'm')]
    const upstream = getUpstreamNodes('m', mergeEdges, [clipA, clipB, merge])
    expect(harvestUpstreamVideoUrls(upstream, mergeEdges, 'm')).toEqual([
      'https://cdn/a.mp4',
      'https://cdn/b.mp4',
    ])
  })

  it('文本：边上写了别的槽的文本节点不再进正文', () => {
    const script = makeNode('t1', NODE_TYPE_IDS.shotText, {
      scene: '走廊',
    })
    const note = makeNode('t2', NODE_TYPE_IDS.shotText, {
      scene: '胶片颗粒',
    })
    const textEdges = [
      makeEdge('e1', 't1', 'video'),
      { ...makeEdge('e2', 't2', 'video'), slot: NODE_SLOT_IDS.reference },
    ] as NodeWorkflowEdge[]
    const upstream = getUpstreamNodes('video', textEdges, [script, note, video])
    expect(
      harvestUpstreamShotTextPrompt(upstream, '', textEdges, 'video'),
    ).toBe('走廊')
    // 不给 edges → 两条都算文本（旧行为）。
    expect(harvestUpstreamShotTextPrompt(upstream)).toBe('走廊\n\n胶片颗粒')
  })
})
