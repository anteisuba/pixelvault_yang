import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import zhMessages from '@/messages/zh.json'

const mockSearch = vi.fn()
vi.mock('@/lib/api-client', () => ({
  searchChubCardsAPI: (...a: unknown[]) => mockSearch(...a),
}))

import { useChubLibrary } from './use-chub-library'

function card(fullPath: string) {
  return {
    fullPath,
    name: fullPath,
    tagline: '',
    tags: [],
    avatarUrl: null,
    starCount: null,
    tokenCount: null,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      {children}
    </NextIntlClientProvider>
  )
}

describe('useChubLibrary', () => {
  beforeEach(() => {
    mockSearch.mockReset()
  })

  it('页签没打开不去搜；打开就搜第一页', async () => {
    mockSearch.mockResolvedValue({
      success: true,
      data: { items: [card('a/1')], page: 1, hasMore: false },
    })
    const { result, rerender } = renderHook(
      ({ enabled }) => useChubLibrary(enabled),
      { wrapper, initialProps: { enabled: false } },
    )
    expect(mockSearch).not.toHaveBeenCalled()

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockSearch).toHaveBeenCalledWith(
      { q: '', sort: 'popular', page: 1 },
      expect.any(AbortSignal),
    )
    expect(result.current.items).toHaveLength(1)
  })

  it('接下一页：去重追加；没拿到时只说这一批、重试再接', async () => {
    mockSearch
      .mockResolvedValueOnce({
        success: true,
        data: { items: [card('a/1'), card('a/2')], page: 1, hasMore: true },
      })
      .mockResolvedValueOnce({ success: false, error: 'boom' })
      .mockResolvedValueOnce({
        success: true,
        data: { items: [card('a/2'), card('a/3')], page: 2, hasMore: false },
      })
    const { result } = renderHook(() => useChubLibrary(true), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.moreStatus).toBe('error'))
    expect(result.current.status).toBe('ready')

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.moreStatus).toBeNull())
    expect(result.current.items.map((item) => item.fullPath)).toEqual([
      'a/1',
      'a/2',
      'a/3',
    ])
    expect(result.current.hasMore).toBe(false)
  })

  it('第一页没拿到：整块出错，带说人话的原因；重试重搜', async () => {
    mockSearch
      .mockResolvedValueOnce({
        success: false,
        error: 'upstream',
        i18nKey: 'errors.chubLibrary.unavailable',
      })
      .mockResolvedValueOnce({
        success: true,
        data: { items: [], page: 1, hasMore: false },
      })
    const { result } = renderHook(() => useChubLibrary(true), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe(
      zhMessages.Errors.chubLibrary.unavailable,
    )

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockSearch).toHaveBeenCalledTimes(2)
  })
})
