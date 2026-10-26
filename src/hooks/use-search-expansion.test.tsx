import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const expandSearchQueryAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({ expandSearchQueryAPI }))

import { useSearchExpansion } from './use-search-expansion'

beforeEach(() => {
  vi.useFakeTimers()
  expandSearchQueryAPI.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useSearchExpansion', () => {
  it('asks once typing pauses, and only shows words for the current query', async () => {
    expandSearchQueryAPI.mockResolvedValue(['rain'])
    const { result, rerender } = renderHook(
      ({ query }) => useSearchExpansion(query),
      { initialProps: { query: '下' } },
    )
    rerender({ query: '下雨' })
    expect(result.current).toEqual([])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(expandSearchQueryAPI).toHaveBeenCalledTimes(1)
    expect(expandSearchQueryAPI).toHaveBeenCalledWith(
      '下雨',
      expect.any(AbortSignal),
    )
    expect(result.current).toEqual(['rain'])

    rerender({ query: '下雨天' })
    expect(result.current).toEqual([])
    rerender({ query: '' })
    expect(result.current).toEqual([])
  })
})
