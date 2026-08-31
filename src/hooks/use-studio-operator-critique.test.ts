import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_CLAIM_TTL_MS } from '@/constants/studio-assistant-operator'
import type { GenerationRecord } from '@/types'
import type { AssistantOperatorResult } from '@/types/assistant-operator'

/**
 * 看图闭环的**观察端**（P3-C，拍板 4）。
 *
 * 钉三件事：
 *  ① **没领票就什么都不做** —— 用户自己发的生成跑完，助手一声不吭（拍板 4 的
 *    「用户自己发的不打扰」在这里是可观察的）；
 *  ② 领了票的那一枪跑完 → **投递一次，且只一次**。轮询还会再来很多轮，每轮投
 *    一次的代价是每次一份视觉 token；
 *  ③ 票过期就作废 —— 那一枪没打出去时留下的票不许飘到用户下一次自己发的那枪上。
 */

const activeRun = vi.hoisted(() => ({ current: null as unknown }))
/**
 * ⚠ P4-C 起这颗 hook 读的是**可选的那个**（`useStudioGenOptional`）：面板也挂在
 * `/studio/lora` 上，而那条路由故意不挂 `<StudioProvider>` —— 会抛的那版在装配台
 * 上会把整颗面板打红。桩要跟着改名，否则 hook 拿到 `undefined` 并静默失效。
 */
vi.mock('@/contexts/studio-context', () => ({
  useStudioGenOptional: () => ({ activeRun: activeRun.current }),
}))

type Store = typeof import('@/hooks/use-studio-operator-store')
type CritiqueHook = typeof import('@/hooks/use-studio-operator-critique')

let store: Store
let hook: CritiqueHook

/**
 * ⚠ store 是**模块级单例**（票就住在里面）。用例之间必须换一份新的模块实例，
 * 否则上一个用例的票会漏到下一个 —— `vi.resetModules()` + 动态 import 是唯一
 * 真的能做到这件事的写法。两个模块必须在同一次 reset 之后一起 import，
 * 不然 hook 拿到的是**另一份** store（票写进去了，观察端看不见）。
 */
beforeEach(async () => {
  vi.resetModules()
  activeRun.current = null
  store = await import('@/hooks/use-studio-operator-store')
  hook = await import('@/hooks/use-studio-operator-critique')
})

const GENERATION = {
  id: 'gen-1',
  url: 'https://cdn.example.com/a.png',
  model: 'Seedream 4',
  prompt: 'a girl under a red umbrella',
} as unknown as GenerationRecord

function run(items: { id: string; status: string; generation?: unknown }[]) {
  return {
    id: 'run-1',
    items: items.map((item) => ({
      id: item.id,
      status: item.status,
      generation: item.generation ?? null,
    })),
  }
}

function mount() {
  const onResult = vi.fn<(result: AssistantOperatorResult) => void>()
  const view = renderHook(() => hook.useStudioOperatorCritique({ onResult }))
  return { onResult, rerender: view.rerender }
}

describe('看图闭环 · 观察端', () => {
  it('没领票时什么都不投 —— 用户自己发的生成跑完，助手不打扰', () => {
    const { onResult, rerender } = mount()

    activeRun.current = run([
      { id: 'theirs', status: 'completed', generation: GENERATION },
    ])
    rerender()

    expect(onResult).not.toHaveBeenCalled()
  })

  it('领票的那一枪跑完后投递一次，且只投一次', () => {
    const { onResult, rerender } = mount()

    // 领票：此刻队列是空的（按钮那边同步读的就是这份）。
    store.claimOperatorGeneration()

    activeRun.current = run([{ id: 'mine', status: 'generating' }])
    rerender()
    expect(onResult).not.toHaveBeenCalled()

    activeRun.current = run([
      { id: 'mine', status: 'completed', generation: GENERATION },
    ])
    rerender()
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith({
      url: GENERATION.url,
      generationId: 'gen-1',
      modelLabel: 'Seedream 4',
      prompt: 'a girl under a red umbrella',
    })

    // 轮询继续推同样的结果 —— ⛔ 不许再投一次。
    activeRun.current = run([
      { id: 'mine', status: 'completed', generation: GENERATION },
    ])
    rerender()
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(store.getOperatorClaim()).toBeNull()
  })

  it('领票之前就在跑的那些不算这一枪', () => {
    const { onResult, rerender } = mount()

    activeRun.current = run([{ id: 'older', status: 'generating' }])
    rerender()
    // 领票时 store 里已经记下了 `older`（观察端每次都报一份）。
    store.claimOperatorGeneration()

    activeRun.current = run([
      { id: 'older', status: 'completed', generation: GENERATION },
    ])
    rerender()
    expect(onResult).not.toHaveBeenCalled()
  })

  it('票过期就扔掉 —— 不会飘到用户随后自己发的那一枪上', () => {
    vi.useFakeTimers()
    try {
      const { onResult, rerender } = mount()
      store.claimOperatorGeneration()

      vi.advanceTimersByTime(STUDIO_OPERATOR_CLAIM_TTL_MS + 1)
      activeRun.current = run([
        { id: 'theirs', status: 'completed', generation: GENERATION },
      ])
      rerender()

      expect(onResult).not.toHaveBeenCalled()
      expect(store.getOperatorClaim()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('这一枪全失败时不投 —— 没有图就没有评价', () => {
    const { onResult, rerender } = mount()
    store.claimOperatorGeneration()

    activeRun.current = run([{ id: 'mine', status: 'failed' }])
    rerender()

    expect(onResult).not.toHaveBeenCalled()
    // 票照样销掉：这一枪已经有结局了，⛔ 别留着它去认领下一枪。
    expect(store.getOperatorClaim()).toBeNull()
  })
})
