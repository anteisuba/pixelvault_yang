import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID,
} from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type {
  NodeV4Data,
  NodeWorkflowEdgeV4,
  NodeWorkflowNode,
} from '@/types/node-workflow'

import {
  buildNodeAssistantNodeContexts,
  buildNodeCanvasSnapshotV4,
  canCarryImageCategory,
  collectSlotLines,
  type CanvasSnapshotV4Node,
} from './node-assistant-context'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

const OPTIONS = { getNodeTypeLabel: (type: string) => `type:${type}` }

describe('buildNodeAssistantNodeContexts · 提示词现值', () => {
  it('把节点当前的提示词投影成 promptExcerpt', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [
        makeNode('shot-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          prompt: '雨夜，霓虹反光，中景',
          shotName: '开场镜',
        }),
      ],
      OPTIONS,
    )

    expect(context).toMatchObject({
      id: 'shot-1',
      title: '开场镜',
      promptExcerpt: '雨夜，霓虹反光，中景',
    })
  })

  // 空提示词**不占位**：字段缺席就是「还没有提示词」，一个空串既多花 token
  // 又和「提示词是空的」读起来一样。
  it('没有提示词时字段直接缺席', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [makeNode('img-1', NODE_TYPE_IDS.image, { prompt: '   ' })],
      OPTIONS,
    )

    expect(context).not.toHaveProperty('promptExcerpt')
  })

  it('提示词按 maxNodeSummaryLength 截断', () => {
    const long = '镜'.repeat(
      NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength + 500,
    )
    const [context] = buildNodeAssistantNodeContexts(
      [makeNode('img-1', NODE_TYPE_IDS.image, { prompt: long })],
      OPTIONS,
    )

    expect(context?.promptExcerpt?.length).toBe(
      NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
    )
    expect(context?.promptExcerpt?.endsWith('...')).toBe(true)
  })

  // 旧实现对 `characterImage` 有一条 `prompt || imageUrl` 的兜底 —— 没有提示词的
  // 卡会把一条 R2 长 URL 喂给模型：纯 token 消耗，且模型拿它没有任何用处。
  it('没有提示词的角色卡不会退而喂图片 URL', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [
        makeNode('card-1', NODE_TYPE_IDS.characterImage, {
          imageUrl: 'https://cdn.example.com/very/long/asset-key.png',
          characterName: '小林',
        }),
      ],
      OPTIONS,
    )

    expect(context).not.toHaveProperty('promptExcerpt')
    expect(JSON.stringify(context)).not.toContain('cdn.example.com')
  })
})

describe('buildNodeAssistantNodeContexts · 分类现值', () => {
  it('能标分类但还没标 → 说出 unset，而不是装作没有这个字段', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [makeNode('img-1', NODE_TYPE_IDS.image)],
      OPTIONS,
    )

    expect(context?.imageCategory).toBe(NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID)
  })

  it('标过的分类原样带出去（模型写回 set_image_category 用的就是这个值）', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [
        makeNode('img-1', NODE_TYPE_IDS.image, {
          imageCategory: 'frameStart',
        }),
      ],
      OPTIONS,
    )

    expect(context?.imageCategory).toBe('frameStart')
  })

  it('custom 分类带上它的展示名', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [
        makeNode('img-1', NODE_TYPE_IDS.image, {
          imageCategory: 'custom',
          imageCategoryLabel: '道具·手电',
        }),
      ],
      OPTIONS,
    )

    expect(context).toMatchObject({
      imageCategory: 'custom',
      imageCategoryLabel: '道具·手电',
    })
  })

  // ⚠ 身份卡的 `type` 也是 `image`，模型光看 type 分不出来 —— 所以「能不能标」
  // 必须由字段在不在直接说出来，否则它只能拿卡去试然后吃一条 notCategorizable。
  it('身份卡与非图片节点根本没有这个字段', () => {
    const contexts = buildNodeAssistantNodeContexts(
      [
        makeNode('card-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.character,
        }),
        makeNode('video-1', NODE_TYPE_IDS.seedance),
        makeNode('text-1', NODE_TYPE_IDS.shotText),
      ],
      OPTIONS,
    )

    for (const context of contexts) {
      expect(context).not.toHaveProperty('imageCategory')
    }
  })

  it('canCarryImageCategory 与人手入口同界：散图/镜头图可以，卡片不行', () => {
    expect(canCarryImageCategory(makeNode('a', NODE_TYPE_IDS.image))).toBe(true)
    expect(
      canCarryImageCategory(
        makeNode('b', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
        }),
      ),
    ).toBe(true)
    expect(
      canCarryImageCategory(
        makeNode('c', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.background,
        }),
      ),
    ).toBe(false)
    expect(canCarryImageCategory(makeNode('d', NODE_TYPE_IDS.seedance))).toBe(
      false,
    )
  })
})

describe('buildNodeAssistantNodeContexts · 模型现值', () => {
  const MODEL = {
    optionId: 'workspace:seedance-2.0',
    modelId: 'seedance-2.0',
    adapterType: 'fal',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  }

  it('选得了模型但还没选 → unset（而不是装作没有这个字段）', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [makeNode('img-1', NODE_TYPE_IDS.image)],
      OPTIONS,
    )
    expect(context?.model).toBe(NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID)
  })

  it('选了就带 modelId —— 模型写回 set_model 用的就是这个值', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [makeNode('vid-1', NODE_TYPE_IDS.seedance, { model: MODEL })],
      OPTIONS,
    )
    expect(context?.model).toBe('seedance-2.0')
  })

  it('⛔ 只喂 id，不喂 providerConfig（baseUrl 是纯 token 消耗）', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [makeNode('vid-1', NODE_TYPE_IDS.seedance, { model: MODEL })],
      OPTIONS,
    )
    expect(JSON.stringify(context)).not.toContain('fal.run')
    expect(JSON.stringify(context)).not.toContain('workspace:')
  })

  it('身份卡 / 镜头文本 / 合并节点根本没有这个字段', () => {
    const contexts = buildNodeAssistantNodeContexts(
      [
        makeNode('card-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.character,
        }),
        makeNode('text-1', NODE_TYPE_IDS.shotText),
        makeNode('merge-1', NODE_TYPE_IDS.videoMerge),
      ],
      OPTIONS,
    )
    for (const context of contexts) {
      expect(context).not.toHaveProperty('model')
    }
  })
})

describe('buildNodeAssistantNodeContexts · 档位现值', () => {
  it('视频节点没设档位 → 空对象（有这回事，但一个都没设）', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [makeNode('vid-1', NODE_TYPE_IDS.seedance)],
      OPTIONS,
    )
    expect(context?.params).toEqual({})
  })

  it('设过的档位原样带出（duration 在数据层就是字符串）', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [
        makeNode('vid-1', NODE_TYPE_IDS.seedance, {
          aspectRatio: '16:9',
          resolution: '720p',
          duration: '6',
          generateAudio: false,
          seed: 42,
        }),
      ],
      OPTIONS,
    )
    expect(context?.params).toEqual({
      aspectRatio: '16:9',
      resolution: '720p',
      duration: '6',
      generateAudio: false,
      seed: 42,
    })
  })

  // ⚠ 图片的比例 / 清晰度**不住在节点上**（住在合成条的 React state 里）——
  // 给图片节点发一个 params 字段等于告诉模型「这里可以写」，然后它写了、
  // 编译过、测试过、真机上什么都不变。
  it('图片节点与参考视频 / 合并节点没有 params 字段', () => {
    const contexts = buildNodeAssistantNodeContexts(
      [
        makeNode('img-1', NODE_TYPE_IDS.image),
        makeNode('ref-1', NODE_TYPE_IDS.videoReference),
        makeNode('merge-1', NODE_TYPE_IDS.videoMerge),
      ],
      OPTIONS,
    )
    for (const context of contexts) {
      expect(context).not.toHaveProperty('params')
    }
  })
})

describe('buildNodeAssistantNodeContexts · 参考图现值', () => {
  const cardWithRefs = () =>
    makeNode('card-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      referenceAssets: [
        {
          id: 'r1',
          url: 'https://cdn.example.com/very/long/asset-key.png',
          role: 'identity',
          weight: 0.72,
          source: 'canvas',
          sourceId: 'img-7',
        },
        {
          id: 'r2',
          url: 'https://cdn.example.com/another.png',
          role: 'style',
          weight: 0.72,
          source: 'upload',
        },
      ],
    })

  it('收集器卡带出计数上限与 role 摘要', () => {
    const [context] = buildNodeAssistantNodeContexts([cardWithRefs()], OPTIONS)
    expect(context?.references).toEqual({
      limit: 3,
      items: [{ role: 'identity', sourceId: 'img-7' }, { role: 'style' }],
    })
  })

  // ⛔ 这条是硬红线：上一批刚修掉一处把 R2 长 URL 喂给模型的兜底。
  it('⛔ payload 里一个 URL 都不许出现', () => {
    const [context] = buildNodeAssistantNodeContexts([cardWithRefs()], OPTIONS)
    expect(JSON.stringify(context)).not.toContain('cdn.example.com')
    expect(JSON.stringify(context)).not.toContain('http')
  })

  it('还没收图的卡 → 空 items（能收，但还没收）', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [
        makeNode('card-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.background,
        }),
      ],
      OPTIONS,
    )
    expect(context?.references).toEqual({ limit: 3, items: [] })
  })

  it('条目数按 maxNodeReferences 截断', () => {
    const [context] = buildNodeAssistantNodeContexts(
      [
        makeNode('card-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.character,
          referenceAssets: Array.from(
            { length: NODE_STUDIO_ASSISTANT_LIMITS.maxNodeReferences + 4 },
            (_, index) => ({
              id: `r${index}`,
              url: `https://cdn.example.com/${index}.png`,
              role: 'identity',
              weight: 0.72,
              source: 'upload',
            }),
          ),
        }),
      ],
      OPTIONS,
    )
    expect(context?.references?.items).toHaveLength(
      NODE_STUDIO_ASSISTANT_LIMITS.maxNodeReferences,
    )
  })

  it('散图 / 镜头 / 视频节点没有这个字段（那条路是连线）', () => {
    const contexts = buildNodeAssistantNodeContexts(
      [
        makeNode('img-1', NODE_TYPE_IDS.image),
        makeNode('shot-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
        }),
        makeNode('vid-1', NODE_TYPE_IDS.seedance),
      ],
      OPTIONS,
    )
    for (const context of contexts) {
      expect(context).not.toHaveProperty('references')
    }
  })
})

describe('buildNodeAssistantNodeContexts · 空态与上限', () => {
  it('空画布投影出空数组', () => {
    expect(buildNodeAssistantNodeContexts([], OPTIONS)).toEqual([])
  })

  it('节点数按 maxNodes 截断（取前 N 个，不重新排序）', () => {
    const nodes = Array.from(
      { length: NODE_STUDIO_ASSISTANT_LIMITS.maxNodes + 7 },
      (_, index) => makeNode(`n-${index}`, NODE_TYPE_IDS.image),
    )
    const contexts = buildNodeAssistantNodeContexts(nodes, OPTIONS)

    expect(contexts).toHaveLength(NODE_STUDIO_ASSISTANT_LIMITS.maxNodes)
    expect(contexts[0]?.id).toBe('n-0')
    expect(contexts.at(-1)?.id).toBe(
      `n-${NODE_STUDIO_ASSISTANT_LIMITS.maxNodes - 1}`,
    )
  })

  it('没有显示名时兜底成本地化的类型标签，标题按上限截断', () => {
    const longName = '名'.repeat(
      NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength + 40,
    )
    const contexts = buildNodeAssistantNodeContexts(
      [
        makeNode('bare-1', NODE_TYPE_IDS.seedance),
        makeNode('long-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          shotName: longName,
        }),
      ],
      OPTIONS,
    )

    expect(contexts[0]?.title).toBe(`type:${NODE_TYPE_IDS.seedance}`)
    expect(contexts[1]?.title.length).toBe(
      NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength,
    )
  })
})

/* ── v4 分层快照（spec §4.4）──────────────────────────────────────────── */

function v4Node(
  id: string,
  data: Partial<NodeV4Data> & Pick<NodeV4Data, 'kind' | 'subtype'>,
): CanvasSnapshotV4Node {
  return {
    id,
    data: {
      name: id,
      status: 'done',
      createdAt: '2026-09-06T00:00:00.000Z',
      ...data,
    } as NodeV4Data,
  }
}

function v4Edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
  sourceHandle: NodeWorkflowEdgeV4['sourceHandle'] = 'out',
): NodeWorkflowEdgeV4 {
  return { id, source, target, slot, sourceHandle }
}

describe('buildNodeCanvasSnapshotV4', () => {
  const shot02 = v4Node('v_02', {
    kind: 'video',
    subtype: 'shot',
    name: 'S02·镜头',
    status: 'running',
    shotNo: 2,
    prompt: '以新首帧锁定人物、饰件、服装及体积感。',
    params: { duration: '7', aspectRatio: '16:9' },
    model: {
      optionId: 'seedance-2.5',
      modelId: 'seedance-2.5',
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'Fal', baseUrl: 'https://fal.run' },
    },
    slots: {
      firstFrame: {
        slot: 'firstFrame',
        cur: 'ver5',
        versions: [
          {
            id: 'ver4',
            edgeId: 'e_old',
            sourceNodeId: 'i_kf02a4',
            blocked: true,
            addedAt: '2026-09-05T00:00:00.000Z',
          },
          {
            id: 'ver5',
            edgeId: 'e_new',
            sourceNodeId: 'i_kf02c5',
            blocked: false,
            addedAt: '2026-09-06T00:00:00.000Z',
          },
        ],
      },
    },
  })
  const firstFrame = v4Node('i_kf02c5', {
    kind: 'image',
    subtype: 'shot',
    name: 'S02·首帧',
    shotNo: 2,
  })
  const voice = v4Node('a_sig', {
    kind: 'audio',
    subtype: 'voice',
    name: 'S02·语音',
    shotNo: 2,
    ownerName: '西格莉卡',
  })
  const rejected = v4Node('i_kf02a4', {
    kind: 'image',
    subtype: 'shot',
    name: 'kf02-action-v4',
    blocked: true,
    blockedReason: '首帧动作不自然',
  })
  const edges = [
    v4Edge('e_new', 'i_kf02c5', 'v_02', 'firstFrame'),
    v4Edge('e_voice', 'a_sig', 'v_02', 'voice'),
  ]

  it('边内联在目标节点下，槽内只报当前版 + 版本数', () => {
    const text = buildNodeCanvasSnapshotV4(
      [shot02, firstFrame, voice, rejected],
      edges,
      { currentShotNo: 2 },
    )
    expect(text).toContain(
      'S02 [[node:v_02]] video.shot · running · 7 · seedance-2.5 · 16:9',
    )
    expect(text).toContain(
      '  firstFrame ← [[node:i_kf02c5]] S02·首帧 (image.shot, done, 当前 · 共 2 版)',
    )
    expect(text).toContain(
      '  voice ← [[node:a_sig]] S02·语音 (audio.voice, done, owner=西格莉卡)',
    )
    // 非当前版（ver4 的源）不进快照的槽行。
    expect(text).not.toContain('firstFrame ← [[node:i_kf02a4]]')
    // 已内联的源节点不再单列。
    expect(text).not.toMatch(/^\[\[node:i_kf02c5\]\]/m)
  })

  it('散节点单列一段，带 blocked 理由', () => {
    const text = buildNodeCanvasSnapshotV4(
      [shot02, firstFrame, voice, rejected],
      edges,
      { currentShotNo: 2 },
    )
    expect(text).toContain('# 散节点')
    expect(text).toContain(
      '[[node:i_kf02a4]] kf02-action-v4 (image.shot, done, blocked: 首帧动作不自然)',
    )
  })

  it('当前镜与相邻两镜完整，其余一行标题', () => {
    const others = [3, 5, 7].map((shotNo) =>
      v4Node(`v_0${shotNo}`, {
        kind: 'video',
        subtype: 'shot',
        name: `S0${shotNo}·镜头`,
        shotNo,
        prompt: '别的镜头提示词',
      }),
    )
    const text = buildNodeCanvasSnapshotV4([shot02, ...others], [], {
      currentShotNo: 2,
    })
    // 相邻镜 S03 完整（带 prompt），远镜 S05 / S07 只有标题行。
    expect(text).toContain('  prompt: 别的镜头提示词')
    expect(text).toContain('S05 [[node:v_05]] video.shot · done')
    expect(text.match(/prompt: 别的镜头提示词/g)).toHaveLength(1)
  })

  it('选中或最近改动的远镜升为完整档', () => {
    const far = v4Node('v_09', {
      kind: 'video',
      subtype: 'shot',
      shotNo: 9,
      prompt: '远镜提示词',
    })
    expect(
      buildNodeCanvasSnapshotV4([shot02, far], [], { currentShotNo: 2 }),
    ).not.toContain('远镜提示词')
    expect(
      buildNodeCanvasSnapshotV4([shot02, far], [], {
        currentShotNo: 2,
        selectedIds: ['v_09'],
      }),
    ).toContain('远镜提示词')
    expect(
      buildNodeCanvasSnapshotV4([shot02, far], [], {
        currentShotNo: 2,
        changedIds: ['v_09'],
      }),
    ).toContain('远镜提示词')
  })

  it('单镜结构超预算时先降 prompt，仍超才降成标题行并明说', () => {
    // 槽极多的一镜：每条槽行都带一个长名字，把结构撑过 maxShotBlockLength。
    const sources = Array.from({ length: 10 }, (_, index) =>
      v4Node(`a_${index}`, {
        kind: 'audio',
        subtype: 'voice',
        name: `${'名'.repeat(80)}${index}`,
        shotNo: 6,
      }),
    )
    const wide = v4Node('v_06', {
      kind: 'video',
      subtype: 'shot',
      shotNo: 6,
      prompt: 'p'.repeat(300),
    })
    const wideEdges = sources.map((source, index) =>
      v4Edge(`e_${index}`, source.id, 'v_06', 'voice'),
    )

    // 少量槽 → prompt 还在。
    expect(
      buildNodeCanvasSnapshotV4(
        [wide, ...sources.slice(0, 2)],
        wideEdges.slice(0, 2),
        { currentShotNo: 6 },
      ),
    ).toContain('prompt: ')

    // 槽多到撑爆预算 → prompt 先被砍，槽行仍在。
    const trimmed = buildNodeCanvasSnapshotV4([wide, ...sources], wideEdges, {
      currentShotNo: 6,
    })
    expect(trimmed).not.toContain('prompt: ')
    expect(trimmed).toContain('  voice ← [[node:a_0]]')

    // 槽行本身就超预算 → 整镜降为标题行，并明说自己被降了。
    const flood = Array.from({ length: 40 }, (_, index) =>
      v4Node(`b_${index}`, {
        kind: 'audio',
        subtype: 'voice',
        name: `${'名'.repeat(120)}${index}`,
        shotNo: 6,
      }),
    )
    const demoted = buildNodeCanvasSnapshotV4(
      [wide, ...flood],
      flood.map((source, index) =>
        v4Edge(`f_${index}`, source.id, 'v_06', 'voice'),
      ),
      { currentShotNo: 6 },
    )
    expect(demoted).not.toContain('  voice ←')
    expect(demoted).toContain('S06 已降为标题行（结构过长）')
  })

  it('标题档超行数上限时说出省了多少，⛔ 不静默截断', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      v4Node(`v_${index + 10}`, {
        kind: 'video',
        subtype: 'shot',
        shotNo: index + 10,
      }),
    )
    const text = buildNodeCanvasSnapshotV4(many, [], {
      currentShotNo: 1,
      maxTitleRows: 2,
    })
    expect(text).toContain('… 另有 4 个镜头未列出')
  })

  it('跨镜 tailFrame 边另起「接续」一段', () => {
    const text = buildNodeCanvasSnapshotV4(
      [shot02, v4Node('v_03', { kind: 'video', subtype: 'shot', shotNo: 3 })],
      [v4Edge('e_tail', 'v_02', 'v_03', 'firstFrame', 'tailFrame')],
      { currentShotNo: 2 },
    )
    expect(text).toContain('# 接续')
    expect(text).toContain('[[node:v_02]] tailFrame → [[node:v_03]] firstFrame')
  })

  it('空画布给空串，不编造结构', () => {
    expect(buildNodeCanvasSnapshotV4([], [])).toBe('')
  })
})

describe('collectSlotLines', () => {
  it('没有 binding 的 0..N 槽回落到边表，多值并列全列', () => {
    const target = v4Node('v_1', { kind: 'video', subtype: 'shot', shotNo: 1 })
    const lines = collectSlotLines(target, [
      v4Edge('e1', 'a1', 'v_1', 'voice'),
      v4Edge('e2', 'a2', 'v_1', 'voice'),
      v4Edge('e3', 'x', 'other', 'voice'),
    ])
    expect(lines).toEqual([
      { slot: 'voice', sourceId: 'a1', versionCount: 1 },
      { slot: 'voice', sourceId: 'a2', versionCount: 1 },
    ])
  })

  it('cur 为空的槽不产生行（空槽不冒充有内容）', () => {
    const target = v4Node('v_1', {
      kind: 'video',
      subtype: 'shot',
      shotNo: 1,
      slots: {
        firstFrame: { slot: 'firstFrame', cur: null, versions: [] },
      },
    })
    expect(collectSlotLines(target, [])).toEqual([])
  })
})
