import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'

import { useSplitModelOptions } from '@/hooks/use-split-model-options'

interface TestOption {
  optionId: string
  sourceType: string
  freeTier?: boolean
}

describe('useSplitModelOptions', () => {
  it('returns three empty groups for empty input', () => {
    const { result } = renderHook(() => useSplitModelOptions<TestOption>([]))
    expect(result.current).toEqual({ saved: [], platform: [], locked: [] })
  })

  it('routes sourceType === "saved" to saved group regardless of freeTier', () => {
    const opts: TestOption[] = [
      { optionId: '1', sourceType: 'saved' },
      { optionId: '2', sourceType: 'saved', freeTier: true },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.saved.map((o) => o.optionId)).toEqual(['1', '2'])
    expect(result.current.platform).toEqual([])
    expect(result.current.locked).toEqual([])
  })

  it('routes freeTier non-saved options to platform group', () => {
    const opts: TestOption[] = [
      { optionId: '1', sourceType: 'workspace', freeTier: true },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.platform.map((o) => o.optionId)).toEqual(['1'])
    expect(result.current.saved).toEqual([])
    expect(result.current.locked).toEqual([])
  })

  it('routes non-saved non-freeTier options to locked group', () => {
    const opts: TestOption[] = [
      { optionId: '1', sourceType: 'workspace' },
      { optionId: '2', sourceType: 'workspace', freeTier: false },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.locked.map((o) => o.optionId)).toEqual(['1', '2'])
  })

  it('preserves input order within each group', () => {
    const opts: TestOption[] = [
      { optionId: 'a', sourceType: 'saved' },
      { optionId: 'b', sourceType: 'workspace', freeTier: true },
      { optionId: 'c', sourceType: 'workspace' },
      { optionId: 'd', sourceType: 'saved' },
      { optionId: 'e', sourceType: 'workspace', freeTier: true },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.saved.map((o) => o.optionId)).toEqual(['a', 'd'])
    expect(result.current.platform.map((o) => o.optionId)).toEqual(['b', 'e'])
    expect(result.current.locked.map((o) => o.optionId)).toEqual(['c'])
  })

  it('returns ref-stable groups when the same input array reference is passed', () => {
    const opts: TestOption[] = [{ optionId: '1', sourceType: 'saved' }]
    const { result, rerender } = renderHook(
      ({ items }) => useSplitModelOptions(items),
      { initialProps: { items: opts } },
    )
    const first = result.current
    rerender({ items: opts })
    expect(result.current).toBe(first)
  })
})
