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
 *  ① 卡落下的那一瞬间 `resultRun` 里装的是**上一批**（已结账）—— ⛔ 不认，
 *    否则点完「确认生成」卡上立刻出现上一轮的图；
 *  ② 见过一次未结账的回流之后才认账，随后把张数写进那张卡；
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
})

afterEach(() => {
  vi.useRealTimers()
})

const ITEM = { id: 'g1', url: 'https://cdn.test/1.png' }

function run(patch: Partial<StudioOperatorResultRun>): StudioOperatorResultRun {
  return {
    total: 2,
    completed: 0,
    failed: 0,
    settled: false,
    items: [],
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
    mount(run({ settled: true, completed: 2, items: [ITEM] }))

    const entry = resultEntry(state.current.entries)
    expect(entry?.items).toEqual([])
    expect(entry?.storedAt).toBeUndefined()
    expect(state.current.pendingResultId).toBe('result-1')
  })

  it('见过未结账的回流之后才认账，张数写进那张卡', () => {
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
})
