import { describe, expect, it } from 'vitest'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID,
} from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import {
  buildNodeAssistantNodeContexts,
  canCarryImageCategory,
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
