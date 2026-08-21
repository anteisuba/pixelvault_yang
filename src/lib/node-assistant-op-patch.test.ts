import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type {
  NodeWorkflowNodeData,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'

import {
  buildAssistantAttachAssetPatch,
  buildAssistantSetImageCategoryPatch,
  buildAssistantSetModelPatch,
  buildAssistantSetParamsPatch,
  buildAssistantSetPromptPatch,
} from './node-assistant-op-patch'

describe('buildAssistantSetPromptPatch', () => {
  it('只写 prompt 一个字段 —— 与人手在同一个框里打字等价', () => {
    expect(
      buildAssistantSetPromptPatch({
        op: 'set_prompt',
        target: 'shot-1',
        prompt: '黄昏，逆光，中景',
      }),
    ).toEqual({ prompt: '黄昏，逆光，中景' })
  })
})

describe('buildAssistantSetImageCategoryPatch', () => {
  it('非 custom 分类顺手清掉旧的自定义名', () => {
    expect(
      buildAssistantSetImageCategoryPatch('frameStart', {
        op: 'set_image_category',
        target: 'img-1',
        category: 'frameStart',
      }),
    ).toEqual({ imageCategory: 'frameStart', imageCategoryLabel: undefined })
  })

  it('custom 分类带上 op 自己给的名字', () => {
    expect(
      buildAssistantSetImageCategoryPatch('custom', {
        op: 'set_image_category',
        target: 'img-1',
        category: 'custom',
        label: '道具·手电',
      }),
    ).toEqual({ imageCategory: 'custom', imageCategoryLabel: '道具·手电' })
  })
})

describe('buildAssistantSetModelPatch', () => {
  const OPTION = {
    optionId: 'saved:key-1:seedance-2.0',
    modelId: 'seedance-2.0',
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
    requestCount: 5,
    sourceType: 'saved' as const,
    apiKeyId: 'key-1',
  }

  it('五个字段全部来自查表 —— 载荷里只有一个 id', () => {
    expect(buildAssistantSetModelPatch(OPTION)).toEqual({
      model: {
        optionId: 'saved:key-1:seedance-2.0',
        modelId: 'seedance-2.0',
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
        apiKeyId: 'key-1',
      },
    })
  })

  it('工作区内置路线没有 apiKeyId —— 字段直接缺席，不写 undefined', () => {
    const patch = buildAssistantSetModelPatch({
      optionId: 'workspace:seedance-2.0',
      modelId: 'seedance-2.0',
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      requestCount: 5,
      sourceType: 'workspace',
    })
    expect(patch.model).not.toHaveProperty('apiKeyId')
  })
})

describe('buildAssistantSetParamsPatch', () => {
  it('只写载荷里真的带了的那几档', () => {
    expect(
      buildAssistantSetParamsPatch({
        op: 'set_params',
        target: 'vid-1',
        resolution: '720p',
        seed: 42,
      }),
    ).toEqual({ resolution: '720p', seed: 42 })
  })

  // ⚠ 数据层的 duration 是**字符串**（读侧走 Number.parseFloat）。写成数字
  // 会在 zod 那关就掉，而那一掉是整份 project state 落不了库。
  it('duration 折成字符串，auto 原样', () => {
    expect(
      buildAssistantSetParamsPatch({
        op: 'set_params',
        target: 'vid-1',
        duration: 6,
      }),
    ).toEqual({ duration: '6' })
    expect(
      buildAssistantSetParamsPatch({
        op: 'set_params',
        target: 'vid-1',
        duration: 'auto',
      }),
    ).toEqual({ duration: 'auto' })
  })

  it('generateAudio: false 要写进去（false 不是「没给」）', () => {
    expect(
      buildAssistantSetParamsPatch({
        op: 'set_params',
        target: 'vid-1',
        generateAudio: false,
      }),
    ).toEqual({ generateAudio: false })
  })
})

describe('buildAssistantAttachAssetPatch', () => {
  const asset = (id: string, url: string): NodeWorkflowReferenceAsset => ({
    id,
    url,
    role: 'identity',
    weight: 0.72,
    source: 'canvas',
    sourceId: 'img-1',
  })

  it('在原数组尾部追加，不排序不去重（重复与容量在规划器就拒了）', () => {
    const existing = [asset('r1', 'https://cdn.example.com/1.png')]
    const patch = buildAssistantAttachAssetPatch(
      existing,
      asset('r2', 'https://cdn.example.com/2.png'),
    )
    expect(patch.referenceAssets?.map((entry) => entry.id)).toEqual([
      'r1',
      'r2',
    ])
    // 原数组不被就地改 —— 撤销栈拿到的是同一个引用就退不回去了。
    expect(existing).toHaveLength(1)
  })

  it('卡上还没有图集时也能挂第一张', () => {
    const patch = buildAssistantAttachAssetPatch(
      undefined,
      asset('r1', 'https://cdn.example.com/1.png'),
    )
    expect(patch.referenceAssets).toHaveLength(1)
  })

  // 执行器同一批挂两次靠本地账累积：第二次的 `existing` 必须是第一次写完的那份，
  // 否则第二条会把第一条覆盖掉（快照读不回来）。
  it('连挂两次要接着上一次的结果往后加', () => {
    const first = buildAssistantAttachAssetPatch(
      undefined,
      asset('r1', 'https://cdn.example.com/1.png'),
    )
    const second = buildAssistantAttachAssetPatch(
      first.referenceAssets,
      asset('r2', 'https://cdn.example.com/2.png'),
    )
    expect(second.referenceAssets?.map((entry) => entry.id)).toEqual([
      'r1',
      'r2',
    ])
  })
})

/**
 * 执行器（`StudioNodeWorkbench.handleRunAssistantCanvasOps`）对同一个节点的多次
 * 写入靠一本本地账（`dataOverrideById`）累积 —— React 的 `setState` 同 tick 读不
 * 回来，所以同一批里后写的补丁必须叠在先写的上面，而不是各写各的。
 *
 * 这里断言的是那本账**依赖的合并语义**：补丁是 `Partial`，浅合并后先写的字段
 * 仍在。执行器里那个 `applyNodeDataPatch` 走的就是这一句
 * （`{...已有, ...新补丁}`）。
 */
describe('同一批里对同一个节点写两次', () => {
  it('后一次不会把前一次写的别的字段抹掉', () => {
    const ledger: Partial<NodeWorkflowNodeData> = {}
    const first = buildAssistantSetPromptPatch({
      op: 'set_prompt',
      target: 'img-1',
      prompt: '雨夜，霓虹反光',
    })
    const second = buildAssistantSetImageCategoryPatch('frameEnd', {
      op: 'set_image_category',
      target: 'img-1',
      category: 'frameEnd',
    })

    const merged = { ...ledger, ...first, ...second }

    expect(merged.prompt).toBe('雨夜，霓虹反光')
    expect(merged.imageCategory).toBe('frameEnd')
  })

  it('同一个字段写两次是后写的赢（最后一条 op 说了算）', () => {
    const merged = {
      ...buildAssistantSetImageCategoryPatch('custom', {
        op: 'set_image_category',
        target: 'img-1',
        category: 'custom',
        label: '临时',
      }),
      ...buildAssistantSetImageCategoryPatch('frameStart', {
        op: 'set_image_category',
        target: 'img-1',
        category: 'frameStart',
      }),
    }

    expect(merged).toEqual({
      imageCategory: 'frameStart',
      imageCategoryLabel: undefined,
    })
  })
})
