import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useBackToClose } from './use-back-to-close'

vi.mock('@/lib/touch', () => ({ isTouchPrimary: () => true }))

/** jsdom 的 history.back() 不发 popstate：手动发一下，模拟系统返回。 */
function systemBack() {
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
}

describe('useBackToClose', () => {
  let push: ReturnType<typeof vi.spyOn>
  let back: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    push = vi.spyOn(window.history, 'pushState')
    back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('开着时压一层历史，系统返回 = 关它', () => {
    const onClose = vi.fn()
    renderHook(() => useBackToClose(true, onClose))
    expect(push).toHaveBeenCalledTimes(1)

    act(() => systemBack())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('叠着开时，返回一次只关最上面那层', () => {
    const closeViewer = vi.fn()
    const closeSheet = vi.fn()
    renderHook(() => useBackToClose(true, closeViewer))
    renderHook(() => useBackToClose(true, closeSheet))

    act(() => systemBack())
    expect(closeSheet).toHaveBeenCalledTimes(1)
    expect(closeViewer).not.toHaveBeenCalled()

    act(() => systemBack())
    expect(closeViewer).toHaveBeenCalledTimes(1)
  })

  it('用界面关掉时把那一层退回去，且那一下不关别的层', () => {
    const closeViewer = vi.fn()
    renderHook(() => useBackToClose(true, closeViewer))
    const sheet = renderHook(({ open }) => useBackToClose(open, vi.fn()), {
      initialProps: { open: true },
    })
    // 让历史顶上是这一层（pushState 被 spy 着，jsdom 仍照常写 state）。
    sheet.rerender({ open: false })
    expect(back).toHaveBeenCalledTimes(1)

    // 退回那一下的 popstate 被吞掉，大图还开着。
    act(() => systemBack())
    expect(closeViewer).not.toHaveBeenCalled()

    act(() => systemBack())
    expect(closeViewer).toHaveBeenCalledTimes(1)
  })

  it('两层一起关（删图连带关菜单）：两层历史都退回去', () => {
    const viewer = renderHook(({ open }) => useBackToClose(open, vi.fn()), {
      initialProps: { open: true },
    })
    const sheet = renderHook(({ open }) => useBackToClose(open, vi.fn()), {
      initialProps: { open: true },
    })
    sheet.rerender({ open: false })
    viewer.rerender({ open: false })
    expect(back).toHaveBeenCalledTimes(2)
  })
})
