import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Progress } from './progress'

function indicator() {
  return document.querySelector(
    '[data-slot="progress-indicator"]',
  ) as HTMLElement | null
}

describe('Progress', () => {
  // 回归锚点：`value` 曾被解构掉只喂给指示器位移、从没传给 Radix Root，于是全站
  // 的进度条都是没有完成度的 role="progressbar"。视觉正确不能证明这条。
  it('forwards value to the root so assistive tech can read completion', () => {
    render(<Progress value={42} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('data-state', 'loading')
  })

  it('keeps the indicator transform in step with the reported value', () => {
    render(<Progress value={42} />)
    expect(indicator()?.style.transform).toBe('translateX(-58%)')
  })

  it('marks a full bar complete', () => {
    render(<Progress value={100} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'data-state',
      'complete',
    )
    expect(indicator()?.style.transform).toBe('translateX(-0%)')
  })

  it('scales both the a11y max and the indicator to a custom max', () => {
    render(<Progress value={25} max={50} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(bar).toHaveAttribute('aria-valuemax', '50')
    // 25/50 = 50%：位移必须跟着 max 走，否则屏幕阅读器报 50% 而肉眼看到 25%。
    expect(indicator()?.style.transform).toBe('translateX(-50%)')
  })

  it('renders an indeterminate bar when no value is given', () => {
    render(<Progress />)
    const bar = screen.getByRole('progressbar')
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar).toHaveAttribute('data-state', 'indeterminate')
    expect(indicator()?.style.transform).toBe('translateX(-100%)')
  })
})
