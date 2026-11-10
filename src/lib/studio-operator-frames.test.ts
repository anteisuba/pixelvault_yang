import { describe, expect, it } from 'vitest'

import type {
  AssistantOperatorBenchOpen,
  AssistantOperatorEvent,
  AssistantOperatorRoundSummary,
  AssistantOperatorStep,
} from '@/types/assistant-operator'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'
import type { StudioOperatorResumePlan } from '@/types/studio-operator-resume'
import {
  canvasBatchFailureDetail,
  deltaStartsNewMessage,
  finalMessagePlan,
  resumeMarkFor,
  resumeStepIdFor,
  stoppedOutcome,
  thinkingStartsNewMessage,
} from '@/lib/studio-operator-frames'

const message = (
  id: string,
  text: string,
  streaming?: boolean,
): StudioOperatorThreadEntry => ({
  kind: 'message',
  id,
  text,
  ...(streaming !== undefined ? { streaming } : {}),
})

/** 压在正文下面的随便一条（工具步、联网那一步……这里用一条用户消息代替）。 */
const below: StudioOperatorThreadEntry = {
  kind: 'user',
  id: 'u-1',
  text: '接着说',
  attachments: [],
}

type StoppedEvent = Extract<AssistantOperatorEvent, { type: 'stopped' }>
const stopped = (
  reason: StoppedEvent['reason'],
  extra: Partial<StoppedEvent> = {},
): StoppedEvent => ({ type: 'stopped', reason, ...extra })

const base = {
  onCanvas: false,
  canvasChanged: false,
  hasTranscript: false,
  status: 'working' as const,
}

describe('正文增量：写回此刻那条还是另起一条', () => {
  it('那条还没出现 / 还在线程末尾 → 写回它', () => {
    expect(deltaStartsNewMessage([], 'm-0', false)).toBe(false)
    expect(
      deltaStartsNewMessage([message('m-0', '我', true)], 'm-0', false),
    ).toBe(false)
  })

  it('⭐ 已经被别的条目压在下面 → 另起一条（2026-09-30 旁白 + 收尾重复那一次）', () => {
    expect(
      deltaStartsNewMessage(
        [message('m-0', '我查一下', true), below],
        'm-0',
        false,
      ),
    ).toBe(true)
  })

  it('restart：还在流的旧稿就地换掉，已经定稿的那段另起一条', () => {
    expect(
      deltaStartsNewMessage([message('m-0', '旧稿', true)], 'm-0', true),
    ).toBe(false)
    expect(deltaStartsNewMessage([message('m-0', '定稿')], 'm-0', true)).toBe(
      true,
    )
    expect(deltaStartsNewMessage([message('m-0', '定稿')], 'm-0', false)).toBe(
      false,
    )
  })
})

describe('思考帧：写进此刻那条占位行还是另起一条', () => {
  it('那条还没出现 / 还在流 → 写进它', () => {
    expect(thinkingStartsNewMessage([], 'm-0')).toBe(false)
    expect(thinkingStartsNewMessage([message('m-0', '', true)], 'm-0')).toBe(
      false,
    )
  })

  it('已经收成回执，或被压在下面 → 另起一条', () => {
    expect(thinkingStartsNewMessage([message('m-0', '答完了')], 'm-0')).toBe(
      true,
    )
    expect(
      thinkingStartsNewMessage([message('m-0', '', true), below], 'm-0'),
    ).toBe(true)
  })
})

describe('定稿帧写进哪几条', () => {
  it('⭐ 增量已经把这一段写全（中间被联网那一步隔成两条）→ 就地定稿那几条，⛔ 不另起', () => {
    const entries = [
      message('m-0', '先说一句。', true),
      below,
      message('m-1', '查到了。 ', true),
    ]
    expect(
      finalMessagePlan(entries, ['m-0', 'm-1'], 'm-1', '先说一句。查到了。'),
    ).toEqual({
      kind: 'streamed',
      entries: [
        { id: 'm-0', text: '先说一句。' },
        { id: 'm-1', text: '查到了。' },
      ],
    })
  })

  it('拼不上（增量丢了 / 改写过）→ 写此刻那一条；它被压在下面就先进一位', () => {
    const entries = [message('m-0', '半句', true), below]
    expect(finalMessagePlan(entries, ['m-0'], 'm-0', '完全不同的一段')).toEqual(
      {
        kind: 'single',
        startsNew: true,
      },
    )
    expect(
      finalMessagePlan([message('m-0', '半句', true)], ['m-0'], 'm-0', '整段'),
    ).toEqual({ kind: 'single', startsNew: false })
  })

  it('这一次调用没有增量（回放、老内核）→ 直接写此刻那一条', () => {
    expect(finalMessagePlan([], [], 'm-0', '你好')).toEqual({
      kind: 'single',
      startsNew: false,
    })
  })
})

describe('stopped 帧落成什么', () => {
  const summary = {
    roundIndex: 0,
    createdAt: '2026-11-10T00:00:00.000Z',
    facts: ['挂上了两张参考'],
    decisions: [],
    todos: [],
  } as unknown as AssistantOperatorRoundSummary

  it('开台：交给那个台', () => {
    const open = {
      workspace: 'image-natural',
    } as unknown as AssistantOperatorBenchOpen
    expect(stoppedOutcome(stopped('bench_open', { open }), base)).toEqual({
      kind: 'benchOpen',
      open,
    })
  })

  it('画布同步：落了改动或是新内核就接力，什么都没落的旧内核不接', () => {
    const onCanvas = { ...base, onCanvas: true }
    expect(stoppedOutcome(stopped('canvas_sync'), onCanvas)).toEqual({
      kind: 'relay',
      relay: false,
    })
    expect(
      stoppedOutcome(stopped('canvas_sync'), {
        ...onCanvas,
        canvasChanged: true,
      }),
    ).toEqual({ kind: 'relay', relay: true })
    expect(
      stoppedOutcome(stopped('canvas_sync'), {
        ...onCanvas,
        hasTranscript: true,
      }),
    ).toEqual({ kind: 'relay', relay: true })
  })

  it('时间用到头：画布与新内核接力；别的台收尾并亮「继续」', () => {
    expect(
      stoppedOutcome(stopped('time_budget'), { ...base, onCanvas: true }),
    ).toEqual({ kind: 'relay', relay: true })
    expect(
      stoppedOutcome(stopped('time_budget'), { ...base, hasTranscript: true }),
    ).toEqual({ kind: 'relay', relay: true })
    expect(stoppedOutcome(stopped('time_budget'), base)).toEqual({
      kind: 'settle',
      outOfSteps: true,
      roundSummary: null,
      status: 'idle',
    })
  })

  it('停在确认卡上：带结论块、状态进 awaitingConfirm', () => {
    expect(
      stoppedOutcome(
        stopped('awaiting_confirm', { roundSummary: summary }),
        base,
      ),
    ).toEqual({
      kind: 'settle',
      outOfSteps: false,
      roundSummary: summary,
      status: 'awaitingConfirm',
    })
  })

  it('⛔ awaitingPlan 不被这一帧降级成「待确认」', () => {
    expect(
      stoppedOutcome(stopped('awaiting_confirm'), {
        ...base,
        status: 'awaitingPlan',
      }),
    ).toMatchObject({ kind: 'settle', status: null })
  })

  it('用量到上限：亮「继续」，状态回 idle', () => {
    expect(stoppedOutcome(stopped('token_budget'), base)).toEqual({
      kind: 'settle',
      outOfSteps: true,
      roundSummary: null,
      status: 'idle',
    })
  })
})

describe('一步落在续跑记录的哪一格、记什么（拆前端第 3 片）', () => {
  const plan = (
    ...steps: [label: string, state: 'pending' | 'done' | 'failed'][]
  ) =>
    ({
      planId: 'plan-1',
      domain: 'image',
      steps: steps.map(([label, state], index) => ({
        id: `p-${index + 1}`,
        label,
        state,
      })),
    }) as unknown as StudioOperatorResumePlan

  it('同名且唯一的那一格优先；对不上名字才取第一个还没结论的', () => {
    const resume = plan(
      ['写提示词', 'done'],
      ['连接参考图', 'failed'],
      ['设定模型', 'pending'],
    )
    // 重做已经完成的那一项：⛔ 勾掉后面失败的那一项。
    expect(resumeStepIdFor(resume, '写提示词')).toBe('p-1')
    expect(resumeStepIdFor(resume, '别的事')).toBe('p-2')
    expect(resumeStepIdFor(null, '写提示词')).toBeNull()
  })

  it('同名的有两格：不猜，取第一个还没结论的', () => {
    const resume = plan(['改图', 'done'], ['改图', 'pending'])
    expect(resumeStepIdFor(resume, '改图')).toBe('p-2')
  })

  const step = (fields: Record<string, unknown>) =>
    ({
      id: 'step-1',
      title: '写提示词',
      tool: 'set_prompt',
      verb: 'set',
      ...fields,
    }) as unknown as AssistantOperatorStep

  it('在跑的不记；被拒记拒绝理由码；跳过的（重复步 / 时间到被掐 / 草稿）不占一格', () => {
    expect(resumeMarkFor(step({ status: 'running' }))).toBeNull()
    expect(
      resumeMarkFor(
        step({
          status: 'error',
          error: { reason: 'noSuchControl', detail: 'x' },
        }),
      ),
    ).toEqual({ state: 'failed', reason: 'noSuchControl' })
    expect(
      resumeMarkFor(
        step({ status: 'error', error: { reason: 'repeatedStep' } }),
      ),
    ).toBeNull()
    expect(
      resumeMarkFor(step({ status: 'error', error: { reason: 'timeBudget' } })),
    ).toBeNull()
    expect(
      resumeMarkFor(
        step({
          status: 'error',
          draft: true,
          error: { reason: 'noSuchControl' },
        }),
      ),
    ).toBeNull()
  })

  it('做成的记 done，带这一步的产物 id', () => {
    expect(
      resumeMarkFor(
        step({
          status: 'done',
          payload: { text: 'a cat', mode: 'replace' },
          inverse: { text: '' },
        }),
      ),
    ).toEqual({ state: 'done', artifactIds: [] })
  })

  it('一批画布改动只落了一部分：写清几条落了、哪几条没落、为什么', () => {
    expect(
      canvasBatchFailureDetail(
        [{ op: 'add_node' }, { op: 'connect' }, { op: 'set_prompt' }],
        [{ index: 1, reason: 'slot full' }],
      ),
    ).toBe('2 of 3 landed. Not landed: ops[1] connect — slot full')
  })
})
