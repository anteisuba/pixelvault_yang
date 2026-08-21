import { describe, expect, it } from 'vitest'

import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import {
  buildAssistantSetImageCategoryPatch,
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
