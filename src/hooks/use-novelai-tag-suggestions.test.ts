import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_MODELS } from '@/constants/models/enum'
vi.mock('@/lib/api-client/novelai-tags', () => ({
  getNovelAiTagSuggestionsAPI: vi.fn(),
}))
import { getNovelAiTagSuggestionsAPI } from '@/lib/api-client/novelai-tags'
import { useNovelAiTagSuggestions } from './use-novelai-tag-suggestions'
const api = vi.mocked(getNovelAiTagSuggestionsAPI)
const model = AI_MODELS.NOVELAI_V5_CURATED
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
})
afterEach(() => vi.useRealTimers())
describe('official tag query lifecycle', () => {
  it('debounces typing and suppresses old query results immediately', async () => {
    api.mockResolvedValue({ tags: [{ tag: 'denia (wuthering waves)' }] })
    const { result, rerender } = renderHook(
      ({ query }) => useNovelAiTagSuggestions(model, query, true),
      { initialProps: { query: 'de' } },
    )
    rerender({ query: 'denia' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0][0].prompt).toBe('denia')
    expect(result.current.tags[0].tag).toContain('denia')
    rerender({ query: 'miku' })
    expect(result.current.tags).toEqual([])
    expect(result.current.loading).toBe(true)
  })
  it('aborts and discards responses when the selected model changes', async () => {
    let resolve!: (value: { tags: { tag: string }[] }) => void
    api.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { result, rerender } = renderHook(
      ({ selected }) => useNovelAiTagSuggestions(selected, 'denia', true),
      {
        initialProps: {
          selected: model as typeof model | AI_MODELS.NOVELAI_V5_FULL,
        },
      },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    const signal = api.mock.calls[0][1]
    rerender({ selected: AI_MODELS.NOVELAI_V5_FULL })
    expect(signal.aborted).toBe(true)
    await act(async () => {
      resolve({ tags: [{ tag: 'stale curated tag' }] })
    })
    expect(result.current.tags).toEqual([])
  })
  it('returns explicit errors while leaving suggestions empty', async () => {
    api.mockRejectedValue(new Error('MISSING_API_KEY'))
    const { result } = renderHook(() =>
      useNovelAiTagSuggestions(model, 'denia', true),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current.error).toBe('MISSING_API_KEY')
    expect(result.current.tags).toEqual([])
  })
  it('does not query without a selected NAI model or input focus', async () => {
    renderHook(() => useNovelAiTagSuggestions(undefined, 'denia', true))
    renderHook(() => useNovelAiTagSuggestions(model, 'denia', false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(api).not.toHaveBeenCalled()
  })
})
