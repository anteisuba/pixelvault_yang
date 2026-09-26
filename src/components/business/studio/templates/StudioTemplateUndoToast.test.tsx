import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DURATION_MS } from '@/constants/motion'
import { STUDIO_TEMPLATE_UNDO_MS } from '@/constants/studio'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioTemplateUndoToast } from './StudioTemplateUndoToast'

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('「已套用 · 撤销」提示条', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('5 秒后先淡出一拍，淡完才摘；指针停在上面时不计时', () => {
    const onDismiss = vi.fn()
    render(
      <StudioTemplateUndoToast
        name="雨夜人像"
        onUndo={vi.fn()}
        onDismiss={onDismiss}
      />,
    )
    const toast = screen.getByRole('status')
    fireEvent.pointerEnter(toast)
    advance(STUDIO_TEMPLATE_UNDO_MS * 2)
    expect(toast).not.toHaveClass('fade-out-0')
    fireEvent.pointerLeave(toast)
    advance(STUDIO_TEMPLATE_UNDO_MS)
    expect(toast).toHaveClass('fade-out-0', 'pointer-events-none')
    expect(onDismiss).not.toHaveBeenCalled()
    advance(DURATION_MS.base)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('点「撤销」当场换回，提示条同样淡出再摘', () => {
    const onUndo = vi.fn()
    const onDismiss = vi.fn()
    render(
      <StudioTemplateUndoToast
        name="雨夜人像"
        onUndo={onUndo}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveClass('fade-out-0')
    advance(DURATION_MS.base)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
