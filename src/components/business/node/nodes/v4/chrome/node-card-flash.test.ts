import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NODE_V4_CONNECT_TO_SHOT } from '@/constants/node-studio'

import {
  flashNodeCard,
  resetNodeCardFlash,
  useNodeCardFlash,
} from './node-card-flash'

afterEach(() => {
  resetNodeCardFlash()
  vi.useRealTimers()
})

describe('连完那一下高亮（spec §1.13 尾句）', () => {
  it('点的人和亮的人不是同一张卡：亮一小会儿就自己灭', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useNodeCardFlash('s_1'))
    expect(result.current).toBe(false)
    act(() => flashNodeCard('s_1'))
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(NODE_V4_CONNECT_TO_SHOT.highlightMs + 1)
    })
    expect(result.current).toBe(false)
  })

  it('只亮被点的那一张（⛔ 不把整片画布点亮）', () => {
    vi.useFakeTimers()
    const other = renderHook(() => useNodeCardFlash('s_2'))
    act(() => flashNodeCard('s_1'))
    expect(other.result.current).toBe(false)
  })

  it('连点两次 = 重新计时，⛔ 不叠两个定时器', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useNodeCardFlash('s_1'))
    act(() => flashNodeCard('s_1'))
    act(() => {
      vi.advanceTimersByTime(NODE_V4_CONNECT_TO_SHOT.highlightMs - 10)
    })
    act(() => flashNodeCard('s_1'))
    act(() => {
      vi.advanceTimersByTime(NODE_V4_CONNECT_TO_SHOT.highlightMs - 10)
    })
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(result.current).toBe(false)
  })
})
