import { describe, expect, it } from 'vitest'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'

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
  isKeyframeNode,
  isShotNode,
  isShotTextNode,
  isVideoSourceNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
  mergeComposerReferenceAssets,
  keyframeSlotCategory,
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

describe('keyframeSlotCategory', () => {
  it('translates the two keyframe slots back to the legend categories', () => {
    expect(keyframeSlotCategory(NODE_SLOT_IDS.firstFrame)).toBe('frameStart')
    expect(keyframeSlotCategory(NODE_SLOT_IDS.lastFrame)).toBe('frameEnd')
    expect(keyframeSlotCategory(NODE_SLOT_IDS.reference)).toBeUndefined()
  })
})
