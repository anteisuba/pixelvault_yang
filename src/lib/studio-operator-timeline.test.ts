import { describe, expect, it } from 'vitest'
import { ASSISTANT_OPERATOR_TOOL_IDS as TOOLS } from '@/constants/assistant-operator'
import {
  countOperatorTextLines,
  mergeOperatorSystemRuns,
  firstOperatorSentence,
  collectOperatorAnswerSources,
  collectOperatorAnswerWebFinds,
  collectOperatorFindRefs,
  collectOperatorPriorFinds,
  operatorFindKey,
  orderOperatorWebFinds,
  webFindNumbersIn,
  groupOperatorResearch,
  summarizeOperatorResearchBlock,
  isOperatorResearchTool,
  shouldCollapseOperatorText,
  shouldStickOperatorScroll,
  placeOperatorRoundSummaries,
  splitOperatorHistoryRounds,
  operatorRunningPhrase,
  operatorThoughtSteps,
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

/**
 * 找到的图挂在哪一段回答底下（搜索期切片 1，2026-10-15）：网格⛔ 不再折进步骤组，
 * 摆在回答正文下面；还在写 / 折进调查组的那条不当锚。
 */
describe('collectOperatorAnswerWebFinds', () => {
  const webStep = (id: string, images: unknown[], status = 'done') =>
    ({
      kind: 'step',
      id,
      runKey: 'run-1',
      undone: false,
      step: {
        id,
        title: '找图',
        tool: TOOLS.searchWebImages,
        status,
        payload: { query: 'q', limit: 8 },
        ...(status === 'done'
          ? { result: { totalFound: images.length, images } }
          : {}),
      },
    }) as unknown as StudioOperatorThreadEntry
  const message = (id: string, streaming = false) =>
    ({
      kind: 'message',
      id,
      text: 'ok',
      streaming,
    }) as StudioOperatorThreadEntry
  const user = {
    kind: 'user',
    id: 'u',
    text: 'hi',
  } as StudioOperatorThreadEntry
  const anyAnchor = (entry: { streaming?: boolean }) => !entry.streaming
  const image = { imageUrl: 'https://a.test/1.jpg' }

  it('⭐ 挂在下一条说完的回答上；还在写的那条不当锚', () => {
    const entries = [webStep('w1', [image]), message('m1', true)]
    const streaming = collectOperatorAnswerWebFinds(entries, anyAnchor)
    expect(streaming.byMessage.size).toBe(0)
    expect(streaming.anchored.size).toBe(0)

    const done = collectOperatorAnswerWebFinds(
      [webStep('w1', [image]), message('m1')],
      anyAnchor,
    )
    expect(done.byMessage.get('m1')?.map((entry) => entry.id)).toEqual(['w1'])
    expect([...done.anchored]).toEqual(['w1'])
  })

  it('调用方说不能当锚的（折进调查组的）跳过，挂到再下一条', () => {
    const entries = [
      webStep('w1', [image]),
      message('folded'),
      message('answer'),
    ]
    const { byMessage } = collectOperatorAnswerWebFinds(
      entries,
      (entry) => entry.id !== 'folded',
    )
    expect(byMessage.has('folded')).toBe(false)
    expect(byMessage.get('answer')?.map((entry) => entry.id)).toEqual(['w1'])
  })

  it('⛔ 没找到图的、还在跑的不挂；⛔ 上一轮没等到回答的不跨轮挂', () => {
    const entries = [
      webStep('empty', []),
      webStep('running', [], 'running'),
      webStep('stopped', [image]),
      user,
      webStep('w2', [image]),
      message('m2'),
    ]
    const { byMessage, anchored } = collectOperatorAnswerWebFinds(
      entries,
      anyAnchor,
    )
    expect(byMessage.get('m2')?.map((entry) => entry.id)).toEqual(['w2'])
    expect(anchored.has('stopped')).toBe(false)
    expect(anchored.has('empty')).toBe(false)
  })

  /** 搜索期第二片：找到的视频走同一条路 —— 同一段回答底下图与视频按出场顺序挂。 */
  const videoStep = (id: string, videos: unknown[], status = 'done') =>
    ({
      kind: 'step',
      id,
      runKey: 'run-1',
      undone: false,
      step: {
        id,
        title: '找视频',
        tool: TOOLS.searchWebVideos,
        status,
        payload: { query: 'q', limit: 8, bilibili: false },
        ...(status === 'done'
          ? { result: { totalFound: videos.length, videos } }
          : {}),
      },
    }) as unknown as StudioOperatorThreadEntry
  const video = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'PV',
    platform: 'youtube',
  }

  it('⭐ 找到的视频与图挂在同一段回答底下；摆的时候图在上、视频在下', () => {
    const { byMessage, anchored } = collectOperatorAnswerWebFinds(
      [
        videoStep('v1', [video]),
        webStep('w1', [image]),
        videoStep('v2', [video]),
        message('m1'),
      ],
      anyAnchor,
    )
    const found = byMessage.get('m1') ?? []
    expect(found.map((entry) => entry.id)).toEqual(['v1', 'w1', 'v2'])
    expect([...anchored].sort()).toEqual(['v1', 'v2', 'w1'])
    expect(orderOperatorWebFinds(found).map((entry) => entry.id)).toEqual([
      'w1',
      'v1',
      'v2',
    ])
  })

  it('⛔ 一条都没找到的、还在跑的找视频不挂', () => {
    const { byMessage, anchored } = collectOperatorAnswerWebFinds(
      [
        videoStep('empty', []),
        videoStep('running', [], 'running'),
        message('m1'),
      ],
      anyAnchor,
    )
    expect(byMessage.size).toBe(0)
    expect(anchored.size).toBe(0)
  })
})

describe('summarizeOperatorResearchBlock', () => {
  const research = (
    payload: Record<string, unknown>,
    evidence: unknown[] = [],
    result: Record<string, unknown> = {},
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
        result: { evidence, totalFound: evidence.length, ...result },
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
    ).toEqual({
      depth: 'quick',
      found: 6,
      readPages: 3,
      xVideosWatched: 0,
      webSearchFallback: false,
    })
  })

  it('⭐ 一组里出现过深档就算深档；模型自己发的 read_url 也计页', () => {
    expect(
      summarizeOperatorResearchBlock([
        research({ depth: 'quick', readPages: 1 }, [{}]),
        research({ depth: 'deep', readPages: 0 }, [{}, {}]),
        researchStep({}, TOOLS.readUrl),
        researchStep({}, TOOLS.readUrl),
      ]),
    ).toEqual({
      depth: 'deep',
      found: 3,
      readPages: 3,
      xVideosWatched: 0,
      webSearchFallback: false,
    })
  })

  it('⭐ Grok 看了 X 上的视频（创作者明说「看看视频」时）：一组里看了几段加起来', () => {
    expect(
      summarizeOperatorResearchBlock([
        research({ depth: 'quick', readPages: 0 }, [{}], { xVideosWatched: 2 }),
        research({ depth: 'quick', readPages: 0 }, [{}], { xVideosWatched: 1 }),
        research({ depth: 'quick', readPages: 0 }, [{}]),
      ]),
    ).toEqual({
      depth: 'quick',
      found: 3,
      readPages: 0,
      xVideosWatched: 3,
      webSearchFallback: false,
    })
  })

  it('⭐ 有一步的网页结果改由平台 Serper 搜了：这一组就照实标出来（owner 2026-10-15）', () => {
    expect(
      summarizeOperatorResearchBlock([
        research({ depth: 'quick', readPages: 0 }, [{}]),
        research({ depth: 'quick', readPages: 0 }, [{}], {
          webSearchFallback: true,
        }),
      ])?.webSearchFallback,
    ).toBe(true)
  })

  it('⭐ 跑着的查资料一开口就算一次调查（owner 2026-09-30）', () => {
    const running = research({ depth: 'quick', readPages: 0 })
    const entry = {
      ...running,
      step: { ...running.step, status: 'running', result: null },
    } as unknown as StudioOperatorStepEntry
    expect(summarizeOperatorResearchBlock([entry])).toEqual({
      depth: 'quick',
      found: 0,
      readPages: 0,
      xVideosWatched: 0,
      webSearchFallback: false,
    })
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
  it('带代码块的不折：反推给的那段就是交付物', () => {
    expect(
      shouldCollapseOperatorText(
        '看了：\n```\n1girl,\nsolo,\nblack hair\n```\n没写进标签台。',
      ),
    ).toBe(false)
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

/**
 * 过程行跑着时那一句人话动词（2026-10-14 设计方案 §9.1）：按动词取，「查」按工具分
 * 「查素材」（自己的库）与「查资料」（外面）。
 */
describe('operatorRunningPhrase', () => {
  it.each([
    [TOOLS.analyzeReferences, 'look', 'look'],
    [TOOLS.searchWeb, 'research', 'research'],
    [TOOLS.searchWebImages, 'research', 'webImages'],
    [TOOLS.searchWebVideos, 'research', 'webVideos'],
    [TOOLS.searchAssets, 'research', 'library'],
    [TOOLS.searchLoras, 'research', 'library'],
    [TOOLS.recallEvidence, 'research', 'library'],
    [TOOLS.proposeContextCard, 'ask', 'ask'],
    [TOOLS.setPrompt, 'apply', 'apply'],
    ['request_generation', 'request_generation', 'generate'],
  ] as const)('%s（%s）→ %s', (tool, verb, phrase) => {
    expect(operatorRunningPhrase({ tool, verb })).toBe(phrase)
  })
})

/**
 * 搜索期第三片（附录 I §3.3 / §四「模型点名」）：上一轮找到的带进下一轮；回复里的 `#n` 认哪张卡、
 * 一轮最后一段回复点名了哪几张。
 */
describe('找到的东西编号 #n（搜索期第三片）', () => {
  const imageStep = (id: string, numbers: number[], status = 'done') =>
    ({
      kind: 'step',
      id,
      runKey: 'run-1',
      undone: false,
      step: {
        id,
        title: '找图',
        tool: TOOLS.searchWebImages,
        status,
        payload: { query: 'q', limit: 8 },
        ...(status === 'done'
          ? {
              result: {
                totalFound: numbers.length,
                images: numbers.map((n) => ({
                  n,
                  imageUrl: `https://a.test/${id}-${n}.jpg`,
                  domain: 'a.test',
                  title: `pic ${n}`,
                  usableAsInput: true,
                  sourceVerdict: 'unknownLicense',
                })),
              },
            }
          : {}),
      },
    }) as unknown as StudioOperatorThreadEntry
  const videoStep = (id: string, numbers: number[]) =>
    ({
      kind: 'step',
      id,
      runKey: 'run-1',
      undone: false,
      step: {
        id,
        title: '找视频',
        tool: TOOLS.searchWebVideos,
        status: 'done',
        payload: { query: 'q', limit: 8, bilibili: false },
        result: {
          totalFound: numbers.length,
          videos: numbers.map((n) => ({
            n,
            url: `https://www.youtube.com/watch?v=${id}${n}`,
            title: `clip ${n}`,
            platform: 'youtube',
          })),
        },
      },
    }) as unknown as StudioOperatorThreadEntry
  const user = (id: string) =>
    ({ kind: 'user', id, text: 'hi' }) as StudioOperatorThreadEntry
  const message = (id: string, text: string, streaming = false) =>
    ({ kind: 'message', id, text, streaming }) as StudioOperatorThreadEntry

  it('⭐ 带进下一轮的只有上一轮的（最后一条用户发言之前那一轮），图与视频都带、按号排', () => {
    const entries = [
      user('u1'),
      imageStep('old', [1, 2]),
      message('m1', '#1'),
      user('u2'),
      imageStep('w2', [3, 4]),
      videoStep('v2', [5]),
      message('m2', '#4 最像'),
      user('u3'),
    ]
    const carried = collectOperatorPriorFinds(entries)
    expect(carried.map((find) => [find.kind, find.n])).toEqual([
      ['image', 3],
      ['image', 4],
      ['video', 5],
    ])
    expect(carried[0]).toMatchObject({
      imageUrl: 'https://a.test/w2-3.jpg',
      title: 'pic 3',
    })
    // 第一轮：没有上一轮。
    expect(collectOperatorPriorFinds([user('u1')])).toEqual([])
    // 上一轮什么都没找到：一条都不带（⛔ 不往更早翻）。
    expect(
      collectOperatorPriorFinds([
        user('u1'),
        imageStep('old', [1]),
        user('u2'),
        message('m2', '好'),
        user('u3'),
      ]),
    ).toEqual([])
  })

  it('⭐ 答完题也是新的一轮（与服务端同一刀）：带的是问题之前那半段找到的；一组几条答题行算一刀', () => {
    const answered = (id: string) =>
      ({
        kind: 'system',
        id,
        code: 'questionAnswered',
        subject: '画风 · 2D',
        userText: '画风：2D',
      }) as StudioOperatorThreadEntry
    const entries = [
      user('u1'),
      imageStep('old', [1, 2]),
      message('m1', '好'),
      user('u2'),
      imageStep('w2', [3, 4]),
      message('m2', '先问两句'),
      answered('a1'),
      answered('a2'),
    ]
    // ⛔ 不是更早那一轮的 #1 / #2：那样新找到的会从 #3 接着数，和屏幕上的 #3 撞号。
    expect(collectOperatorPriorFinds(entries).map((find) => find.n)).toEqual([
      3, 4,
    ])
    // 答完之后又找了一次、再说一段：这一段认 #3 / #4（上一轮）+ #5（这一轮）。
    const { byMessage, named } = collectOperatorFindRefs(
      [...entries, imageStep('w3', [5]), message('m3', '#4 和 #5')],
      false,
    )
    expect([...(byMessage.get('m3')?.keys() ?? [])]).toEqual([3, 4, 5])
    expect([...named].sort()).toEqual(
      [operatorFindKey('w2', 4), operatorFindKey('w3', 5)].sort(),
    )
    // 没有 `userText` 的系统行不是一刀。
    expect(
      collectOperatorPriorFinds([
        user('u1'),
        imageStep('w1', [1]),
        {
          kind: 'system',
          id: 's1',
          code: 'videoFramesFailed',
        } as StudioOperatorThreadEntry,
        user('u2'),
      ]).map((find) => find.n),
    ).toEqual([1])
  })

  it('⛔ 还在跑的、没编号的不带', () => {
    const entries = [
      user('u1'),
      imageStep('running', [], 'running'),
      {
        ...imageStep('legacy', [1]),
        step: {
          ...(imageStep('legacy', [1]) as { step: Record<string, unknown> })
            .step,
          result: {
            totalFound: 1,
            images: [
              {
                imageUrl: 'https://a.test/legacy.jpg',
                usableAsInput: true,
                sourceVerdict: 'allowed',
              },
            ],
          },
        },
      } as unknown as StudioOperatorThreadEntry,
      user('u2'),
    ]
    expect(collectOperatorPriorFinds(entries)).toEqual([])
  })

  it('⭐ 每段回复认这一轮 + 上一轮的号；最后一段说完的回复点名的那几张常驻黑框', () => {
    const entries = [
      user('u1'),
      imageStep('w1', [1, 2]),
      message('m1', '#2 最像，#9 不存在'),
      user('u2'),
      imageStep('w2', [3]),
      message('m2a', '再找一张'),
      message('m2b', '我觉得#1和#3都行'),
      user('u3'),
      message('m3', '#3'),
    ]
    const { byMessage, named } = collectOperatorFindRefs(entries, false)
    expect([...(byMessage.get('m1')?.keys() ?? [])]).toEqual([1, 2])
    expect([...(byMessage.get('m2b')?.keys() ?? [])]).toEqual([1, 2, 3])
    expect(byMessage.get('m2b')?.get(1)).toMatchObject({
      key: operatorFindKey('w1', 1),
      kind: 'image',
      label: 'pic 1',
    })
    // 第三轮：上一轮的 #3 还认；更早那一轮的 #1 / #2 已经不认了。
    expect([...(byMessage.get('m3')?.keys() ?? [])]).toEqual([3])
    expect([...named].sort()).toEqual(
      [
        operatorFindKey('w1', 2),
        operatorFindKey('w1', 1),
        operatorFindKey('w2', 3),
      ].sort(),
    )
    // 「再找一张」那一段不是最后一段：它点的号（没有）不算。
    expect(named.has(operatorFindKey('w1', 9))).toBe(false)
  })

  it('还在跑的那一轮先不圈；还在写的那段不算最后一段', () => {
    const entries = [
      user('u1'),
      imageStep('w1', [1, 2]),
      message('m1', '#1 不错'),
      message('m2', '#2', true),
    ]
    expect(collectOperatorFindRefs(entries, true).named.size).toBe(0)
    expect([...collectOperatorFindRefs(entries, false).named]).toEqual([
      operatorFindKey('w1', 1),
    ])
  })

  it('同一个号在新一轮里重来时以这一轮的为准', () => {
    const entries = [
      user('u1'),
      imageStep('w1', [1]),
      message('m1', 'ok'),
      user('u2'),
      imageStep('w2', [1]),
      message('m2', '#1'),
    ]
    const { byMessage, named } = collectOperatorFindRefs(entries, false)
    expect(byMessage.get('m2')?.get(1)?.key).toBe(operatorFindKey('w2', 1))
    expect([...named]).toEqual([operatorFindKey('w2', 1)])
  })

  it('webFindNumbersIn：去重、按出场顺序', () => {
    expect(webFindNumbersIn('#3、#1 和 #3')).toEqual([3, 1])
  })
})

describe('operatorThoughtSteps（10-27 足迹）', () => {
  it('独占一行的加粗小标题一个一步，正文取第一句；正文里的加粗不算', () => {
    expect(
      operatorThoughtSteps(
        '**Understanding the request**\nThe user wants **portrait**. Nothing else.\n\n**Planning the edit**\nOne edit',
      ),
    ).toEqual([
      { title: 'Understanding the request', line: 'The user wants portrait.' },
      { title: 'Planning the edit', line: 'One edit' },
    ])
  })

  it('没有小标题：按空行分段，标题取每段第一句', () => {
    expect(
      operatorThoughtSteps('先看台上的比例。再决定。\n\n只改画幅就够了'),
    ).toEqual([
      { title: '先看台上的比例。', line: '' },
      { title: '只改画幅就够了', line: '' },
    ])
  })

  it('还没写完的小标题行也算一步', () => {
    expect(operatorThoughtSteps('**Checking')).toEqual([])
    expect(operatorThoughtSteps('**Checking the bench**')).toEqual([
      { title: 'Checking the bench', line: '' },
    ])
  })
})
