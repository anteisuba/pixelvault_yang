import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_SHELL_SWIPE } from '@/constants/studio-shell'

import { useStudioBenchSwipe } from './StudioShellBench'

vi.mock('@/i18n/navigation', () => ({
  Link: () => null,
  useRouter: () => ({ push: vi.fn() }),
}))

function wheel(target: HTMLElement, deltaX: number, deltaY = 0) {
  target.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY }))
}

function mount(activeId: string, enabled = true) {
  const content = document.createElement('div')
  document.body.append(content)
  const onSwitch = vi.fn()
  renderHook(() =>
    useStudioBenchSwipe({
      contentRef: { current: content },
      activeId,
      enabled,
      onSwitch,
    }),
  )
  return { content, onSwitch }
}

describe('useStudioBenchSwipe（9f-4 两指滑换台）', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('往左滑过门槛换到下一个台，一次手势只换一格', () => {
    const { content, onSwitch } = mount('image')
    wheel(content, STUDIO_SHELL_SWIPE.thresholdPx / 2)
    expect(onSwitch).not.toHaveBeenCalled()
    wheel(content, STUDIO_SHELL_SWIPE.thresholdPx)
    wheel(content, STUDIO_SHELL_SWIPE.thresholdPx * 3)
    expect(onSwitch).toHaveBeenCalledTimes(1)
    expect(onSwitch.mock.calls[0][0].id).toBe('lora')
  })

  it('停手之后才算下一次手势；往右滑回上一个，到头不换', () => {
    vi.useFakeTimers()
    const { content, onSwitch } = mount('lora')
    wheel(content, -STUDIO_SHELL_SWIPE.thresholdPx * 2)
    expect(onSwitch.mock.calls[0][0].id).toBe('image')
    vi.advanceTimersByTime(STUDIO_SHELL_SWIPE.idleMs + 1)
    wheel(content, -STUDIO_SHELL_SWIPE.thresholdPx * 2)
    expect(onSwitch).toHaveBeenCalledTimes(2)
  })

  it('竖着滚、画布台、没开都不换', () => {
    const vertical = mount('image')
    wheel(vertical.content, STUDIO_SHELL_SWIPE.thresholdPx * 2, 400)
    expect(vertical.onSwitch).not.toHaveBeenCalled()

    const canvas = mount('canvas')
    wheel(canvas.content, -STUDIO_SHELL_SWIPE.thresholdPx * 2)
    expect(canvas.onSwitch).not.toHaveBeenCalled()

    const off = mount('image', false)
    wheel(off.content, STUDIO_SHELL_SWIPE.thresholdPx * 2)
    expect(off.onSwitch).not.toHaveBeenCalled()
  })
})
