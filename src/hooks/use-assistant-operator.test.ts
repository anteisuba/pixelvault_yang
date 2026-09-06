import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'

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

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
}))

/**
 * 落笔的那几只手由宿主给（P4-C）。这一层验的是「状态机怎么收尾」，
 * 表单侧一个都不需要真的动，所以整份桩成空手。
 */
vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: 'image' as const,
    buildSnapshot: () => ({ prompt: '', availableModels: [] }),
    referenceLimit: 4,
    open: true,
    setOpen: () => {},
    apply: {
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
    expect(store.getOperatorState().errorText).toBe('模型没回话')
  })
})
