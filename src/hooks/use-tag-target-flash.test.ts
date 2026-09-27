import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TAG_ADD_ACK_MS } from '@/constants/motion'
import { flashTagTarget, useTagTargetFlash } from '@/hooks/use-tag-target-flash'

describe('useTagTargetFlash', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('lights the character that just got tags, then goes dark', () => {
    const { result } = renderHook(() => useTagTargetFlash())
    expect(result.current).toBeNull()
    act(() => flashTagTarget(1))
    expect(result.current).toBe(1)
    act(() => {
      vi.advanceTimersByTime(TAG_ADD_ACK_MS)
    })
    expect(result.current).toBeNull()
  })
})
