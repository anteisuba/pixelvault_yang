import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'
import type {
  AssistantOperatorEvent,
  AssistantOperatorPlanRequestEvent,
} from '@/types/assistant-operator'

/**
 * 一步**跑完了**的 step 事件 —— 排队的接住点就取在这里（§3.1 ㉓）。
 *
 * ⚠ 用 `read_state`（读类工具）：它没有 op，`applyOperatorStep` 什么都不会写，
 * 于是这份用例验的纯粹是「状态机在边界上怎么走」，⛔ 不会被表单侧的桩牵连。
 */
function doneStepEvent(id: string): AssistantOperatorEvent {
  return {
    type: ASSISTANT_OPERATOR_EVENTS.step,
    step: {
      id,
      title: '读了一眼当前状态',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.readState,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      payload: {},
      result: { digest: 'prompt: 海报' },
    },
  }
}

/**
 * 驱动 hook 的**四条收尾路径**（跑完 / 插话 / ⏹ / 真错误）。
 *
 * ⭐ 这份用例的由来：`abort` 不是从 `for await` 里 `break` 出来的，而是**穿透**
 * 它抛出来的 —— 底下那个 `reader.read()` 以 `AbortError` 拒绝。于是插话时旧循环
 * 的 catch 会在新一轮已经置 `working` 之后把状态改成 `error`，而收尾那句只在
 * `working` 时归 idle，错误态就永久挂在胶囊上。桩流必须**照着这条链拒绝**，
 * ⛔ 别桩成「abort 之后干脆利落地 done」—— 那样桩出来的流永远测不到这个 bug。
 */

const streamAssistantOperatorAPI = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client/assistant-operator', () => ({
  streamAssistantOperatorAPI,
}))

/**
 * 词表桩回键名 —— 错误文案映射（bug 5）那几条断言按键名读。
 * ⚠ `has` 必须在：`getGenerationErrorMessage` 收的是带 `.has()` 的翻译器
 *   （`lib/api-error-message.ts` 的 `ErrorTranslator`）。这里一律答「没有这个键」，
 *   于是 provider 那一档自然落到「原文」，正好是本文件要验的两条边界。
 */
vi.mock('next-intl', () => {
  const t = Object.assign((key: string) => `i18n:${key}`, {
    has: () => false,
  })
  return { useLocale: () => 'zh', useTranslations: () => t }
})

/**
 * 落笔的那几只手由宿主给（P4-C）。这一层验的是「状态机怎么收尾」，
 * 表单侧一个都不需要真的动，所以整份桩成空手。
 */
const triggerGeneration = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: 'image' as const,
    buildSnapshot: () => ({ prompt: '', availableModels: [] }),
    results: [],
    referenceLimit: 4,
    open: true,
    setOpen: () => {},
    apply: {
      triggerGeneration,
      getState: () => ({ prompt: '', advancedParams: {} }),
      dispatch: () => {},
      resolveOptionId: () => null,
      addReference: () => {},
      removeReference: () => {},
      addAudioReference: () => {},
      removeAudioReference: () => {},
      setSound: () => {},
      mountUserUrl: () => {},
      unmountUserUrl: () => {},
      setPrimed: () => {},
    },
  }),
}))

// ── 可控的假流 ──────────────────────────────────────────────────────

type Settle =
  | { kind: 'value'; value: AssistantOperatorEvent }
  | { kind: 'done' }
  | { kind: 'error'; error: unknown }

interface FakeStream {
  readonly events: AsyncIterable<AssistantOperatorEvent>
  emit(event: AssistantOperatorEvent): void
  close(): void
  fail(error: unknown): void
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/**
 * 一条「一次推一个事件」的异步可迭代。
 *
 * ⚠ 关键在 `signal` 那一挂：abort 时**拒绝**正在等的那个 `next()`，
 * 而不是把它 resolve 成 `done` —— 真实那条链就是这么断的（见文件头注）。
 */
function createFakeStream(signal?: AbortSignal): FakeStream {
  const buffer: Settle[] = []
  let waiting: {
    resolve(result: IteratorResult<AssistantOperatorEvent>): void
    reject(reason: unknown): void
  } | null = null

  function deliver(settle: Settle): void {
    const pending = waiting
    if (!pending) {
      buffer.push(settle)
      return
    }
    waiting = null
    if (settle.kind === 'value') {
      pending.resolve({ done: false, value: settle.value })
      return
    }
    if (settle.kind === 'done') {
      pending.resolve({ done: true, value: undefined })
      return
    }
    pending.reject(settle.error)
  }

  signal?.addEventListener('abort', () => {
    deliver({ kind: 'error', error: abortError() })
  })

  const events: AsyncIterable<AssistantOperatorEvent> = {
    [Symbol.asyncIterator]: () => ({
      next(): Promise<IteratorResult<AssistantOperatorEvent>> {
        const queued = buffer.shift()
        if (queued) {
          if (queued.kind === 'value') {
            return Promise.resolve({ done: false, value: queued.value })
          }
          if (queued.kind === 'done') {
            return Promise.resolve({ done: true, value: undefined })
          }
          return Promise.reject(queued.error)
        }
        if (signal?.aborted) return Promise.reject(abortError())
        return new Promise((resolve, reject) => {
          waiting = { resolve, reject }
        })
      },
    }),
  }

  return {
    events,
    emit: (value) => deliver({ kind: 'value', value }),
    close: () => deliver({ kind: 'done' }),
    fail: (error) => deliver({ kind: 'error', error }),
  }
}

/**
 * ⚠ store 是**模块级单例**，用例之间必须换新的一份，而 hook 也要在同一次
 * reset 之后 import —— 顶层 import 拿到的是同一份（照抄 store 用例的头注）。
 */
type Store = typeof import('@/hooks/use-studio-operator-store')
type Operator = typeof import('@/hooks/use-assistant-operator')

let store: Store
let operator: Operator
const streams: FakeStream[] = []

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  streams.length = 0
  streamAssistantOperatorAPI.mockImplementation(
    (_request: unknown, options: { signal?: AbortSignal } = {}) => {
      const stream = createFakeStream(options.signal)
      streams.push(stream)
      return Promise.resolve({ success: true, events: stream.events })
    },
  )
  store = await import('@/hooks/use-studio-operator-store')
  operator = await import('@/hooks/use-assistant-operator')
})

/** 把在飞的微任务全放完 —— 流的每一步都隔着一个 `await`。 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

function render() {
  return renderHook(() => operator.useAssistantOperator())
}

describe('useAssistantOperator 的四条收尾路径', () => {
  it('a) 正常跑完 → idle，不留错误文案', async () => {
    const { result } = render()

    act(() => {
      result.current.send('画一张海报')
    })
    await settle()
    expect(streams).toHaveLength(1)
    expect(store.getOperatorState().status).toBe('working')

    streams[0].emit({ type: ASSISTANT_OPERATOR_EVENTS.message, text: '好' })
    await settle()
    streams[0].close()
    await settle()

    expect(store.getOperatorState().status).toBe('idle')
    expect(store.getOperatorState().errorText).toBeNull()
  })

  it('b) 干活时插话 → **排队**（不掐掉在飞的那一轮），到下一个工具步边界才接住', async () => {
    const { result } = render()

    act(() => {
      result.current.send('画一张海报')
    })
    await settle()
    expect(streams).toHaveLength(1)

    act(() => {
      result.current.send('等一下，比例改成 3:4')
    })
    await settle()

    /**
     * ⭐ 本片的改口（§3.1 ㉒）：插话**不再** abort 重发。
     * 旧行为的代价是用户想补一句就把已经跑完的三步整个作废重跑一遍 ——
     * 他付了三步的钱，看到的是同样三步再来一次。
     */
    expect(streams).toHaveLength(1)
    expect(store.getOperatorState().queue).toHaveLength(1)
    expect(store.getOperatorState().queue[0]?.text).toBe('等一下，比例改成 3:4')
    expect(store.getOperatorState().status).toBe('working')

    // 一步跑完 = 停顿点（§3.1 ㉓）：这时才 abort + 带 priorSteps 重发。
    streams[0].emit(doneStepEvent('step-1'))
    await settle()

    expect(streams).toHaveLength(2)
    const state = store.getOperatorState()
    expect(state.queue).toHaveLength(0)
    // 线程里有交代：「停顿点 · 接住排队消息」，⛔ 不是悄悄接住。
    expect(
      state.entries.some(
        (entry) => entry.kind === 'system' && entry.code === 'queuePicked',
      ),
    ).toBe(true)
    // 排的那句真的进了对话（⛔ 不是只清了队列）。
    expect(
      state.entries.some(
        (entry) =>
          entry.kind === 'user' && entry.text === '等一下，比例改成 3:4',
      ),
    ).toBe(true)
    // 已经跑完的那一步留在线程里 —— 它进 `priorSteps`，助手不会重做。
    expect(state.entries.some((entry) => entry.kind === 'step')).toBe(true)
    // 旧流的 AbortError 不许把状态写成 error（切片 A 那条回归闸照旧成立）。
    expect(state.status).toBe('working')
    expect(state.errorText).toBeNull()

    streams[1].emit({ type: ASSISTANT_OPERATOR_EVENTS.message, text: '好' })
    streams[1].close()
    await settle()
    expect(store.getOperatorState().status).toBe('idle')
    expect(store.getOperatorState().errorText).toBeNull()
  })

  it('b′) 撤回排队的那句 → 队列清掉、⛔ 不发请求，线程里留一行交代', async () => {
    const { result } = render()

    act(() => {
      result.current.send('画一张海报')
    })
    await settle()
    act(() => {
      result.current.send('顺便配个音')
    })
    await settle()

    const queued = store.getOperatorState().queue[0]
    expect(queued).toBeTruthy()

    act(() => {
      result.current.cancelQueued(queued!.id)
    })
    await settle()

    const state = store.getOperatorState()
    expect(state.queue).toHaveLength(0)
    // ⛔ 撤回不该起新一轮。
    expect(streams).toHaveLength(1)
    expect(
      state.entries.some(
        (entry) => entry.kind === 'system' && entry.code === 'queueDropped',
      ),
    ).toBe(true)
    // ⛔ 那句话没有进对话（它从来没被发出去）。
    expect(
      state.entries.some(
        (entry) => entry.kind === 'user' && entry.text === '顺便配个音',
      ),
    ).toBe(false)

    // 撤回之后停顿点到了也不该冒出第二条流。
    streams[0].emit(doneStepEvent('step-1'))
    await settle()
    expect(streams).toHaveLength(1)
  })

  it('b″) ⏹ 把队列一起清掉 —— ⛔ 停了之后不许它自己又接着跑排队的那句', async () => {
    const { result } = render()

    act(() => {
      result.current.send('画一张海报')
    })
    await settle()
    act(() => {
      result.current.send('再来个夜景版')
    })
    await settle()
    expect(store.getOperatorState().queue).toHaveLength(1)

    act(() => {
      result.current.stop()
    })
    await settle()

    expect(store.getOperatorState().queue).toHaveLength(0)
    expect(store.getOperatorState().status).toBe('idle')
    // ⏹ 之后只该有那一条被掐掉的流。
    expect(streams).toHaveLength(1)
  })

  it('c) ⏹ → idle + 一行系统行，且计划数清零（胶囊不再挂着上一轮的 3/7）', async () => {
    const { result } = render()

    act(() => {
      result.current.send('画一张海报')
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: ['选模型', '写提示词', '备好生成键'],
    })
    await settle()
    expect(store.getOperatorState().plannedSteps).toBe(3)

    act(() => {
      result.current.stop()
    })
    // ⚠ 要放完微任务：abort 的拒绝是在**下一个微任务**里才穿透 for-await 的，
    //    停下那一刻看状态是看不见这个 bug 的。
    await settle()

    const state = store.getOperatorState()
    expect(state.status).toBe('idle')
    expect(state.errorText).toBeNull()
    expect(state.plannedSteps).toBe(0)
    expect(
      state.entries.some(
        (entry) => entry.kind === 'system' && entry.code === 'stopped',
      ),
    ).toBe(true)
  })

  it('d) 流真的炸了（不是 abort）→ error，⛔ 别被 aborted 判据一起吞掉', async () => {
    const { result } = render()

    act(() => {
      result.current.send('画一张海报')
    })
    await settle()

    streams[0].fail(new Error('stream blew up'))
    await settle()

    expect(store.getOperatorState().status).toBe('error')
  })

  it('d′) 服务端发来的 error 事件同样落到 error，并带上文案', async () => {
    const { result } = render()

    act(() => {
      result.current.send('画一张海报')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.error,
      error: '模型没回话',
    })
    await settle()

    expect(store.getOperatorState().status).toBe('error')
    // 没有 errorCode = 认不得 → 原文照用（⛔ 不吞成一句「出错了」）。
    expect(store.getOperatorState().errorText).toBe('模型没回话')
  })

  /**
   * **bug 5**（2026-09-06 真机）：zh 界面上显示的是服务端那句英文兜底
   * 「The assistant operator run failed midway.」。服务端只给码，三语文案在
   * 客户端取 —— 认得的码走词表，认不得的照原文。
   */
  it('d″) 认得的 errorCode 走词表，认不得的回退原文', async () => {
    const { result } = render()

    act(() => {
      result.current.send('画一张海报')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.error,
      error: 'The assistant operator run failed midway.',
      errorCode: 'ASSISTANT_OPERATOR_FAILED',
    })
    await settle()

    expect(store.getOperatorState().errorText).toBe('i18n:failed')
  })
})

// ─── 切片 3a：三张「等你定」的卡 + 规则薄卡 + 「不再问」──────────────

const QUESTIONS: AssistantOperatorPlanRequestEvent['questions'] = [
  {
    id: 'q1',
    header: '取景',
    question: '取多少身？',
    multiSelect: false,
    allowOther: true,
    options: [
      { id: 'half', label: '半身', description: '腰以上，脸看得清' },
      { id: 'full', label: '全身', description: '连鞋一起进画' },
    ],
  },
]

/**
 * 计划帧的最小载荷。
 * ⚠ 阶段数决定 `shouldShowPlanCard` 的最后一条判据（≥3）；⚠ **有题也一定出卡**
 * （`questions` 非空是第三条判据），所以「不该出卡」那一条用例必须显式传空题。
 */
function planRequestEvent(
  steps: number,
  reason: 'spend' | 'multi-step' | 'user-requested' = 'multi-step',
  questions: AssistantOperatorPlanRequestEvent['questions'] = QUESTIONS,
): AssistantOperatorEvent {
  return {
    type: ASSISTANT_OPERATOR_EVENTS.planRequest,
    steps: Array.from({ length: steps }, (_, index) => ({
      id: `plan-${index + 1}`,
      label: `第 ${index + 1} 步`,
    })),
    questions,
    estimate: { credits: 4, model: 'Seedream 4', count: 1 },
    reason,
  }
}

const SPEND_REQUEST = {
  model: { id: 'seedream-4', label: 'Seedream 4' },
  count: 1,
  specs: { aspectRatio: '3:4', resolution: '2K', durationSeconds: null },
  estimate: { credits: 4, model: 'Seedream 4', count: 1 },
} as const

describe('计划卡（§2.6 / §5 客户端硬判）', () => {
  it('步数 ≥ 3 → 出卡、进 awaitingPlan，并**掐掉这条流**（⛔ 不让后面的步偷偷落地）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把这张改成三步')
    })
    await settle()

    streams[0].emit(planRequestEvent(3))
    await settle()

    const state = store.getOperatorState()
    expect(state.status).toBe('awaitingPlan')
    expect(state.plan?.steps).toHaveLength(3)
    expect(state.plan?.resolved).toBe(false)
    /**
     * ⭐ 掐流是这一条最要紧的断言：不掐的话卡钉在流末尾等你确认，而它要问的那
     * 几步已经落到表单上了 —— 那张卡就成了一句事后通知。
     */
    streams[0].emit(doneStepEvent('step-1'))
    await settle()
    expect(
      store.getOperatorState().entries.some((entry) => entry.kind === 'step'),
    ).toBe(false)
  })

  it('步数不够、也不花钱、也没开「先问我」→ ⛔ 不出卡，直接接着跑', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改一下')
    })
    await settle()

    // ⚠ 显式空题：有题就一定出卡，那一条判据会盖过「步数不够」。
    streams[0].emit(planRequestEvent(2, 'multi-step', []))
    await settle()

    expect(store.getOperatorState().plan).toBeNull()
    expect(store.getOperatorState().status).toBe('working')
  })

  it('「先问我」开着 → 一步也出卡；请求带 forcePlan，且发完自动复位', async () => {
    const { result } = render()
    act(() => store.setOperatorAskFirst(true))
    act(() => {
      result.current.send('随便改一个字')
    })
    await settle()

    expect(streamAssistantOperatorAPI.mock.calls[0]?.[0].forcePlan).toBe(true)
    // ⚠ 复位发生在**请求发出去之后**，⛔ 不是在计划帧到达之后。
    expect(store.getOperatorState().askFirst).toBe(false)

    streams[0].emit(planRequestEvent(1))
    await settle()
    expect(store.getOperatorState().status).toBe('awaitingPlan')
  })

  it('persona 的「默认行为 = 总是先出计划」→ 发完**不复位**（它是长期设置）', async () => {
    const { result } = render()
    act(() => store.setOperatorPlanMode('always'))
    // 设成 always 时开关自己就开了（§3.4）。
    expect(store.getOperatorState().askFirst).toBe(true)

    act(() => {
      result.current.send('随便改一个字')
    })
    await settle()
    expect(store.getOperatorState().askFirst).toBe(true)
  })

  it('⭐ 出卡的那一轮 ⛔ 不再落 `plan` 条目 —— 同一份阶段只出现一次（第 2 件）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把这张改成三步')
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: ['选模型', '写提示词', '备好生成键'],
    })
    streams[0].emit(planRequestEvent(3))
    await settle()

    const state = store.getOperatorState()
    expect(state.plan).not.toBeNull()
    // 阶段清单归卡了 —— 流里⛔ 不再有第二份。
    expect(state.entries.some((entry) => entry.kind === 'plan')).toBe(false)
    // 计数照旧（顶部进度带按它画）。
    expect(state.plannedSteps).toBe(3)
  })

  it('⭐ 不出卡的那一轮，攒着的计划落成一条 `plan` 条目（第 2 件）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改一下')
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: ['写提示词', '存一下'],
    })
    streams[0].emit(planRequestEvent(2, 'multi-step', []))
    await settle()

    const state = store.getOperatorState()
    expect(state.plan).toBeNull()
    expect(state.entries.filter((entry) => entry.kind === 'plan')).toHaveLength(
      1,
    )
  })

  it('「开始」带 planAnswers + planApproved 重发，并把卡收成摘要（⛔ 不再 forcePlan）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    streams[0].emit(planRequestEvent(3))
    await settle()

    act(() => {
      result.current.answerQuestions([
        { questionId: 'q1', optionIds: ['half'] },
      ])
    })
    await settle()

    expect(streams).toHaveLength(2)
    const sent = streamAssistantOperatorAPI.mock.calls[1]?.[0]
    expect(sent.planAnswers).toEqual([
      { questionId: 'q1', optionIds: ['half'] },
    ])
    // 答复也留在 store 那张卡上 —— 收起态那一行「你选了：…」按它写。
    expect(store.getOperatorState().plan?.answers).toEqual([
      { questionId: 'q1', optionIds: ['half'] },
    ])
    expect(sent.planApproved).toBe(true)
    // ⛔ 不带 forcePlan：带了会让服务端再摆一帧，用户点完「开始」看到同一张卡又回来。
    expect(sent.forcePlan).toBeUndefined()
    expect(store.getOperatorState().plan?.resolved).toBe(true)
    expect(store.getOperatorState().status).toBe('working')
  })

  it('⭐ 连点两次「开始」**只发一次**（2026-09-07 真机：每次误点可能白烧 1 credit）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    streams[0].emit(planRequestEvent(3))
    await settle()

    act(() => {
      result.current.answerQuestions([
        { questionId: 'q1', optionIds: ['half'] },
      ])
      result.current.answerQuestions([
        { questionId: 'q1', optionIds: ['half'] },
      ])
    })
    await settle()

    // 第二发被 `plan.resolved` 挡掉 —— ⛔ 不是「发两次但第二次覆盖第一次」。
    expect(streams).toHaveLength(2)
  })

  it('⭐ 点过「开始」的那一轮⛔ 不再立起新的待确认卡（服务端零会话态会再摆一帧）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    streams[0].emit(planRequestEvent(3))
    await settle()

    act(() => {
      result.current.answerQuestions([
        { questionId: 'q1', optionIds: ['half'] },
      ])
    })
    await settle()

    // 续跑那条流里服务端又摆了一遍同样的计划 —— 这一轮**已经批过了**。
    streams[1].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: ['选模型', '写提示词', '备好生成键'],
    })
    streams[1].emit(planRequestEvent(3))
    await settle()

    const state = store.getOperatorState()
    // 卡还是那张收起来的（`resolved`），⛔ 没有被一张新的待确认卡顶掉。
    expect(state.plan?.resolved).toBe(true)
    expect(state.status).toBe('working')
    // 那份阶段落成一行折叠条目，⛔ 不再变成一张待确认卡。
    expect(state.entries.filter((entry) => entry.kind === 'plan')).toHaveLength(
      1,
    )
    // 流也没被掐 —— 后面的步照旧落地（此前那一支会 `return`）。
    streams[1].emit(doneStepEvent('step-1'))
    await settle()
    expect(
      store.getOperatorState().entries.some((entry) => entry.kind === 'step'),
    ).toBe(true)
  })

  it('「修改」⛔ 不发请求；下一条消息才带 planApproved: false，且只带一次', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    streams[0].emit(planRequestEvent(3))
    await settle()

    act(() => {
      result.current.revisePlan()
    })
    await settle()
    expect(streams).toHaveLength(1)

    act(() => {
      result.current.send('修改计划：先挂参考图')
    })
    await settle()
    expect(streamAssistantOperatorAPI.mock.calls[1]?.[0].planApproved).toBe(
      false,
    )

    // ⚠ 一次性：再说一句就不是「改计划」了。
    streams[1].close()
    await settle()
    act(() => {
      result.current.send('再补一句')
    })
    await settle()
    expect(
      streamAssistantOperatorAPI.mock.calls[2]?.[0].planApproved,
    ).toBeUndefined()
  })
})

describe('花钱硬确认卡（§6 第三档 / 拍板 24）', () => {
  it('spend_request → 摆卡；点「生成」带 autoApprove 重发并交给宿主扣扳机', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我发一枪')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.spendRequest,
      tier: 'spend',
      request: SPEND_REQUEST,
    })
    await settle()
    expect(store.getOperatorState().spend?.request.model.label).toBe(
      'Seedream 4',
    )

    act(() => {
      result.current.answerSpend({ rememberForSession: true })
    })
    await settle()

    // ⚠ 条子必须**在重发之前**记进 store，否则这一轮自己带不上它。
    expect(streamAssistantOperatorAPI.mock.calls[1]?.[0].autoApprove).toEqual({
      tier: 'spend',
      model: 'seedream-4',
      maxCredits: 4,
    })
    expect(store.getOperatorState().spend?.resolved).toBe(true)

    // 服务端放行 → `request_generation` 那一步 → 客户端扣扳机。
    streams[1].emit({
      type: ASSISTANT_OPERATOR_EVENTS.step,
      step: {
        id: 'step-1',
        title: '请求发送',
        tool: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
        payload: SPEND_REQUEST,
      },
    })
    await settle()
    expect(triggerGeneration).toHaveBeenCalledWith(SPEND_REQUEST)
    // ⭐ 命中自动通过时插一行系统行 —— ⛔ 不静默过（这一枪真的花了钱）。
    expect(
      store
        .getOperatorState()
        .entries.some(
          (entry) => entry.kind === 'system' && entry.code === 'autoApproved',
        ),
    ).toBe(true)
  })

  it('算不出金额时⛔ 不记条子 —— 一张永远匹配不上的条子比没有更糟', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我发一枪')
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.spendRequest,
      tier: 'spend',
      request: { ...SPEND_REQUEST, estimate: { model: 'Seedream 4' } },
    })
    await settle()

    act(() => {
      result.current.answerSpend({ rememberForSession: true })
    })
    await settle()
    expect(store.getOperatorState().autoApprove).toBeNull()
  })

  it('「＋新对话」把条子清掉 —— 作用域第一条要素是「同会话」', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我发一枪')
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.spendRequest,
      tier: 'spend',
      request: SPEND_REQUEST,
    })
    await settle()
    act(() => {
      result.current.answerSpend({ rememberForSession: true })
    })
    await settle()
    expect(store.getOperatorState().autoApprove).not.toBeNull()

    act(() => {
      result.current.newThread()
    })
    expect(store.getOperatorState().autoApprove).toBeNull()
    expect(store.getOperatorState().spend).toBeNull()
  })
})

describe('规则薄卡与歧义反问（§10 / §7）', () => {
  it('rule_hit → 时间线插一条规则条目（原文/日期原样，⛔ 不是一步）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('按老规矩来')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.ruleHit,
      ruleId: 'rule-1',
      text: '主角的耳环永远在左边',
      source: 'creator',
      createdAt: '2026-08-14T02:00:00.000Z',
    })
    await settle()

    const rule = store
      .getOperatorState()
      .entries.find((entry) => entry.kind === 'rule')
    expect(rule).toMatchObject({
      ruleId: 'rule-1',
      text: '主角的耳环永远在左边',
      createdAt: '2026-08-14T02:00:00.000Z',
    })
  })

  it('choice_request → 摆卡；点一张 = 插 @chip + 带 mentionedAssets 重发', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把那张改一下')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.choiceRequest,
      question: '你说的是哪一张？',
      options: [
        { id: 'gen-1', label: '结果①', assetUrl: 'https://cdn.test/a.png' },
        { id: 'gen-2', label: '结果②', assetUrl: 'https://cdn.test/b.png' },
      ],
    })
    await settle()
    expect(store.getOperatorState().choice?.options).toHaveLength(2)

    const picked = store.getOperatorState().choice?.options[1]
    act(() => {
      result.current.answerChoice(picked!, '就这张：结果②')
    })
    await settle()

    const state = store.getOperatorState()
    // ⭐ 与另外三个入口同一条 chip 管线。
    expect(state.mentions.map((chip) => chip.id)).toEqual(['gen-2'])
    expect(state.choice?.chosenId).toBe('gen-2')
    // ⭐ 服务端那一侧的**准入名单**：`critique_result.targetIds` 只能从这里挑。
    expect(
      streamAssistantOperatorAPI.mock.calls[1]?.[0].mentionedAssets,
    ).toEqual([{ id: 'gen-2', url: 'https://cdn.test/b.png', label: '结果②' }])
  })

  it('用户改口 → 三张卡一起收（⛔ 别留一张还能点的花钱卡）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我发一枪')
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.spendRequest,
      tier: 'spend',
      request: SPEND_REQUEST,
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: 'awaiting_confirm',
    })
    await settle()
    expect(store.getOperatorState().spend).not.toBeNull()

    act(() => {
      result.current.send('算了，换个别的')
    })
    await settle()
    expect(store.getOperatorState().spend).toBeNull()
  })
})

/**
 * 正文逐字流与加载态（owner 2026-09-06「一个字一个字连续出」「缺少加载中的状态」）。
 *
 * ⚠ rAF 在这里桩成**微任务**：jsdom 真实的 rAF 要 ~16ms 才跑，不桩的话增量永远
 * 卡在缓冲里，用例测的就成了「缓冲有没有攒住」而不是「有没有渲染出来」。
 * ⛔ 别桩回 `setTimeout(…, 0)`（2026-09-07 修）：事件是在 `for await` 的**微任务**
 * 里被接住的，那时 `settle()` 那颗 0ms 宏任务早就排在队里了 —— 两颗 0ms 定时器
 * 谁先跑取决于谁先排，表现是这一档用例六次里挂一次。微任务桩把「落地」拉回与
 * 「接住事件」同一次排空，race 就没有了。
 */
describe('正文流式累积与占位行', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0))
      return 0
    })
    // ⚠ 撤不掉也无害：`flushDeltas` 见缓冲是空的就直接返回（幂等）。
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 线程里那条**唯一的**助手正文条。 */
  function messageEntry() {
    return store
      .getOperatorState()
      .entries.filter((entry) => entry.kind === 'message')
      .at(-1)
  }

  it('⭐ 发送即回显：用户行与助手占位行在同一轮里立刻落进线程', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()

    const kinds = store.getOperatorState().entries.map((entry) => entry.kind)
    expect(kinds).toEqual(['user', 'message'])
    // 占位行 = 空正文 + streaming 旗，正文与占位**共用一条条目**（⛔ 不换 key）。
    expect(messageEntry()).toMatchObject({ text: '', streaming: true })
  })

  /**
   * ⭐ 2026-09-06 真机撞到的那条：`open` 是**模型开口之前**的握手帧，它到达时
   * 屏幕上还什么都没有。把它当成「它开口了」的表现是占位行闪一下就没了。
   */
  it('⛔ open 握手帧不算「它开口了」—— 占位行留着', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()

    streams[0].emit({ type: ASSISTANT_OPERATOR_EVENTS.open })
    await settle()
    expect(messageEntry()).toMatchObject({ text: '', streaming: true })
  })

  it('message_delta 逐帧累加进同一条，定稿帧整体覆盖并降旗', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()
    const placeholderId = messageEntry()?.id

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
      text: '已经',
    })
    await settle()
    expect(messageEntry()).toMatchObject({ text: '已经', streaming: true })

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
      text: '改成夜',
    })
    await settle()
    expect(messageEntry()?.text).toBe('已经改成夜')
    // ⭐ 一路都是同一条条目 —— 换条目就是换 key，那一行会重挂一次。
    expect(messageEntry()?.id).toBe(placeholderId)

    /**
     * ⭐ 定稿**覆盖**而不是追加：增量是从半截 JSON 里现解的，与定稿差一两个
     * 字符是常态，而那种差错没有任何人查得出来。
     */
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.message,
      text: '已经改成夜景了。',
    })
    await settle()
    expect(messageEntry()).toMatchObject({
      id: placeholderId,
      text: '已经改成夜景了。',
    })
    expect(messageEntry()?.streaming).toBeFalsy()
    expect(
      store.getOperatorState().entries.filter((e) => e.kind === 'message'),
    ).toHaveLength(1)
  })

  /**
   * ⭐ **rAF 停摆时正文照样一段一段长出来**（owner 2026-09-07 打回「流式还没实现」）。
   *
   * 🔬 根因就在这里：合批此前只挂在 rAF 上，而浏览器在窗口被遮挡 / 标签页切走时
   * 把 rAF 降到几帧每秒甚至整段挂起 —— 真机上 20 帧 `message_delta` 只换来 4 次
   * DOM 增长。这条用例把 rAF 桩成**永不回调**，逼出那条兜底闸：
   * `STUDIO_OPERATOR_STREAMING.flushFloorMs` 到点必落一次。
   * ⚠ 断言的是「落了不止一次」，⛔ 不是「落了几次」：帧数是浏览器的事。
   */
  it('⭐ rAF 停摆时靠 flushFloorMs 兜底 —— ⛔ 不许整段憋到定稿才一次落地', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()

    const lengths: number[] = []
    for (const text of ['已经', '改成', '夜景了。']) {
      streams[0].emit({ type: ASSISTANT_OPERATOR_EVENTS.messageDelta, text })
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, STUDIO_OPERATOR_STREAMING.flushFloorMs + 20)
        })
      })
      lengths.push(messageEntry()?.text.length ?? 0)
    }

    // 一次落地的表现是 [0, 0, 8]；兜底闸在的表现是逐段增长。
    expect(lengths).toEqual([2, 4, 8])
    expect(messageEntry()).toMatchObject({
      text: '已经改成夜景了。',
      streaming: true,
    })
  })

  it('⭐ 第一个 step 到达 → 空占位行让位，⛔ 不留一行空脉冲在日志上面', async () => {
    const { result } = render()
    act(() => {
      result.current.send('读一下当前状态')
    })
    await settle()
    expect(messageEntry()).toBeTruthy()

    streams[0].emit(doneStepEvent('step-1'))
    await settle()

    expect(store.getOperatorState().entries.map((entry) => entry.kind)).toEqual(
      ['user', 'step'],
    )
  })

  it('助手先说一句再去调工具 → 那句话留在屏幕上，⛔ 不被让位逻辑扫掉', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()

    streams[0].emit({ type: ASSISTANT_OPERATOR_EVENTS.message, text: '这就来' })
    await settle()
    streams[0].emit(doneStepEvent('step-1'))
    await settle()

    expect(store.getOperatorState().entries.map((entry) => entry.kind)).toEqual(
      ['user', 'message', 'step'],
    )
    expect(messageEntry()?.text).toBe('这就来')
  })

  it('一轮里两段正文各占一条 —— 定稿之后序号进一位', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()

    streams[0].emit({ type: ASSISTANT_OPERATOR_EVENTS.message, text: '这就来' })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
      text: '好了',
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.message,
      text: '好了，改完了。',
    })
    await settle()

    const messages = store
      .getOperatorState()
      .entries.filter((entry) => entry.kind === 'message')
    expect(messages.map((entry) => entry.text)).toEqual([
      '这就来',
      '好了，改完了。',
    ])
    expect(messages[0].id).not.toBe(messages[1].id)
  })

  /**
   * ⭐ 计划卡那一条**掐掉了流**（客户端硬判之后 abort + return），定稿帧永远
   * 不会来了。旗必须在那一刻放下来 —— 举着一面永远降不下来的 `streaming`
   * 等于给后来加光标 / 加脉冲的人埋一个「永远在流」的假象。
   */
  it('计划卡掐流之后，已经流出来的那段字留在屏幕上且不再举 streaming 旗', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我配一张海报')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
      text: '当前提示词是空的',
    })
    await settle()
    streams[0].emit(planRequestEvent(3))
    await settle()

    expect(store.getOperatorState().status).toBe('awaitingPlan')
    expect(messageEntry()).toMatchObject({ text: '当前提示词是空的' })
    expect(messageEntry()?.streaming).toBeFalsy()
  })

  /**
   * ⭐ **收尾之前的那条占位行**（owner 2026-09-07）。
   *
   * 🔬 由来：最后一个工具步跑完到收尾正文第一个字之间实测可达数秒 —— 那段时间
   * 线程里一条活的助手行都没有，只有进度带在转。
   * ⚠ 三条一起钉：**短间隔不挂**（连着跑的步之间不许闪三点）· **长间隔挂** ·
   * **首字到达就地替换**（⛔ 不另起一条条目，那是换 key = 重挂）。
   */
  describe('收尾前的占位行（步间空窗）', () => {
    async function wait(ms: number): Promise<void> {
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, ms)
        })
      })
    }

    it('⛔ 连续工具步之间的短空窗不挂占位行（挂了又拆就是闪）', async () => {
      const { result } = render()
      act(() => {
        result.current.send('读一下当前状态')
      })
      await settle()

      streams[0].emit(doneStepEvent('step-1'))
      await settle()
      await wait(STUDIO_OPERATOR_STREAMING.pendingAfterStepMs / 2)
      streams[0].emit(doneStepEvent('step-2'))
      await settle()

      expect(
        store.getOperatorState().entries.map((entry) => entry.kind),
      ).toEqual(['user', 'step', 'step'])
    })

    it('⭐ 一步落定之后空窗够长 → 挂占位行（三点脉冲那一条）', async () => {
      const { result } = render()
      act(() => {
        result.current.send('读一下当前状态')
      })
      await settle()

      streams[0].emit(doneStepEvent('step-1'))
      await settle()
      await wait(STUDIO_OPERATOR_STREAMING.pendingAfterStepMs + 60)

      const entries = store.getOperatorState().entries
      expect(entries.map((entry) => entry.kind)).toEqual([
        'user',
        'step',
        'message',
      ])
      // 占位行 = 空正文 + streaming 旗（渲染侧照这两个值画三点）。
      expect(entries.at(-1)).toMatchObject({ text: '', streaming: true })
    })

    it('⭐ 首个 message_delta 就地替换占位行 —— ⛔ 不另起一条条目', async () => {
      const { result } = render()
      act(() => {
        result.current.send('读一下当前状态')
      })
      await settle()

      streams[0].emit(doneStepEvent('step-1'))
      await settle()
      await wait(STUDIO_OPERATOR_STREAMING.pendingAfterStepMs + 60)
      const placeholderId = messageEntry()?.id

      streams[0].emit({
        type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
        text: '改完了',
      })
      await settle()

      expect(messageEntry()).toMatchObject({
        id: placeholderId,
        text: '改完了',
        streaming: true,
      })
      expect(
        store.getOperatorState().entries.filter((e) => e.kind === 'message'),
      ).toHaveLength(1)
    })
  })

  it('流炸了也不把半句话丢在缓冲里', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.messageDelta,
      text: '已经改',
    })
    streams[0].fail(new Error('boom'))
    await settle()

    expect(messageEntry()?.text).toBe('已经改')
    expect(store.getOperatorState().status).toBe('error')
  })
})
