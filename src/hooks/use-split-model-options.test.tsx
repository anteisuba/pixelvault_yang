import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'

import { useSplitModelOptions } from '@/hooks/use-split-model-options'

interface TestOption {
  optionId: string
  sourceType: string
  providerKeyId?: string
}

describe('useSplitModelOptions', () => {
  it('Runner uses server credentials without unlocking other keyless providers', () => {
    const opts = [
      { optionId: 'runner', sourceType: 'workspace', adapterType: 'runner' },
      { optionId: 'fal', sourceType: 'workspace', adapterType: 'fal' },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.saved).toEqual([opts[0]])
    expect(result.current.locked).toEqual([opts[1]])
  })
  it('returns two empty groups for empty input', () => {
    const { result } = renderHook(() => useSplitModelOptions<TestOption>([]))
    expect(result.current).toEqual({ saved: [], locked: [] })
  })

  it('routes sourceType === "saved" to the saved group', () => {
    const opts: TestOption[] = [
      { optionId: '1', sourceType: 'saved' },
      { optionId: '2', sourceType: 'saved' },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.saved.map((o) => o.optionId)).toEqual(['1', '2'])
    expect(result.current.locked).toEqual([])
  })

  it('counts provider-level key coverage as configured, not locked', () => {
    const opts: TestOption[] = [
      { optionId: '1', sourceType: 'workspace', providerKeyId: 'k1' },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.saved.map((o) => o.optionId)).toEqual(['1'])
    expect(result.current.locked).toEqual([])
  })

  it('routes keyless workspace options to the locked group', () => {
    const opts: TestOption[] = [
      { optionId: '1', sourceType: 'workspace' },
      { optionId: '2', sourceType: 'workspace' },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.locked.map((o) => o.optionId)).toEqual(['1', '2'])
  })

  it('preserves input order within each group', () => {
    const opts: TestOption[] = [
      { optionId: 'a', sourceType: 'saved' },
      { optionId: 'b', sourceType: 'workspace', providerKeyId: 'k1' },
      { optionId: 'c', sourceType: 'workspace' },
      { optionId: 'd', sourceType: 'saved' },
    ]
    const { result } = renderHook(() => useSplitModelOptions(opts))
    expect(result.current.saved.map((o) => o.optionId)).toEqual(['a', 'b', 'd'])
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
