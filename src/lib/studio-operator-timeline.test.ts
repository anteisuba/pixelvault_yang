import { describe, expect, it } from 'vitest'
import { ASSISTANT_OPERATOR_TOOL_IDS as TOOLS } from '@/constants/assistant-operator'
import {
  groupOperatorResearch,
  isOperatorResearchTool,
} from './studio-operator-timeline'

describe('groupOperatorResearch', () => {
  it('连续调查与过渡说明合并，保留用户消息和最终结论', () => {
    expect(
      groupOperatorResearch([
        'result',
        'message',
        'research',
        'message',
        'research',
        'message',
      ]),
    ).toEqual([
      { research: false, indexes: [0] },
      { research: true, indexes: [1, 2, 3, 4] },
      { research: false, indexes: [5] },
    ])
  })
  it('失败、可操作结果与新一轮用户消息会切断折叠组', () => {
    expect(
      groupOperatorResearch([
        'research',
        'result',
        'message',
        'result',
        'research',
      ]),
    ).toEqual([
      { research: true, indexes: [0] },
      { research: false, indexes: [1] },
      { research: false, indexes: [2] },
      { research: false, indexes: [3] },
      { research: true, indexes: [4] },
    ])
  })
  it('未开始工具调用时保留当前回复', () => {
    expect(groupOperatorResearch(['message'])).toEqual([
      { research: false, indexes: [0] },
    ])
  })
  it('搜图候选、素材候选、评价与写入工具不是可隐藏的调查结果', () => {
    expect(isOperatorResearchTool(TOOLS.searchWeb)).toBe(true)
    for (const tool of [
      TOOLS.searchWebImages,
      TOOLS.searchAssets,
      TOOLS.searchLoras,
      TOOLS.critiqueResult,
      'set_prompt',
      'unknown',
    ]) {
      expect(isOperatorResearchTool(tool)).toBe(false)
    }
  })
})
