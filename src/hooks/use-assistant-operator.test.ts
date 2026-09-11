import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'
import type {
  AssistantOperatorAskEvent,
  AssistantOperatorEvent,
  AssistantOperatorGenerationRequest,
  AssistantOperatorMessage,
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
      verb: 'look',
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
 * 上下文卡那三跳（v2 §8.1）—— 写库**整条链都在客户端**：提议到达写一行
 * `proposed`、「存这张卡」PATCH 翻面、「不用」DELETE 删掉。桩这三个就足以验
 * 「谁写了库、什么时候写的」。
 */
const createContextCardAPI = vi.hoisted(() => vi.fn())
const updateContextCardAPI = vi.hoisted(() => vi.fn())
const deleteContextCardAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/context-cards', () => ({
  createContextCardAPI,
  updateContextCardAPI,
  deleteContextCardAPI,
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
const dispatch = vi.hoisted(() => vi.fn())
/**
 * 宿主上那份**可选**的四颗旋钮真值（#9 / §5.2）—— 逐例现填。
 * ⚠ 默认 `null`（缺席）：那一档验的正是「宿主不给就照载荷走」的既有行为。
 */
const generationControls = vi.hoisted(() => ({
  current: null as unknown,
}))

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: 'image' as const,
    buildSnapshot: () => ({ prompt: '', availableModels: [] }),
    results: [],
    referenceLimit: 4,
    open: true,
    setOpen: () => {},
    ...(generationControls.current
      ? { generationControls: generationControls.current }
      : {}),
    apply: {
      triggerGeneration,
      getState: () => ({ prompt: '', advancedParams: {} }),
      dispatch,
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
  generationControls.current = null
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
  it('请求被拒绝后清除等待圆点，再次发送可以正常收到回复', async () => {
    streamAssistantOperatorAPI.mockResolvedValueOnce({
      success: false,
      error: 'Invalid request body',
      errorCode: 'VALIDATION_ERROR',
    })
    const { result } = render()
    act(() => result.current.send('调整画风'))
    await settle()
    expect(store.getOperatorState().errorText).toBe('i18n:invalidRequest')
    expect(
      store
        .getOperatorState()
        .entries.filter(
          (entry) => entry.kind === 'message' && entry.text === '',
        ),
    ).toHaveLength(0)
    act(() => result.current.send('再次调整画风'))
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.message,
      text: '收到画风要求',
    })
    streams[0].close()
    await settle()
    expect(store.getOperatorState().status).toBe('idle')
    expect(
      store
        .getOperatorState()
        .entries.filter(
          (entry) => entry.kind === 'message' && entry.text === '',
        ),
    ).toHaveLength(0)
    expect(
      store
        .getOperatorState()
        .entries.some(
          (entry) => entry.kind === 'message' && entry.text === '收到画风要求',
        ),
    ).toBe(true)
  })

  /**
   * ⭐ **每轮都带上当前会话 id**（v2 §7.5 / §7.6，commit #12）—— 服务端零会话态，
   * 会话的身份一直由客户端持有，而结账写库与下一轮注入都落在它上面。
   */
  it('已落库的线程：每轮请求带 conversationId', async () => {
    store.setOperatorSession(
      '11111111-2222-3333-4444-555555555555',
      'IMAGE_STUDIO',
    )
    const { result } = render()
    act(() => result.current.send('请调整画风'))
    await settle()
    expect(streamAssistantOperatorAPI.mock.calls[0]?.[0].conversationId).toBe(
      '11111111-2222-3333-4444-555555555555',
    )
    streams[0].close()
    await settle()
  })

  /**
   * ⚠ 第一轮**没有** id（这条线程还没落过库）——那一轮照常发，⛔ 不带一个空键：
   * 服务端的 schema 收的是 uuid，空串会让整条请求 400。
   */
  it('还没落库的线程：请求里没有 conversationId 这个键', async () => {
    const { result } = render()
    act(() => result.current.send('请调整画风'))
    await settle()
    expect(streamAssistantOperatorAPI.mock.calls[0]?.[0]).not.toHaveProperty(
      'conversationId',
    )
    // ⛔ `workingMemory` 一并不再上送（§7.6）。
    expect(streamAssistantOperatorAPI.mock.calls[0]?.[0]).not.toHaveProperty(
      'workingMemory',
    )
    streams[0].close()
    await settle()
  })

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
      steps: planSteps(3),
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

const QUESTIONS: AssistantOperatorAskEvent['question'][] = [
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

/** 一份 N 步的计划（`plan` 帧与多步确认帧共用同一张阶段表）。 */
function planSteps(steps: number) {
  return Array.from({ length: steps }, (_, index) => ({
    id: `plan-${index + 1}`,
    label: `第 ${index + 1} 步`,
  }))
}

/** 多步确认帧（v2 §3.3 第一种来源）—— 判在服务端，客户端只管摆卡。 */
function multistepConfirmEvent(steps = 3): AssistantOperatorEvent {
  return {
    type: ASSISTANT_OPERATOR_EVENTS.confirm,
    confirm: { kind: 'multistep', steps: planSteps(steps) },
  }
}

/** 问题帧（v2 §3.4）—— 一帧只问一道题。 */
function askEvent(
  question: AssistantOperatorAskEvent['question'] = QUESTIONS[0]!,
): AssistantOperatorEvent {
  return { type: ASSISTANT_OPERATOR_EVENTS.ask, question }
}

const SPEND_REQUEST = {
  model: { id: 'seedream-4', label: 'Seedream 4' },
  count: 1,
  specs: { aspectRatio: '3:4', resolution: '2K', durationSeconds: null },
} as const

/** 生成确认帧（v2 §3.3 第二种来源）。 */
function generateConfirmEvent(
  request: AssistantOperatorGenerationRequest = SPEND_REQUEST,
): AssistantOperatorEvent {
  return {
    type: ASSISTANT_OPERATOR_EVENTS.confirm,
    confirm: { kind: 'generate', request },
  }
}

describe('计划卡（v2 §3.3 多步确认）', () => {
  it('confirm(multistep) → 出卡、进 awaitingPlan，⛔ 随后的 stopped 不把它降级', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把这张改成三步')
    })
    await settle()

    streams[0].emit(multistepConfirmEvent(3))
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: 'awaiting_confirm',
    })
    await settle()

    const state = store.getOperatorState()
    /**
     * ⚠ 服务端只会笼统地说一句 `awaiting_confirm`，而这一档要说的是「一整轮还
     * 没开始跑」——被盖过去的表现是图标轨上「待你定」变成「待确认」。
     */
    expect(state.status).toBe('awaitingPlan')
    expect(state.confirm?.kind).toBe('multistep')
    expect(
      state.confirm?.kind === 'multistep' ? state.confirm.steps : [],
    ).toHaveLength(3)
    expect(state.confirm?.status).toBe('idle')
  })

  it('没有确认帧的那一轮 ⛔ 不出卡，直接接着跑', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改一下')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: planSteps(2),
    })
    streams[0].emit(doneStepEvent('step-1'))
    await settle()

    expect(store.getOperatorState().confirm).toBeNull()
    expect(store.getOperatorState().status).toBe('working')
  })

  /**
   * ⭐ **「先问我」开关已删（v2 决策 6 / §4.4）**：请求里不再有 `forcePlan`，
   * 「每轮先出计划」整条语义搬到人设的 `planMode: always`（v2 §11.1），由服务端
   * 判。⛔ 输入区不许再出现一个跟它打架的单轮开关。
   */
  it('⛔ 请求体不再带 forcePlan —— 哪怕 persona 是「总是先出计划」', async () => {
    const { result } = render()
    act(() => store.setOperatorPlanMode('always'))
    act(() => {
      result.current.send('随便改一个字')
    })
    await settle()

    const sent = streamAssistantOperatorAPI.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(sent).not.toHaveProperty('forcePlan')
    // 服务端照样把计划确认卡摆出来 —— 语义没丢，只是换了出口。
    streams[0].emit(multistepConfirmEvent(1))
    await settle()
    expect(store.getOperatorState().status).toBe('awaitingPlan')
  })

  it('⭐ 出卡的那一轮 ⛔ 不再落 `plan` 条目 —— 同一份阶段只出现一次（第 2 件）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把这张改成三步')
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: planSteps(3),
    })
    streams[0].emit(multistepConfirmEvent(3))
    await settle()

    const state = store.getOperatorState()
    expect(state.confirm).not.toBeNull()
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
      steps: planSteps(2),
    })
    streams[0].emit(doneStepEvent('step-1'))
    await settle()

    const state = store.getOperatorState()
    expect(state.confirm).toBeNull()
    expect(state.entries.filter((entry) => entry.kind === 'plan')).toHaveLength(
      1,
    )
  })

  it('「开始」带 planApproved 重发，并把卡换成「已确认」', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    streams[0].emit(multistepConfirmEvent(3))
    await settle()

    act(() => {
      result.current.approvePlan()
    })
    await settle()

    expect(streams).toHaveLength(2)
    const sent = streamAssistantOperatorAPI.mock.calls[1]?.[0]
    // ⚠ `planApproved` 是这一轮不再被服务端拦一次的唯一依据：少了它，用户点完
    //   「开始」看到的是同一张卡又回来（一个自己喂自己的环）。
    expect(sent.planApproved).toBe(true)
    expect(store.getOperatorState().confirm?.status).toBe('confirmed')
    expect(store.getOperatorState().status).toBe('working')
  })

  it('⭐ 连点两次「开始」**只发一次**（2026-09-07 真机：每次误点可能白烧 1 credit）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    streams[0].emit(multistepConfirmEvent(3))
    await settle()

    act(() => {
      result.current.approvePlan()
      result.current.approvePlan()
    })
    await settle()

    // 第二发被 `confirm.status` 挡掉 —— ⛔ 不是「发两次但第二次覆盖第一次」。
    expect(streams).toHaveLength(2)
  })

  it('⭐ 点过「开始」的那一轮⛔ 不再立起新的待确认卡（服务端零会话态会再摆一帧）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    streams[0].emit(multistepConfirmEvent(3))
    await settle()

    act(() => {
      result.current.approvePlan()
    })
    await settle()

    // 续跑那条流里服务端又摆了一遍同样的计划 —— 这一轮**已经批过了**。
    streams[1].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: planSteps(3),
    })
    streams[1].emit(doneStepEvent('step-2'))
    await settle()

    const state = store.getOperatorState()
    // 卡还是那张定过的，⛔ 没有被一张新的待确认卡顶掉。
    expect(state.confirm?.status).toBe('confirmed')
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
    streams[0].emit(multistepConfirmEvent(3))
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

/**
 * **上下文卡提议**（v2 §8.1，commit #14 + owner 2026-09-11）——
 * 提议到达即写「待确认」 → 面板上点「存这张卡」翻成「已确认」 / 点「不用」删掉。
 */
describe('上下文卡提议（v2 §8.1）', () => {
  const DRAFT = {
    kind: 'character' as const,
    name: '西格莉卡',
    summary: '银发金瞳',
    body: '## 外貌\n银发、金瞳。',
    negative: '空气涟漪',
  }

  function proposeEvent(): AssistantOperatorEvent {
    return {
      type: ASSISTANT_OPERATOR_EVENTS.confirm,
      confirm: { kind: 'contextCard', card: DRAFT },
    }
  }

  /** 摆到一张「提议卡在面板上、proposed 已写进库」的现场。 */
  async function propose(): Promise<ReturnType<typeof render>['result']> {
    const { result } = render()
    act(() => {
      result.current.send('她就长这样')
    })
    await settle()
    streams[0].emit(proposeEvent())
    await settle()
    return result
  }

  beforeEach(() => {
    createContextCardAPI.mockResolvedValue({
      success: true,
      data: { id: 'card-9', name: DRAFT.name },
    })
    updateContextCardAPI.mockResolvedValue({
      success: true,
      data: { id: 'card-9', name: DRAFT.name },
    })
    deleteContextCardAPI.mockResolvedValue({ success: true, data: null })
  })

  it('提议一到就写一行 proposed，⛔ 不等用户点', async () => {
    await propose()

    expect(createContextCardAPI).toHaveBeenCalledTimes(1)
    expect(createContextCardAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'character',
        name: '西格莉卡',
        status: 'proposed',
        pinnedScopes: [],
      }),
    )
    const pending = store.getOperatorState().confirm
    expect(pending?.kind).toBe('contextCard')
    expect(pending?.status).toBe('idle')
  })

  it('「存这张卡」= 把那一行翻成 confirmed，并落一行系统行', async () => {
    const result = await propose()

    await act(async () => {
      await result.current.saveContextCard()
    })

    expect(updateContextCardAPI).toHaveBeenCalledWith('card-9', {
      status: 'confirmed',
    })
    // ⛔ 不再建第二行：那一行提议时就已经在库里了。
    expect(createContextCardAPI).toHaveBeenCalledTimes(1)
    expect(store.getOperatorState().confirm?.status).toBe('confirmed')
    const line = store
      .getOperatorState()
      .entries.find(
        (entry) => entry.kind === 'system' && entry.code === 'contextCardSaved',
      )
    expect(line).toBeDefined()
    // ⛔ 不重发一轮：存卡是客户端一次写库，不是新一轮对话。
    expect(streams).toHaveLength(1)
  })

  it('「不用」把那一行删掉', async () => {
    const result = await propose()

    await act(async () => {
      await result.current.dismissContextCard()
    })

    expect(deleteContextCardAPI).toHaveBeenCalledWith('card-9')
    expect(updateContextCardAPI).not.toHaveBeenCalled()
    expect(store.getOperatorState().confirm?.status).toBe('cancelled')
  })

  /** ⭐ 写 proposed 失败不该让用户存不下：那一跳只决定走翻面还是走新建。 */
  it('写 proposed 失败时卡照旧可存 —— 回落成 create confirmed', async () => {
    createContextCardAPI.mockResolvedValueOnce({
      success: false,
      error: 'nope',
    })
    const result = await propose()
    expect(store.getOperatorState().confirm?.status).toBe('idle')

    await act(async () => {
      await result.current.saveContextCard()
    })

    expect(updateContextCardAPI).not.toHaveBeenCalled()
    expect(createContextCardAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: '西格莉卡', status: 'confirmed' }),
    )
    expect(store.getOperatorState().confirm?.status).toBe('confirmed')
  })

  /** ⛔ 存不下去不静默：用户以为记住了，而库里那一行还停在「待确认」。 */
  it('翻面失败时卡转回 idle 并落一行失败系统行', async () => {
    updateContextCardAPI.mockResolvedValue({ success: false, error: 'nope' })
    const result = await propose()

    await act(async () => {
      await result.current.saveContextCard()
    })

    expect(store.getOperatorState().confirm?.status).toBe('idle')
    expect(
      store
        .getOperatorState()
        .entries.some(
          (entry) =>
            entry.kind === 'system' && entry.code === 'contextCardSaveFailed',
        ),
    ).toBe(true)

    // 再点一次仍是**翻同一行的面**，⛔ 不会变成新建第二行。
    updateContextCardAPI.mockResolvedValue({
      success: true,
      data: { id: 'card-9', name: DRAFT.name },
    })
    await act(async () => {
      await result.current.saveContextCard()
    })
    expect(updateContextCardAPI).toHaveBeenLastCalledWith('card-9', {
      status: 'confirmed',
    })
    expect(createContextCardAPI).toHaveBeenCalledTimes(1)
  })
})

describe('生成确认卡（v2 §3.3 / §5）', () => {
  it('confirm(generate) → 摆卡；点「确认生成」当场扣扳机，⛔ 不重发一轮', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我发一枪')
    })
    await settle()

    streams[0].emit(generateConfirmEvent())
    await settle()
    const pending = store.getOperatorState().confirm
    expect(
      pending?.kind === 'generate' ? pending.request.model.label : null,
    ).toBe('Seedream 4')

    act(() => {
      result.current.confirmGeneration()
    })
    await settle()

    /**
     * ⭐ 扳机就在宿主那颗生成键上（§5）。v1 走的是「带 `autoApprove` 重发 →
     * 服务端吐 `request_generation` 那一步」，而那条免检通道随决策 8 删了 ——
     * 留着重发的表现是用户点一次「确认生成」、服务端再问一次同一张卡。
     */
    expect(triggerGeneration).toHaveBeenCalledWith(SPEND_REQUEST)
    expect(streams).toHaveLength(1)
    expect(store.getOperatorState().confirm?.status).toBe('confirmed')
  })

  /**
   * ⭐ #9（§5.2）：卡上那四颗旋钮就地可换。
   * 钉两行规则 —— 第二行「卡上改一项立刻写回工作台」、第四行「点确认用工作台
   * **此刻**的值触发，⛔ 不用卡上缓存的那一份」。
   */
  describe('就地改参数（§5.2）', () => {
    const CONTROLS = {
      model: { id: 'seedream-4', label: 'Seedream 4' },
      models: [
        { id: 'seedream-4', label: 'Seedream 4' },
        { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
      ],
      aspectRatio: '16:9',
      resolution: '2K',
      count: 2,
      choicesByModel: {
        'seedream-4': {
          aspectRatios: ['16:9', '1:1'],
          resolutions: ['2K', '1K'],
          counts: [1, 2, 4],
        },
        'flux-2-flash': {
          aspectRatios: ['1:1'],
          resolutions: ['1K'],
          counts: [1],
        },
      },
    }

    it('改一颗 → 立刻 dispatch 到工作台，并在登记簿上记一格（✦ 亮起来）', async () => {
      generationControls.current = CONTROLS
      const { result } = render()
      act(() => {
        result.current.adjustGeneration('count', '4')
      })
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_IMAGE_BATCH_COUNT',
        payload: 4,
      })
      expect(store.getOperatorState().changes.count).toBeDefined()
      // 撤销的本钱是**改之前**那个数。
      expect(
        store.getOperatorState().changes.count?.firstInverse,
      ).toMatchObject({ inverse: { count: 2 } })
    })

    it('⭐ 换模型 → 不合法的比例 / 清晰度就地回落，回落掉的那几颗报给卡', async () => {
      generationControls.current = CONTROLS
      const { result } = render()
      let adjusted: readonly string[] = []
      act(() => {
        adjusted = result.current.adjustGeneration('model', 'flux-2-flash')
      })
      expect(adjusted).toEqual(['aspect', 'resolution', 'count'])
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_ASPECT_RATIO',
        payload: '1:1',
      })
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_IMAGE_BATCH_COUNT',
        payload: 1,
      })
    })

    it('⭐ 「确认生成」用的是**工作台此刻**的值，⛔ 不是卡出现那一刻的载荷', async () => {
      generationControls.current = CONTROLS
      const { result } = render()
      act(() => {
        result.current.send('帮我发一枪')
      })
      await settle()
      streams[0].emit(generateConfirmEvent())
      await settle()

      act(() => {
        result.current.confirmGeneration()
      })
      await settle()
      expect(triggerGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          model: { id: 'seedream-4', label: 'Seedream 4' },
          count: 2,
          specs: expect.objectContaining({
            aspectRatio: '16:9',
            resolution: '2K',
          }),
        }),
      )
    })

    it('⚠ 宿主不给 controls（LoRA 装配台）→ 改参数是 no-op', async () => {
      const { result } = render()
      act(() => {
        expect(result.current.adjustGeneration('count', '4')).toEqual([])
      })
      expect(dispatch).not.toHaveBeenCalled()
    })
  })

  it('⭐ 连点两次「确认生成」只扣一次扳机', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我发一枪')
    })
    await settle()
    streams[0].emit(generateConfirmEvent())
    await settle()

    act(() => {
      result.current.confirmGeneration()
      result.current.confirmGeneration()
    })
    await settle()
    expect(triggerGeneration).toHaveBeenCalledTimes(1)
  })

  it('「＋新对话」把还钉着的那张卡清掉', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我发一枪')
    })
    await settle()
    streams[0].emit(generateConfirmEvent())
    await settle()
    expect(store.getOperatorState().confirm).not.toBeNull()

    act(() => {
      result.current.newThread()
    })
    expect(store.getOperatorState().confirm).toBeNull()
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

  it('ask（选项全带 assetUrl）→ 摆卡；点一张 = 插 @chip + 带 mentionedAssets 重发', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把那张改一下')
    })
    await settle()

    streams[0].emit(
      askEvent({
        id: 'which-asset',
        header: '哪一张',
        question: '你说的是哪一张？',
        multiSelect: false,
        allowOther: false,
        options: [
          {
            id: 'gen-1',
            label: '结果①',
            description: '结果①',
            assetUrl: 'https://cdn.test/a.png',
          },
          {
            id: 'gen-2',
            label: '结果②',
            description: '结果②',
            assetUrl: 'https://cdn.test/b.png',
          },
        ],
      }),
    )
    await settle()
    expect(store.getOperatorState().question?.question.options).toHaveLength(2)

    const picked = store.getOperatorState().question?.question.options[1]
    act(() => {
      result.current.answerQuestion(
        { questionId: 'which-asset', optionIds: [picked!.id] },
        {
          label: picked!.label,
          asset: {
            id: picked!.id,
            url: picked!.assetUrl as string,
            label: picked!.label,
            kind: 'image',
            thumbnailUrl: picked!.assetUrl as string,
          },
        },
      )
    })
    await settle()

    const state = store.getOperatorState()
    // ⭐ 与另外三个入口同一条 chip 管线。
    expect(state.mentions.map((chip) => chip.id)).toEqual(['gen-2'])
    // ⭐ 答完卡就消失（§3.4）。⚠ 缩略图那一支落的是**用户行**：服务端的准入
    //   名单读的是最后一条用户消息的附件，落成系统行那张图到不了服务端。
    expect(state.question).toBeNull()
    // ⚠ 末尾那条是下一轮的助手占位行 —— 找的是最后一条**用户行**。
    expect(
      state.entries.filter((entry) => entry.kind === 'user').at(-1),
    ).toMatchObject({ attachments: [{ id: 'gen-2' }] })
    // ⭐ 服务端那一侧的**准入名单**：`critique_result.targetIds` 只能从这里挑。
    expect(
      streamAssistantOperatorAPI.mock.calls[1]?.[0].mentionedAssets,
    ).toEqual([{ id: 'gen-2', url: 'https://cdn.test/b.png', label: '结果②' }])
  })

  it('用户改口 → 两张卡一起收（⛔ 别留一张还能点的生成确认卡）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我发一枪')
    })
    await settle()
    streams[0].emit(generateConfirmEvent())
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: 'awaiting_confirm',
    })
    await settle()
    expect(store.getOperatorState().confirm).not.toBeNull()

    act(() => {
      result.current.send('算了，换个别的')
    })
    await settle()
    expect(store.getOperatorState().confirm).toBeNull()
  })

  /**
   * ⭐ **答复必须自带题面与选项文案**（v2 §3.4 落账规则，2026-09-12 真机 bug）。
   *
   * `question-1` / `option-1-1` 是上一条流现编的合成 id，而服务端零会话态 ——
   * 只回 id 的那一版里，模型在下一轮根本读不到「用户选了什么」，真机连着四轮
   * 重问同一件事。这条用例钉的就是「请求体里有原话」。
   */
  it('⭐ 答问题卡 → 请求体里的 planAnswers 带着题面与选项文案（⛔ 不只有合成 id）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我定一下取景')
    })
    await settle()
    streams[0].emit(askEvent())
    await settle()

    const picked = store.getOperatorState().question!.question.options[0]!
    act(() => {
      result.current.answerQuestion(
        { questionId: 'q1', optionIds: [picked.id] },
        { label: picked.label },
      )
    })
    await settle()

    expect(streamAssistantOperatorAPI.mock.calls[1]?.[0].planAnswers).toEqual([
      {
        questionId: 'q1',
        optionIds: ['half'],
        question: '取多少身？',
        optionLabels: ['半身'],
      },
    ])
  })

  /**
   * ⭐ **答复同时是一条会话里的 user 消息**（2026-09-12 第二次真机 bug）。
   *
   * 第一版修法只让答复随**当次**请求上送（`planAnswers`）：再下一轮那道题的答案
   * 在请求里一个字都不剩 —— 时间线那一行不进 `messages`，问答轮又以
   * `stopped(awaiting_confirm)` 收尾不结账。真机：答「2D 日系手绘插画」→ 答
   * 「覆盖」→ 模型第三次问「2D 手绘还是 3D 渲染」。
   */
  it('⭐ 答问题卡 → 下一轮 messages 里有一条自带题面的 user 消息（时间线仍是系统行）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我定一下取景')
    })
    await settle()
    streams[0].emit(askEvent())
    await settle()

    const picked = store.getOperatorState().question!.question.options[0]!
    act(() => {
      result.current.answerQuestion(
        { questionId: 'q1', optionIds: [picked.id] },
        { label: picked.label },
      )
    })
    await settle()

    // ⭐ 渲染那一侧不变：它仍然是一行系统行（⛔ 不是气泡）。
    const line = store
      .getOperatorState()
      .entries.find((entry) => entry.kind === 'system')
    expect(line).toMatchObject({
      code: 'questionAnswered',
      subject: '半身',
      userText: '已选择「半身」（针对问题「取多少身？」）',
    })

    // ⭐ 而它同时是这一轮请求里的一条 user 消息（自包含：带着题面）。
    // ⚠ 末尾那条是这一轮的助手占位行 —— 找的是最后一条**用户消息**。
    const messages: AssistantOperatorMessage[] =
      streamAssistantOperatorAPI.mock.calls[1]?.[0].messages
    expect(
      messages.filter((message) => message.role === 'user').at(-1),
    ).toEqual({
      role: 'user',
      content: '已选择「半身」（针对问题「取多少身？」）',
      answered: {
        questionId: 'q1',
        optionIds: ['half'],
        question: '取多少身？',
        optionLabels: ['半身'],
      },
    })

    // ⭐ 再下一轮（用户又说了句别的）那句话**还在**：这正是 bug 的那一半。
    // ⚠ 先把这一轮收掉，否则新消息进的是排队而不是一次请求。
    streams[1]?.emit({
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: 'awaiting_confirm',
    })
    await settle()
    act(() => {
      result.current.send('就这样')
    })
    await settle()
    const later = streamAssistantOperatorAPI.mock.calls[2]?.[0]
    expect(later?.planAnswers).toBeUndefined()
    const laterMessages: AssistantOperatorMessage[] = later?.messages ?? []
    expect(
      laterMessages.some((message) =>
        message.content.includes('已选择「半身」（针对问题「取多少身？」）'),
      ),
    ).toBe(true)
  })

  /**
   * ⭐ **一条 `apply` 步落到工作台上**（v2 §2.1「改」组）—— 入口收口（#5）之后
   * 帧上多了 `verb`，而派发照旧按 `tool`（旧工具名）。这条用例钉住那一格：
   * `verb` 换了写法也好、面板改了状态词也好，⛔ 都不许把「谁去改表单」这条线
   * 改成读 `verb`（真机表现是「步骤跑了、提示词还是空的」）。
   */
  it('⭐ step{tool:set_prompt, verb:apply, status:done} → 宿主收到 SET_PROMPT', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词写进工作台')
    })
    await settle()
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.step,
      step: {
        id: 'step-1',
        title: '写入正向提示词',
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        verb: 'apply',
        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
        payload: { mode: 'replace', value: '雨夜里的红伞' },
        inverse: { value: '' },
      },
    })
    await settle()

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PROMPT',
      payload: '雨夜里的红伞',
    })
    // ⭐ 归属标记（✦）同一跳记账 —— 少了它参数栏上看不出这一格是谁改的。
    expect(store.getOperatorState().changes.prompt).toMatchObject({
      field: 'prompt',
    })
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

  /**
   * ⭐ **§13.1 时间线重复消息** —— 正文只有 `message` 一个来源，⛔ 不追加。
   *
   * 🔬 旧行为：正文先由 `message_delta` 累积成一条，计划帧插在中间把序号顶掉
   * 一位，随后的定稿帧于是**另起一条** —— 同一段分析回复在计划的上下各出现一次
   * （owner 真机「帮我看看这张参考」）。删掉增量之后这条路必须只落一条。
   */
  it('⭐ 计划帧插在正文之前：时间线里只有一条正文', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我看看这张参考')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: planSteps(2),
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.message,
      text: '这张参考是暖调人像。',
    })
    await settle()

    const messages = store
      .getOperatorState()
      .entries.filter((entry) => entry.kind === 'message')
    expect(messages.map((entry) => entry.text)).toEqual([
      '这张参考是暖调人像。',
    ])
  })

  /**
   * ⭐ **同一条正文来两帧就覆盖**（§13.1 验收「按 id 覆盖，⛔ 不追加」）：
   * 这一段还钉在线程末尾时，第二帧写回的是**同一条条目**。
   */
  it('⭐ 定稿帧重复到达 → 覆盖同一条，⛔ 不追加第二条', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我看看这张参考')
    })
    await settle()

    for (const text of ['这张参考是暖调人像', '这张参考是暖调人像。']) {
      streams[0].emit({ type: ASSISTANT_OPERATOR_EVENTS.message, text })
      await settle()
    }

    const messages = store
      .getOperatorState()
      .entries.filter((entry) => entry.kind === 'message')
    expect(messages.map((entry) => entry.text)).toEqual([
      '这张参考是暖调人像。',
    ])
  })

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

  it('定稿帧就地写进占位行 —— 同一条条目，旗降下来', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()
    const placeholderId = messageEntry()?.id

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.message,
      text: '已经改成夜景了。',
    })
    await settle()

    // ⭐ 占位与正文是同一条条目 —— 换条目就是换 key，那一行会重挂一次。
    expect(messageEntry()).toMatchObject({
      id: placeholderId,
      text: '已经改成夜景了。',
    })
    expect(messageEntry()?.streaming).toBeFalsy()
    expect(
      store.getOperatorState().entries.filter((e) => e.kind === 'message'),
    ).toHaveLength(1)
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

  it('一轮里两段正文各占一条 —— 被压在下面之后序号进一位', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()

    streams[0].emit({ type: ASSISTANT_OPERATOR_EVENTS.message, text: '这就来' })
    await settle()
    // ⭐ 一条工具步把上面那段压下去了 —— 后面的字属于**新的一段**。
    streams[0].emit(doneStepEvent('step-1'))
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
   * ⭐ 计划卡那一条**掐掉了流**（客户端硬判之后 abort + return）。已经说出口的
   * 那句话必须留在屏幕上，而那条还空着的占位行必须让位。
   */
  it('计划卡掐流之后，已经说出口的那句话留在屏幕上，空占位行让位', async () => {
    const { result } = render()
    act(() => {
      result.current.send('帮我配一张海报')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.message,
      text: '当前提示词是空的',
    })
    await settle()
    streams[0].emit(multistepConfirmEvent(3))
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

    it('⭐ 定稿帧就地替换占位行 —— ⛔ 不另起一条条目', async () => {
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
        type: ASSISTANT_OPERATOR_EVENTS.message,
        text: '改完了',
      })
      await settle()

      expect(messageEntry()).toMatchObject({
        id: placeholderId,
        text: '改完了',
      })
      expect(
        store.getOperatorState().entries.filter((e) => e.kind === 'message'),
      ).toHaveLength(1)
    })
  })

  it('流炸了也不把已经说出口的那句话扫掉', async () => {
    const { result } = render()
    act(() => {
      result.current.send('把提示词改成夜景')
    })
    await settle()

    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.message,
      text: '已经改成夜景了。',
    })
    streams[0].fail(new Error('boom'))
    await settle()

    expect(messageEntry()?.text).toBe('已经改成夜景了。')
    expect(store.getOperatorState().status).toBe('error')
  })
})

/**
 * **断点续跑**（第三期）—— 这一组钉的是**接线**：计划一开跑就落记录、
 * 一步有结论就改记录、点「继续」发的是 `resumeFrom` + `planApproved: true`。
 *
 * ⛔ 钱闸不在这一组里验（它在 `assistant-operator.money-gate.test.ts` 与服务端
 * 用例里）：这一层根本不知道哪一步要花钱。
 */
describe('断点续跑', () => {
  beforeEach(() => {
    localStorage.clear()
    store.setOperatorResumeScope('image')
  })

  /** 计划直接开跑（不出卡）的那一支 —— `plan` 帧之后紧跟一个别的帧。 */
  function startPlan(steps: number): void {
    streams[0].emit({
      type: ASSISTANT_OPERATOR_EVENTS.plan,
      steps: planSteps(steps),
    })
  }

  it('⭐ 计划一开跑就落一份续跑记录（每步 pending）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    startPlan(3)
    streams[0].emit(doneStepEvent('step-1'))
    await settle()

    const resume = store.getOperatorState().resume
    expect(resume?.steps).toHaveLength(3)
    // 第一步已经有结论了，其余还没。
    expect(resume?.steps.map((step) => step.state)).toEqual([
      'done',
      'pending',
      'pending',
    ])
  })

  it('⭐ 点「继续」发 resumeFrom + planApproved:true', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    startPlan(3)
    streams[0].emit(doneStepEvent('step-1'))
    await settle()
    streams[0].fail(new Error('boom'))
    await settle()

    act(() => {
      result.current.resumePlan()
    })
    await settle()

    const sent = streamAssistantOperatorAPI.mock.calls[1]?.[0]
    expect(sent.planApproved).toBe(true)
    expect(sent.resumeFrom.completedSteps).toHaveLength(1)
    expect(sent.resumeFrom.completedSteps[0].label).toBe('第 1 步')
  })

  it('一步都没做完时「继续」是 no-op（那是重跑，不是续跑）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分三步做')
    })
    await settle()
    startPlan(3)
    await settle()

    act(() => {
      result.current.resumePlan()
    })
    await settle()
    expect(streamAssistantOperatorAPI.mock.calls).toHaveLength(1)
  })

  it('⭐ 每一步都跑完之后记录整条清掉（⛔ 不留一颗点了会重做的按钮）', async () => {
    const { result } = render()
    act(() => {
      result.current.send('分两步做')
    })
    await settle()
    startPlan(2)
    streams[0].emit(doneStepEvent('step-1'))
    streams[0].emit(doneStepEvent('step-2'))
    streams[0].close()
    await settle()

    expect(store.getOperatorState().resume).toBeNull()
    expect(
      localStorage.getItem('pixelvault.studio.operatorResume.v1.image'),
    ).toBeNull()
  })
})
