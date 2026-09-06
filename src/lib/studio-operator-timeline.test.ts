import { describe, expect, it } from 'vitest'
import { ASSISTANT_OPERATOR_TOOL_IDS as TOOLS } from '@/constants/assistant-operator'
import {
  countOperatorTextLines,
  firstOperatorSentence,
  foldOperatorDomainMarks,
  groupOperatorResearch,
  groupOperatorResearchRuns,
  hasOperatorResearchFindings,
  isOperatorResearchCardTool,
  isOperatorResearchTool,
  shouldCollapseOperatorText,
  shouldStickOperatorScroll,
  splitOperatorHistoryRounds,
} from './studio-operator-timeline'
import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'

/** 一条跑完的调查步 —— 只填这两个判据读得到的字段。 */
function researchStep(
  result: Record<string, unknown>,
  tool: string = TOOLS.research,
): StudioOperatorStepEntry {
  return {
    kind: 'step',
    id: `entry-${tool}`,
    runKey: 'run-1',
    step: {
      id: 'step-1',
      title: '查了一下',
      tool,
      status: 'done',
      payload: {},
      result,
    },
  } as unknown as StudioOperatorStepEntry
}

describe('hasOperatorResearchFindings', () => {
  it('⛔ 证据与候选都为空 → 不值一张卡（2026-09-07 真机的三张里两张）', () => {
    expect(hasOperatorResearchFindings([researchStep({ evidence: [] })])).toBe(
      false,
    )
    // 连 `result` 都没有的那一张同理。
    expect(hasOperatorResearchFindings([researchStep({})])).toBe(false)
  })

  it('有一条证据就出卡', () => {
    expect(
      hasOperatorResearchFindings([
        researchStep({
          evidence: [{ title: 'a', publisher: 'b', snippet: 'c' }],
        }),
      ]),
    ).toBe(true)
  })

  it('证据为空但有候选图 → 照旧出卡（候选是这张卡的下半部分）', () => {
    expect(
      hasOperatorResearchFindings([
        researchStep({ evidence: [] }),
        researchStep(
          { images: [{ url: 'https://x/1.png' }] },
          TOOLS.searchWebImages,
        ),
      ]),
    ).toBe(true)
  })
})

describe('shouldStickOperatorScroll', () => {
  it('贴着底 → 跟着滚', () => {
    expect(
      shouldStickOperatorScroll({
        scrollTop: 900,
        scrollHeight: 1000,
        clientHeight: 100,
      }),
    ).toBe(true)
  })

  it('阈值之内仍算「在底部附近」', () => {
    expect(
      shouldStickOperatorScroll({
        scrollTop: 900 - STUDIO_OPERATOR_TIMELINE.stickToBottomPx,
        scrollHeight: 1000,
        clientHeight: 100,
      }),
    ).toBe(true)
  })

  it('⛔ 用户已经手动上滚 → 不打扰', () => {
    expect(
      shouldStickOperatorScroll({
        scrollTop: 100,
        scrollHeight: 1000,
        clientHeight: 100,
      }),
    ).toBe(false)
  })
})

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

describe('groupOperatorResearchRuns', () => {
  it('同一轮的调查步归到一张卡，中间夹的写入步不切断', () => {
    expect(
      groupOperatorResearchRuns([
        { runKey: 'r1', tool: TOOLS.research },
        { runKey: 'r1', tool: 'set_prompt' },
        { runKey: 'r1', tool: TOOLS.readUrl },
        { runKey: 'r1', tool: TOOLS.searchWebImages },
      ]),
    ).toEqual([{ runKey: 'r1', indexes: [0, 2, 3] }])
  })
  it('跨轮不合并 —— 两次委托是两张卡', () => {
    expect(
      groupOperatorResearchRuns([
        { runKey: 'r1', tool: TOOLS.research },
        { runKey: 'r2', tool: TOOLS.research },
      ]),
    ).toEqual([
      { runKey: 'r1', indexes: [0] },
      { runKey: 'r2', indexes: [1] },
    ])
  })
  it('搜图候选进调查卡，纯翻找的 search_web 不进', () => {
    expect(isOperatorResearchCardTool(TOOLS.searchWebImages)).toBe(true)
    expect(isOperatorResearchCardTool(TOOLS.research)).toBe(true)
    expect(isOperatorResearchCardTool(TOOLS.readUrl)).toBe(true)
    for (const tool of [TOOLS.searchWeb, TOOLS.readState, 'set_prompt']) {
      expect(isOperatorResearchCardTool(tool)).toBe(false)
    }
  })
})

describe('foldOperatorDomainMarks', () => {
  it('连续的切域只留最后一条', () => {
    expect([
      ...foldOperatorDomainMarks(
        ['user', 'domainMark', 'domainMark', 'domainMark', 'message'],
        'domainMark',
      ),
    ]).toEqual([1, 2])
  })
  it('中间隔了一句话的两条切域各自留着', () => {
    expect([
      ...foldOperatorDomainMarks(
        ['domainMark', 'message', 'domainMark'],
        'domainMark',
      ),
    ]).toEqual([])
  })
})

describe('splitOperatorHistoryRounds', () => {
  it('每条用户发言起一轮', () => {
    expect(
      splitOperatorHistoryRounds([
        'user',
        'message',
        'step',
        'user',
        'message',
      ]),
    ).toEqual([{ indexes: [0, 1, 2] }, { indexes: [3, 4] }])
  })
  it('第一条用户发言之前的那些自成一轮，不丢也不并进后面', () => {
    expect(splitOperatorHistoryRounds(['message', 'step', 'user'])).toEqual([
      { indexes: [0, 1] },
      { indexes: [2] },
    ])
  })
  it('空历史没有轮', () => {
    expect(splitOperatorHistoryRounds([])).toEqual([])
  })
})

describe('折叠长回话与首句摘要', () => {
  it('超过常量那一档才折', () => {
    expect(shouldCollapseOperatorText('一\n二\n三\n四\n五\n六')).toBe(false)
    expect(shouldCollapseOperatorText('一\n二\n三\n四\n五\n六\n七')).toBe(true)
    expect(countOperatorTextLines('')).toBe(0)
  })
  it('首句带标点，一句都没有时退回第一行', () => {
    expect(firstOperatorSentence('先这样。再那样。')).toBe('先这样。')
    expect(firstOperatorSentence('Do this. Then that.')).toBe('Do this.')
    expect(firstOperatorSentence('- 一条列表\n- 另一条')).toBe('- 一条列表')
    expect(firstOperatorSentence('   ')).toBe('')
  })

  it('⭐ 编号列表的「1.」不算句号 —— ⛔ 摘要不是一个孤零零的序号', () => {
    // 2026-09-06 真机上量到的：八条编号要点，折起来只剩「1.」。
    expect(firstOperatorSentence('1. 先定光源\n2. 再定色温')).toBe(
      '1. 先定光源',
    )
    // 小数同理。
    expect(firstOperatorSentence('权重给 3.5 就够了。再多会糊。')).toBe(
      '权重给 3.5 就够了。',
    )
  })
})
