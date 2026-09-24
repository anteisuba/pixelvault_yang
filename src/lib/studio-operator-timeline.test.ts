import { describe, expect, it } from 'vitest'
import { ASSISTANT_OPERATOR_TOOL_IDS as TOOLS } from '@/constants/assistant-operator'
import {
  countOperatorTextLines,
  mergeOperatorSystemRuns,
  firstOperatorSentence,
  collectOperatorAnswerSources,
  groupOperatorResearch,
  summarizeOperatorResearchBlock,
  isOperatorResearchTool,
  shouldCollapseOperatorText,
  shouldStickOperatorScroll,
  placeOperatorRoundSummaries,
  splitOperatorHistoryRounds,
} from './studio-operator-timeline'
import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'
import type {
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'

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

describe('collectOperatorAnswerSources', () => {
  /** 一条助手消息条目 —— 只填收集器读得到的两格。 */
  const message = (id: string) =>
    ({
      kind: 'message',
      id,
      text: 'ok',
    }) as unknown as StudioOperatorThreadEntry

  it('⭐ 资料挂在**下一条**回答上，挂完清零', () => {
    const entries = [
      researchStep({ evidence: [{ cite: 1 }] }),
      message('m1'),
      researchStep({ evidence: [{ cite: 2 }] }),
      message('m2'),
    ] as unknown as StudioOperatorThreadEntry[]
    const map = collectOperatorAnswerSources(entries)
    expect(map.get('m1')).toEqual({ runKey: 'run-1', steps: [0] })
    expect(map.get('m2')).toEqual({ runKey: 'run-1', steps: [2] })
  })

  it('⛔ 一条证据都没有的调查步不挂；收不到回答的那几条也不挂', () => {
    const entries = [
      researchStep({ evidence: [] }),
      message('m1'),
      researchStep({ evidence: [{ cite: 1 }] }),
    ] as unknown as StudioOperatorThreadEntry[]
    const map = collectOperatorAnswerSources(entries)
    expect(map.size).toBe(0)
  })

  it('一句话之前查了两次 → 两次都挂在这一句下面', () => {
    const entries = [
      researchStep({ evidence: [{ cite: 1 }] }),
      researchStep({ evidence: [{ cite: 2 }] }),
      message('m1'),
    ] as unknown as StudioOperatorThreadEntry[]
    expect(collectOperatorAnswerSources(entries).get('m1')).toEqual({
      runKey: 'run-1',
      steps: [0, 1],
    })
  })
})

describe('summarizeOperatorResearchBlock', () => {
  const research = (
    payload: Record<string, unknown>,
    evidence: unknown[] = [],
  ): StudioOperatorStepEntry =>
    ({
      kind: 'step',
      id: 'r',
      runKey: 'run-1',
      step: {
        id: 's',
        title: '查',
        tool: TOOLS.research,
        status: 'done',
        payload: {
          goal: 'g',
          entities: [],
          sources: ['web'],
          round: 1,
          ...payload,
        },
        result: { evidence, totalFound: evidence.length },
      },
    }) as unknown as StudioOperatorStepEntry

  it('⛔ 没有 research 步就不是一次调查 —— 退回 ToolGroup', () => {
    expect(summarizeOperatorResearchBlock([])).toBeNull()
    expect(
      summarizeOperatorResearchBlock([researchStep({}, TOOLS.readUrl)]),
    ).toBeNull()
  })

  it('⭐ 快搜：条数来自证据，页数来自服务端读的那几页', () => {
    expect(
      summarizeOperatorResearchBlock([
        research({ depth: 'quick', readPages: 3 }, [{}, {}, {}, {}, {}, {}]),
      ]),
    ).toEqual({ depth: 'quick', found: 6, readPages: 3 })
  })

  it('⭐ 一组里出现过深档就算深档；模型自己发的 read_url 也计页', () => {
    expect(
      summarizeOperatorResearchBlock([
        research({ depth: 'quick', readPages: 1 }, [{}]),
        research({ depth: 'deep', readPages: 0 }, [{}, {}]),
        researchStep({}, TOOLS.readUrl),
        researchStep({}, TOOLS.readUrl),
      ]),
    ).toEqual({ depth: 'deep', found: 3, readPages: 3 })
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

describe('placeOperatorRoundSummaries', () => {
  const KINDS = ['user', 'message', 'user', 'step', 'message']

  it('从尾对齐：最后一条结论挂在最后一轮的末尾', () => {
    expect(placeOperatorRoundSummaries(KINDS, 2)).toEqual({
      byIndex: new Map([
        [1, [0]],
        [4, [1]],
      ]),
      leading: [],
    })
  })

  it('结论比轮次少时只摊得下的那几条落位，⛔ 不往前硬凑', () => {
    expect(placeOperatorRoundSummaries(KINDS, 1)).toEqual({
      byIndex: new Map([[4, [0]]]),
      leading: [],
    })
  })

  it('结论比轮次多时多出来的那几条进 leading，⛔ 一条都不丢', () => {
    expect(placeOperatorRoundSummaries(KINDS, 4)).toEqual({
      byIndex: new Map([
        [1, [2]],
        [4, [3]],
      ]),
      leading: [0, 1],
    })
  })

  it('没有历史条目时全部进 leading；一条结论都没有时什么都不摊', () => {
    expect(placeOperatorRoundSummaries([], 2)).toEqual({
      byIndex: new Map(),
      leading: [0, 1],
    })
    expect(placeOperatorRoundSummaries(KINDS, 0)).toEqual({
      byIndex: new Map(),
      leading: [],
    })
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

describe('mergeOperatorSystemRuns', () => {
  it('并紧挨着的同类还原行，保留出现顺序', () => {
    const merged = mergeOperatorSystemRuns([
      { kind: 'system', id: 'a', code: 'revertField', subject: 'specs' },
      { kind: 'system', id: 'b', code: 'revertField', subject: 'prompt' },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'a', subjects: ['specs', 'prompt'] })
  })

  it('中间隔了别的条目、或不是同一类，就不并', () => {
    const merged = mergeOperatorSystemRuns([
      { kind: 'system', id: 'a', code: 'revertField', subject: 'specs' },
      { kind: 'message', id: 'm' },
      { kind: 'system', id: 'b', code: 'revertField', subject: 'prompt' },
      { kind: 'system', id: 'c', code: 'undoStep', subject: '写提示词' },
      { kind: 'system', id: 'd', code: 'revertAll', count: 2 },
      { kind: 'system', id: 'e', code: 'revertAll', count: 1 },
    ] as { kind: string; id: string; code?: string; subject?: string }[])
    expect(merged.map((entry) => entry.id)).toEqual([
      'a',
      'm',
      'b',
      'c',
      'd',
      'e',
    ])
  })
})
