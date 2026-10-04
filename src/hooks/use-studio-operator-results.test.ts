import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_CLAIM_TTL_MS } from '@/constants/studio-assistant-operator'
import type {
  StudioOperatorResultEntry,
  StudioOperatorResultRun,
} from '@/types/studio-assistant-operator'

/**
 * 结果卡回流的回归闸（v2 §6，commit #10）。
 *
 * 钉四件事：
 *  ① 卡落下的那一瞬间 `resultRun` 里装的是**上一批**（已结账）—— owner 不符不认，
 *    否则点完「确认生成」卡上立刻出现上一轮的图；
 *  ② owner 精确匹配就认账，极速完成的首帧也写进那张卡；
 *  ③ 结账且有图 = 写缩略图 + 入库时刻，指针清掉；
 *  ④ 一张都没出来 = 撤掉卡 + 落一行系统行；那一枪压根没打出去（TTL 到点）同理。
 *
 * ⚠ store 是模块级单例，用例之间必须 `vi.resetModules()` 换一份新的
 * （判据与 `use-studio-operator-store.test.ts` 头注逐字同源）。
 */
type Store = typeof import('@/hooks/use-studio-operator-store')
type Results = typeof import('@/hooks/use-studio-operator-results')

let store: Store
let results: Results

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  store = await import('@/hooks/use-studio-operator-store')
  results = await import('@/hooks/use-studio-operator-results')
  store.claimOperatorThreadScope('account-a:image-natural', 'image')
})

afterEach(() => {
  vi.useRealTimers()
})

const ITEM = { id: 'g1', url: 'https://cdn.test/1.png' }

function run(patch: Partial<StudioOperatorResultRun>): StudioOperatorResultRun {
  const current = store.getOperatorState()
  return {
    total: 2,
    completed: 0,
    failed: 0,
    settled: false,
    items: [],
    owner: {
      threadScope: current.threadScope ?? '',
      localThreadId: current.localThreadId,
      pendingResultId: 'result-1',
    },
    ...patch,
  }
}

function mount(initial: StudioOperatorResultRun | undefined) {
  return renderHook(
    ({ value }: { value: StudioOperatorResultRun | undefined }) =>
      results.useStudioOperatorResults(value),
    { initialProps: { value: initial } },
  )
}

function readEntries() {
  return renderHook(() => store.useStudioOperatorState()).result
}

function pendingCard() {
  store.appendOperatorPendingResult({
    id: 'result-1',
    total: 2,
    request: {
      model: { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
      count: 2,
      specs: { aspectRatio: '3:2', resolution: null, durationSeconds: null },
    },
  })
}

function resultEntry(
  entries: readonly { kind: string }[],
): StudioOperatorResultEntry | undefined {
  return entries.find((entry) => entry.kind === 'result') as
    | StudioOperatorResultEntry
    | undefined
}

describe('useStudioOperatorResults', () => {
  it('⛔ 卡出现之前就结账的那一批不认 —— 否则卡上立刻出现上一轮的图', () => {
    const state = readEntries()
    act(() => pendingCard())

    // 上一批：已经结账、还带着图。
    const previous = run({ settled: true, completed: 2, items: [ITEM] })
    mount({
      ...previous,
      owner: { ...previous.owner!, pendingResultId: 'previous-result' },
    })

    const entry = resultEntry(state.current.entries)
    expect(entry?.items).toEqual([])
    expect(entry?.storedAt).toBeUndefined()
    expect(state.current.pendingResultId).toBe('result-1')
  })

  it('owner精确匹配的首帧已结账批次立即回填，不必观察生成中', () => {
    pendingCard()
    mount(run({ settled: true, completed: 2, items: [ITEM] }))

    expect(resultEntry(store.getOperatorState().entries)).toMatchObject({
      items: [ITEM],
      completed: 2,
      storedAt: expect.any(String),
    })
    expect(store.getOperatorState().pendingResultId).toBeNull()
    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1))
    expect(
      store
        .getOperatorState()
        .entries.filter((entry) => entry.kind === 'system'),
    ).toEqual([])
  })

  it('owner精确匹配的首帧失败立即保留真实失败原因', () => {
    pendingCard()
    mount(run({ settled: true, failed: 2, failureReason: '审核拒绝' }))

    expect(resultEntry(store.getOperatorState().entries)).toBeUndefined()
    expect(store.getOperatorState().pendingResultId).toBeNull()
    expect(store.getOperatorState().entries.at(-1)).toMatchObject({
      code: 'generationFailedWithReason',
      subject: '审核拒绝',
    })
  })

  it('owner匹配的未结账回流把张数写进那张卡', () => {
    const state = readEntries()
    act(() => pendingCard())

    const view = mount(run({ total: 3, completed: 1 }))
    view.rerender({ value: run({ total: 3, completed: 1 }) })

    const entry = resultEntry(state.current.entries)
    expect(entry?.total).toBe(3)
    expect(entry?.completed).toBe(1)
    // 还没结账 —— 指针留着，卡还是生成中态。
    expect(state.current.pendingResultId).toBe('result-1')
    expect(entry?.items).toEqual([])
  })

  it('结账且有图：写缩略图 + 入库时刻，指针清掉', () => {
    const state = readEntries()
    act(() => pendingCard())

    const view = mount(run({ completed: 1 }))
    act(() => {
      view.rerender({
        value: run({ settled: true, completed: 1, failed: 1, items: [ITEM] }),
      })
    })

    const entry = resultEntry(state.current.entries)
    // ⚠ 部分失败照样入库：出来几张写几张。
    expect(entry?.items).toEqual([ITEM])
    expect(entry?.completed).toBe(1)
    expect(entry?.storedAt).toBeTruthy()
    expect(state.current.pendingResultId).toBeNull()
  })

  it('一张都没出来：撤掉卡，落一行系统行', () => {
    const state = readEntries()
    act(() => pendingCard())

    const view = mount(run({ completed: 0 }))
    act(() => {
      view.rerender({
        value: run({ settled: true, completed: 0, failed: 2, items: [] }),
      })
    })

    expect(resultEntry(state.current.entries)).toBeUndefined()
    expect(state.current.pendingResultId).toBeNull()
    const system = state.current.entries.at(-1)
    expect(system?.kind).toBe('system')
    expect(system && 'code' in system ? system.code : null).toBe(
      'generationFailed',
    )
  })

  it('整批没出且宿主说得出原因：系统行把原因带上', () => {
    const state = readEntries()
    act(() => pendingCard())

    const view = mount(run({ completed: 0 }))
    act(() => {
      view.rerender({
        value: run({
          settled: true,
          completed: 0,
          failed: 1,
          items: [],
          failureReason: '服务商的内容审核未通过',
        }),
      })
    })

    const system = state.current.entries.at(-1)
    expect(system).toMatchObject({
      kind: 'system',
      code: 'generationFailedWithReason',
      subject: '服务商的内容审核未通过',
    })
  })

  it('那一枪压根没打出去（被生成键的闸挡下）：TTL 到点撤卡 + 系统行', () => {
    const state = readEntries()
    act(() => pendingCard())

    mount(undefined)
    act(() => {
      vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1)
    })

    expect(resultEntry(state.current.entries)).toBeUndefined()
    expect(state.current.pendingResultId).toBeNull()
    const system = state.current.entries.at(-1)
    expect(system && 'code' in system ? system.code : null).toBe(
      'generationFailed',
    )
  })

  it('切到另一工作区后，旧批次结账不会回填同 ID 的新卡', () => {
    pendingCard()
    const oldRun = run({ completed: 1 })
    const view = mount(oldRun)

    act(() => {
      store.claimOperatorThreadScope('account-a:image-tags', 'image')
      pendingCard()
      view.rerender({
        value: { ...oldRun, settled: true, completed: 2, items: [ITEM] },
      })
    })

    const current = store.getOperatorState()
    expect(resultEntry(current.entries)?.items).toEqual([])
    expect(current.pendingResultId).toBe('result-1')
  })

  it('新对话不能继承上一段对话对批次的认领', () => {
    pendingCard()
    const oldRun = run({ completed: 1 })
    const view = mount(oldRun)

    act(() => {
      store.resetOperatorThread()
      pendingCard()
      view.rerender({
        value: { ...oldRun, settled: true, completed: 2, items: [ITEM] },
      })
    })

    expect(resultEntry(store.getOperatorState().entries)?.items).toEqual([])
    expect(store.getOperatorState().pendingResultId).toBe('result-1')
  })

  it('已排入队列的旧超时回调不会删除新工作区的同 ID 卡片', () => {
    const setTimeout = vi.spyOn(window, 'setTimeout')
    pendingCard()
    mount(undefined)
    const timeout = setTimeout.mock.calls.find(
      ([, delay]) => delay === STUDIO_OPERATOR_CLAIM_TTL_MS,
    )?.[0]
    expect(typeof timeout).toBe('function')

    act(() => {
      store.claimOperatorThreadScope('account-a:image-tags', 'image')
      pendingCard()
      if (typeof timeout === 'function') timeout()
    })

    expect(resultEntry(store.getOperatorState().entries)).toBeDefined()
    expect(store.getOperatorState().pendingResultId).toBe('result-1')
    expect(
      store
        .getOperatorState()
        .entries.filter((entry) => entry.kind === 'system'),
    ).toEqual([])
    setTimeout.mockRestore()
  })

  it('新对话不会认领旧对话仍在运行的全局批次', () => {
    pendingCard()
    const oldRun = run({ total: 4, completed: 2 })
    store.resetOperatorThread()
    pendingCard()
    const view = mount(oldRun)

    act(() => {
      view.rerender({
        value: { ...oldRun, settled: true, completed: 4, items: [ITEM] },
      })
    })

    const current = store.getOperatorState()
    expect(resultEntry(current.entries)?.total).toBe(2)
    expect(resultEntry(current.entries)?.completed).toBe(0)
    expect(resultEntry(current.entries)?.items).toEqual([])
    expect(current.pendingResultId).toBe('result-1')
  })

  it('手动生成的无来源批次不会认领助手卡，未认领卡仍按 TTL 交代失败', () => {
    pendingCard()
    mount(
      run({
        owner: undefined,
        total: 4,
        completed: 2,
        settled: true,
        items: [ITEM],
      }),
    )

    expect(resultEntry(store.getOperatorState().entries)?.completed).toBe(0)
    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1))

    expect(resultEntry(store.getOperatorState().entries)).toBeUndefined()
    expect(store.getOperatorState().entries.at(-1)).toMatchObject({
      code: 'generationFailed',
    })
  })

  it('已经认领的长批次超过 TTL 仍等待结账', () => {
    pendingCard()
    mount(run({ completed: 1 }))

    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1))

    expect(resultEntry(store.getOperatorState().entries)).toBeDefined()
    expect(store.getOperatorState().pendingResultId).toBe('result-1')
    expect(
      store
        .getOperatorState()
        .entries.filter((entry) => entry.kind === 'system'),
    ).toEqual([])
  })

  it('切台手动生成替换全局批次后，返回原台的卡重新计 TTL 并通报回流中断', () => {
    pendingCard()
    const view = mount(run({ completed: 1 }))
    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1))

    act(() => {
      store.claimOperatorThreadScope('account-a:image-tags', 'image')
      view.rerender({ value: run({ owner: undefined, total: 4 }) })
    })
    act(() => {
      store.claimOperatorThreadScope('account-a:image-natural', 'image')
      view.rerender({ value: undefined })
    })

    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS - 1))
    expect(resultEntry(store.getOperatorState().entries)).toBeDefined()
    act(() => vi.advanceTimersByTime(2))

    expect(resultEntry(store.getOperatorState().entries)).toBeUndefined()
    expect(store.getOperatorState().pendingResultId).toBeNull()
    expect(store.getOperatorState().entries.at(-1)).toMatchObject({
      code: 'generationResultInterrupted',
    })
  })

  it('来源短暂消失后在 TTL 内恢复，同批次继续等待并正常结账', () => {
    pendingCard()
    const active = run({ completed: 1 })
    const view = mount(active)
    act(() => {
      view.rerender({ value: undefined })
      vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS / 2)
    })
    act(() => view.rerender({ value: active }))
    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1))
    expect(store.getOperatorState().pendingResultId).toBe('result-1')

    act(() =>
      view.rerender({
        value: { ...active, settled: true, completed: 2, items: [ITEM] },
      }),
    )

    expect(resultEntry(store.getOperatorState().entries)?.items).toEqual([ITEM])
    expect(store.getOperatorState().pendingResultId).toBeNull()
  })

  it('A/B均助手生成后保留两张pending身份，A丢来源准确通报，B同owner继续等', () => {
    pendingCard()
    const naturalRun = run({ completed: 1 })
    const view = mount(naturalRun)
    let tagsRun = naturalRun
    act(() => {
      store.claimOperatorThreadScope('account-a:image-tags', 'image')
      pendingCard()
      tagsRun = run({ completed: 1 })
      view.rerender({ value: tagsRun })
    })
    act(() => {
      store.claimOperatorThreadScope('account-a:image-natural', 'image')
      view.rerender({ value: tagsRun })
    })
    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1))
    expect(store.getOperatorState().pendingResultId).toBeNull()
    expect(store.getOperatorState().entries.at(-1)).toMatchObject({
      code: 'generationResultInterrupted',
    })

    act(() => {
      store.claimOperatorThreadScope('account-a:image-tags', 'image')
      view.rerender({ value: tagsRun })
    })
    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1))
    expect(store.getOperatorState().pendingResultId).toBe('result-1')
    expect(
      store
        .getOperatorState()
        .entries.filter((entry) => entry.kind === 'system'),
    ).toEqual([])
    act(() =>
      view.rerender({
        value: { ...tagsRun, settled: true, completed: 2, items: [ITEM] },
      }),
    )
    expect(resultEntry(store.getOperatorState().entries)?.items).toEqual([ITEM])
    expect(store.getOperatorState().pendingResultId).toBeNull()
  })
})
