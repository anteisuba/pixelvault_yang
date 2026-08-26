import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCountPulse } from '@/hooks/node/use-count-pulse'

describe('useCountPulse', () => {
  it('starts at 0 and stays at 0 across renders that never change the count', () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useCountPulse(count),
      { initialProps: { count: 3 } },
    )
    expect(result.current).toBe(0)

    rerender({ count: 3 })
    expect(result.current).toBe(0)
  })

  it('does not pulse on first mount even when the initial count is already > 0 (no false pulse on data load)', () => {
    const { result } = renderHook(
      ({ count }: { count: number }) => useCountPulse(count),
      { initialProps: { count: 12 } },
    )
    expect(result.current).toBe(0)
  })

  it('bumps the key by 1 each time the count increases', () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useCountPulse(count),
      { initialProps: { count: 0 } },
    )
    expect(result.current).toBe(0)

    rerender({ count: 1 })
    expect(result.current).toBe(1)

    rerender({ count: 4 })
    expect(result.current).toBe(2)
  })

  it('does not bump the key when the count decreases', () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useCountPulse(count),
      { initialProps: { count: 5 } },
    )

    rerender({ count: 2 })
    expect(result.current).toBe(0)

    // A later increase still bumps normally — a decrease doesn't poison the
    // tracked "last count" baseline.
    rerender({ count: 3 })
    expect(result.current).toBe(1)
  })

  it('is stable across an unrelated rerender that repeats the same count', () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useCountPulse(count),
      { initialProps: { count: 1 } },
    )

    rerender({ count: 2 })
    expect(result.current).toBe(1)

    // Repeating the same value (e.g. a sibling prop changed, count didn't)
    // must not bump again.
    rerender({ count: 2 })
    expect(result.current).toBe(1)
  })
})
