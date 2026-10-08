import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { toastMock } = vi.hoisted(() => ({
  toastMock: { loading: vi.fn(), dismiss: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: toastMock }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { SLOW_LOADING_NOTICE_MS } from '@/constants/motion'

import { useSlowLoadingNotice } from './use-slow-loading-notice'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSlowLoadingNotice', () => {
  it('shows the bottom bar after 6 seconds of waiting and clears it when data arrives', () => {
    const { rerender } = renderHook(
      ({ loading }) => useSlowLoadingNotice(loading),
      { initialProps: { loading: true } },
    )
    vi.advanceTimersByTime(SLOW_LOADING_NOTICE_MS - 1)
    expect(toastMock.loading).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(toastMock.loading).toHaveBeenCalledWith(
      'slowLoading',
      expect.objectContaining({ duration: Infinity }),
    )
    const id = toastMock.loading.mock.calls[0][1].id
    rerender({ loading: false })
    expect(toastMock.dismiss).toHaveBeenCalledWith(id)
  })

  it('never shows the bar when the data comes back in time', () => {
    const { rerender } = renderHook(
      ({ loading }) => useSlowLoadingNotice(loading),
      { initialProps: { loading: true } },
    )
    vi.advanceTimersByTime(1000)
    rerender({ loading: false })
    vi.advanceTimersByTime(SLOW_LOADING_NOTICE_MS)
    expect(toastMock.loading).not.toHaveBeenCalled()
  })
})
