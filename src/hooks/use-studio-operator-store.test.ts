import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_FIELD_IDS } from '@/constants/studio-assistant-operator'
import type { AssistantOperatorAppliedStep } from '@/types/assistant-operator'

/**
 * ⚠ 这个 store 是**模块级单例**（工作台本身是单例，两棵组件树共读一份）。
 * 用例之间必须换一份新的模块实例，否则前一个用例的线程会漏到下一个 ——
 * `vi.resetModules()` + 动态 import 是唯一真的能做到这件事的写法，顶层 import
 * 拿到的永远是同一份。
 */
type Store = typeof import('@/hooks/use-studio-operator-store')

let store: Store

beforeEach(async () => {
  vi.resetModules()
  store = await import('@/hooks/use-studio-operator-store')
})

function readState() {
  return renderHook(() => store.useStudioOperatorState()).result
}

const RUNNING: AssistantOperatorAppliedStep = {
  id: 'step-1',
  title: '换模型',
  status: 'running',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  payload: { modelId: 'gpt-image-2' },
  inverse: { modelId: null },
}

const DONE: AssistantOperatorAppliedStep = { ...RUNNING, status: 'done' }

/** 一轮的 token —— 服务端的步号每轮从 `step-1` 重来，线程侧的 key 必须带上它。 */
const RUN = 'run-1'

describe('日志条按 id 覆盖', () => {
  it('同一步的 running 与 done 只留一条 —— 追加的表现是每步在日志里重复两行', () => {
    const result = readState()
    act(() => store.upsertOperatorStep(RUNNING, RUN))
    act(() => store.upsertOperatorStep(DONE, RUN))

    expect(result.current.entries).toHaveLength(1)
    const entry = result.current.entries[0]
    expect(entry.kind).toBe('step')
    if (entry.kind === 'step') expect(entry.step.status).toBe('done')
  })

  it('「跑完几步」只数 done 那一次 —— running 也数会一步顶两步', () => {
    const result = readState()
    act(() => store.upsertOperatorStep(RUNNING, RUN))
    expect(result.current.stepsDone).toBe(0)
    act(() => store.upsertOperatorStep(DONE, RUN))
    expect(result.current.stepsDone).toBe(1)
    // 同一条再来一次（重发时的幂等）不该把数字顶上去
    act(() => store.upsertOperatorStep(DONE, RUN))
    expect(result.current.stepsDone).toBe(1)
  })

  it('撤销标记跨越同一步的再次 upsert 不丢', () => {
    const result = readState()
    act(() => store.upsertOperatorStep(DONE, RUN))
    act(() => store.markOperatorStepUndone(`${RUN}:step-1`))
    act(() => store.upsertOperatorStep(DONE, RUN))

    const entry = result.current.entries[0]
    expect(entry.kind === 'step' && entry.undone).toBe(true)
  })

  /**
   * ⚠ 2026-08-30 真机实测抓到的：服务端每轮都从 `step-1` 重新编号，而线程是跨轮
   * 累积的。以 `step.id` 当线程 key 的表现是第二轮把第一轮那条**原地顶掉**，并且
   * 继承它的 `undone` —— 新改动一落地就带划线、也不计入改动数。
   */
  it('两轮各自的 step-1 是两条日志，且不继承上一轮的撤销标记', () => {
    const result = readState()
    act(() => store.upsertOperatorStep(DONE, 'run-1'))
    act(() => store.markOperatorStepUndone('run-1:step-1'))
    act(() => store.upsertOperatorStep(DONE, 'run-2'))

    expect(result.current.entries).toHaveLength(2)
    const [first, second] = result.current.entries
    expect(first.kind === 'step' && first.undone).toBe(true)
    expect(second.kind === 'step' && second.undone).toBe(false)
    expect(second.id).toBe('run-2:step-1')
    expect(result.current.stepsDone).toBe(2)
  })
})

describe('改动登记簿', () => {
  const first: AssistantOperatorAppliedStep = {
    id: 'step-1',
    title: '写提示词',
    status: 'done',
    tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
    payload: { value: '第一版', mode: 'replace' },
    inverse: { value: '用户手写的原文' },
  }
  const second: AssistantOperatorAppliedStep = {
    ...first,
    id: 'step-2',
    payload: { value: '第二版', mode: 'replace' },
    inverse: { value: '第一版' },
  }

  it('同一字段第二次被改时保留**最早那次**的 inverse 与原值', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: first.id,
        firstInverse: first,
        previousLabel: '用户手写的原文',
      }),
    )
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: second.id,
        reason: '按你后来说的调了',
        firstInverse: second,
        previousLabel: '第一版',
      }),
    )

    // ⭐ 只留最近一次的 inverse，撤销会停在助手的中间版本上 —— 用户以为撤了，
    //    其实只回到助手的第一版。
    expect(result.current.changes.prompt).toMatchObject({
      stepId: 'step-2',
      reason: '按你后来说的调了',
      previousLabel: '用户手写的原文',
    })
    expect(result.current.changes.prompt?.firstInverse.id).toBe('step-1')
  })

  it('清掉全部改动时顺手把生成键熄灭（拍板 14）', () => {
    const result = readState()
    act(() => store.setOperatorPrimed(true))
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: first.id,
        firstInverse: first,
        previousLabel: '',
      }),
    )
    expect(result.current.primed).toBe(true)

    act(() => store.clearOperatorChanges())
    expect(result.current.changes).toEqual({})
    expect(result.current.primed).toBe(false)
  })
})

describe('新对话', () => {
  it('只清线程 —— 登记簿与 primed 留着，否则 ✦ 还在但点了没反应', () => {
    const result = readState()
    act(() => store.setOperatorPrimed(true))
    act(() => store.upsertOperatorStep(DONE, RUN))
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.model,
        stepId: DONE.id,
        firstInverse: DONE,
        previousLabel: '',
      }),
    )

    act(() => store.resetOperatorThread())

    expect(result.current.entries).toHaveLength(0)
    expect(result.current.stepsDone).toBe(0)
    expect(result.current.changes.model).toBeDefined()
    expect(result.current.primed).toBe(true)
  })
})

describe('续跑注册口', () => {
  it('注册与注销 —— 就地确认条在参数栏，续跑的能力在面板', () => {
    const resume = vi.fn()
    store.registerOperatorRunner({ resume })
    store.getOperatorRunner()?.resume('append')
    expect(resume).toHaveBeenCalledWith('append')

    store.registerOperatorRunner(null)
    expect(store.getOperatorRunner()).toBeNull()
  })
})

// ── 跨域（P4-A，拍板 8：切域换工具、不断会话）────────────────────────
describe('切域', () => {
  it('线程连续 —— 域标记插在原地，之前的条目一条都不掉', () => {
    const result = readState()
    act(() =>
      store.appendOperatorEntry({
        kind: 'user',
        id: 'user-1',
        text: '帮我配一张海报',
        attachments: [],
      }),
    )

    act(() => store.switchOperatorDomain('video'))

    expect(result.current.domain).toBe('video')
    expect(result.current.entries.map((entry) => entry.kind)).toEqual([
      'user',
      'domainMark',
    ])
    expect(result.current.entries.at(-1)).toMatchObject({
      kind: 'domainMark',
      domain: 'video',
    })
  })

  it('线程还空着时不插标记 —— 一条孤零零的「切到视频工作台」说的是还没发生的事', () => {
    const result = readState()
    act(() => store.switchOperatorDomain('video'))
    expect(result.current.domain).toBe('video')
    expect(result.current.entries).toHaveLength(0)
  })

  it('域没变时整个是 no-op（⛔ 不白发一次全面板重渲染）', () => {
    const result = readState()
    const before = result.current
    act(() => store.switchOperatorDomain('image'))
    expect(result.current).toBe(before)
  })

  it('⭐ 改动账本按域分槽：视频域改的东西不顶掉图片域的登记', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'image-step',
        firstInverse: DONE,
        previousLabel: '图片域原文',
      }),
    )

    act(() => store.switchOperatorDomain('video'))
    // 切过去那一刻是干净的 —— 视频域助手还没动过任何东西。
    expect(result.current.changes).toEqual({})

    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'video-step',
        firstInverse: DONE,
        previousLabel: '视频域原文',
      }),
    )
    expect(result.current.changes.prompt?.stepId).toBe('video-step')

    // ⭐ 切回去：图片域那笔账原样还在（⛔ 不是被视频那笔顶掉的版本）。
    act(() => store.switchOperatorDomain('image'))
    expect(result.current.changes.prompt).toMatchObject({
      stepId: 'image-step',
      previousLabel: '图片域原文',
    })
  })

  it('⭐ primed 按域分槽：图片域备好的那一枪不会把视频档的生成键点亮', () => {
    const result = readState()
    act(() => store.setOperatorPrimed(true))
    expect(result.current.primed).toBe(true)

    act(() => store.switchOperatorDomain('video'))
    expect(result.current.primed).toBe(false)

    act(() => store.switchOperatorDomain('image'))
    // 切走时不消失 —— 那份表单还预填着，生成键该继续亮。
    expect(result.current.primed).toBe(true)
  })

  it('就地确认条也按域分槽 —— 问的是图片档的提示词，条子不该出现在视频档', () => {
    const result = readState()
    act(() =>
      store.setOperatorConfirm({
        field: 'prompt',
        have: '用户手写的原文',
        proposed: '助手想写的',
      }),
    )
    act(() => store.switchOperatorDomain('video'))
    expect(result.current.confirm).toBeNull()

    act(() => store.switchOperatorDomain('image'))
    expect(result.current.confirm).toMatchObject({ field: 'prompt' })
  })

  it('清掉全部改动只清当前域 —— ⛔ 别把用户切回去要用的那份一起清了', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'image-step',
        firstInverse: DONE,
        previousLabel: '',
      }),
    )
    act(() => store.switchOperatorDomain('video'))
    act(() => store.clearOperatorChanges())

    act(() => store.switchOperatorDomain('image'))
    expect(result.current.changes.prompt?.stepId).toBe('image-step')
  })
})

/**
 * 会话历史（P4-B）在 store 里的三条硬规矩。
 *
 * ⭐ 「载入历史不碰表单」与「新对话要清会话身份」是一对：前者漏了会让用户
 * 「翻一眼历史，✦ 标记全没了」，后者漏了会让「新对话」之后的第一次保存写进
 * **上一条会话那一行** —— 库里永远只有一条，而那要读库才发现得了。
 */
describe('会话历史 · 载入与新对话', () => {
  const HISTORY = [
    {
      kind: 'user' as const,
      id: 'u1',
      text: '上次说到一半',
      attachments: [],
    },
  ]

  it('载入历史**不碰**登记簿与 primed —— 表单上的改动是另一件事', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'step-a',
        firstInverse: DONE,
        previousLabel: '原来的',
      }),
    )
    act(() => store.setOperatorPrimed(true))

    act(() =>
      store.loadOperatorThread({
        history: HISTORY,
        sessionId: 'conv-1',
        sessionSurface: 'IMAGE_STUDIO',
      }),
    )

    expect(result.current.history).toEqual(HISTORY)
    expect(result.current.entries).toEqual([])
    expect(result.current.sessionId).toBe('conv-1')
    // ⭐ 这两条是「载入历史 ≠ 交还控制权」的反面：改动与 primed 属于表单此刻。
    expect(result.current.changes.prompt?.stepId).toBe('step-a')
    expect(result.current.primed).toBe(true)
  })

  it('新对话把历史与会话身份一起清掉 —— 否则下一次保存会覆盖上一条会话', () => {
    const result = readState()
    act(() =>
      store.loadOperatorThread({
        history: HISTORY,
        sessionId: 'conv-1',
        sessionSurface: 'IMAGE_STUDIO',
      }),
    )
    act(() => store.resetOperatorThread())

    expect(result.current.history).toEqual([])
    expect(result.current.sessionId).toBeNull()
    expect(result.current.sessionSurface).toBeNull()
  })

  it('新对话仍然**不清**登记簿 —— 撤销的本钱留着（P2 那条规矩没变）', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'step-a',
        firstInverse: DONE,
        previousLabel: '原来的',
      }),
    )
    act(() => store.resetOperatorThread())
    expect(result.current.changes.prompt?.stepId).toBe('step-a')
  })
})

/**
 * 画布一格（C1-pre，任务书 §三）：store 按域分槽，画布只是多一格 —— 与图片 /
 * 视频 / LoRA 同一套规矩（切过去是干净的，切回来原样还在）。
 */
describe('画布一格', () => {
  it('切到画布是干净的一槽；画布上备好的那一枪不会点亮图片档的生成键', () => {
    const result = readState()
    act(() =>
      store.recordOperatorChange({
        field: STUDIO_OPERATOR_FIELD_IDS.prompt,
        stepId: 'image-step',
        firstInverse: DONE,
        previousLabel: '图片域原文',
      }),
    )
    act(() => store.setOperatorPrimed(true))

    act(() => store.switchOperatorDomain('canvas'))
    expect(result.current.domain).toBe('canvas')
    expect(result.current.changes).toEqual({})
    expect(result.current.primed).toBe(false)
    expect(result.current.confirm).toBeNull()

    act(() => store.setOperatorPrimed(true))
    act(() => store.switchOperatorDomain('image'))
    // 图片域那笔账与那一枪原样还在，⛔ 没被画布那一槽顶掉。
    expect(result.current.changes.prompt?.stepId).toBe('image-step')
    expect(result.current.primed).toBe(true)

    // 再切回画布：它自己那一枪也还在。
    act(() => store.switchOperatorDomain('canvas'))
    expect(result.current.primed).toBe(true)
    expect(result.current.changes).toEqual({})
  })
})

describe('反问卡（C3）', () => {
  function appendAsk(askId = 'ask-1') {
    act(() =>
      store.appendOperatorEntry({
        kind: 'ask',
        id: store.nextOperatorEntryId('ask'),
        askId,
        question: '这一镜要几秒？',
        options: [{ label: '5 秒', consequence: '一个动作，节奏紧' }],
      }),
    )
  }

  it('回答落在条目上（那排按钮点过之后要变成「已选：××」）', () => {
    const result = readState()
    appendAsk()
    act(() => store.markOperatorAskAnswered('ask-1', '10 秒'))
    const entry = result.current.entries[0]
    expect(entry.kind === 'ask' && entry.answer).toBe('10 秒')
  })

  it('⚠ 已经答过的不再覆盖 —— 第二下是误触，覆盖会让线程与真发出去的消息对不上', () => {
    const result = readState()
    appendAsk()
    act(() => store.markOperatorAskAnswered('ask-1', '10 秒'))
    act(() => store.markOperatorAskAnswered('ask-1', '5 秒'))
    const entry = result.current.entries[0]
    expect(entry.kind === 'ask' && entry.answer).toBe('10 秒')
  })

  it('askId 对不上就整个不动（⛔ 不猜是哪一问）', () => {
    const result = readState()
    appendAsk()
    act(() => store.markOperatorAskAnswered('ask-9', '10 秒'))
    const entry = result.current.entries[0]
    expect(entry.kind === 'ask' && entry.answer).toBeUndefined()
  })
})

describe('剧本投影确认门（C3）', () => {
  it('挂起 / 读回 / 收掉；⛔ 不进 state（它装着两个闭包，进 state 就是每次挂载一次全面板重渲染）', () => {
    const result = readState()
    const gate = {
      title: '雨夜',
      created: 3,
      updated: 1,
      removed: 2,
      removedEdges: 1,
      confirm: () => {},
      cancel: () => {},
    }
    store.setOperatorScriptDocProjection(gate)
    expect(store.getOperatorScriptDocProjection()).toBe(gate)
    expect(JSON.stringify(result.current)).not.toContain('雨夜')

    store.setOperatorScriptDocProjection(null)
    expect(store.getOperatorScriptDocProjection()).toBeNull()
  })

  it('订阅口在挂起与收掉时各通知一次', () => {
    const seen: (string | null)[] = []
    const unsubscribe = store.subscribeOperatorScriptDocProjection(() => {
      seen.push(store.getOperatorScriptDocProjection()?.title ?? null)
    })
    store.setOperatorScriptDocProjection({
      title: '雨夜',
      created: 1,
      updated: 0,
      removed: 0,
      removedEdges: 0,
      confirm: () => {},
      cancel: () => {},
    })
    store.setOperatorScriptDocProjection(null)
    unsubscribe()
    store.setOperatorScriptDocProjection(null)
    expect(seen).toEqual(['雨夜', null])
  })
})
