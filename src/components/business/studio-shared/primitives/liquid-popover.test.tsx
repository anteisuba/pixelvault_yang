import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LIQUID_POPOVER } from '@/constants/motion'

import { LiquidPopoverLayer, useLiquidPopover } from './liquid-popover'

/** Radix 的两层：定好位的 popper 外壳 + 带 `data-state` 的弹层本体。 */
function Harness({
  open,
  positioned = true,
}: {
  open: boolean
  positioned?: boolean
}) {
  const { attach, className, style } = useLiquidPopover(true)
  return (
    <div
      data-radix-popper-content-wrapper=""
      style={{
        transform: positioned ? 'translate(10px, 20px)' : 'translate(0, -200%)',
      }}
    >
      <div
        ref={attach}
        data-testid="popover"
        data-state={open ? 'open' : 'closed'}
        className={className}
        style={style}
      >
        body
      </div>
    </div>
  )
}

const shape = () =>
  document.querySelector<HTMLElement>('[data-liquid-popover-shape]')

describe('useLiquidPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing until a host mounts the shared shape', () => {
    const { getByTestId } = render(<Harness open />)
    expect(getByTestId('popover').dataset.liquid).toBeUndefined()
  })

  // ⚠ 后台页 rAF 冻结时一帧都不会来 —— 靠定时器落到静止档，⛔ 不留一颗被裁成
  // `inset(50%)` 的隐形弹层。
  it('settles to rest on the timer and hands the skin back', async () => {
    const { getByTestId } = render(
      <>
        <LiquidPopoverLayer />
        <Harness open />
      </>,
    )
    const popover = getByTestId('popover')
    expect(popover.dataset.liquid).toBe('moving')
    // ⚠ 弹层底座的 `duration-*` 会让皮肤与裁剪都走 200ms 过渡 —— 打开后「闪一下」。
    expect(popover).toHaveClass('transition-none')

    await act(async () => {
      vi.advanceTimersByTime(LIQUID_POPOVER.restFallbackMs * 3)
    })
    expect(popover.dataset.liquid).toBe('rest')
    expect(popover.style.clipPath).toBe('')
    expect(shape()?.style.visibility).toBe('')
  })

  it('keeps waiting while Radix has not positioned the popover yet', async () => {
    const { getByTestId } = render(
      <>
        <LiquidPopoverLayer />
        <Harness open positioned={false} />
      </>,
    )
    await act(async () => {
      vi.advanceTimersByTime(LIQUID_POPOVER.restFallbackMs * 3)
    })
    expect(getByTestId('popover').dataset.liquid).toBe('moving')
  })

  it('retracts into the chip on close and hides the shape afterwards', async () => {
    const { getByTestId, rerender } = render(
      <>
        <LiquidPopoverLayer />
        <Harness open />
      </>,
    )
    await act(async () => {
      vi.advanceTimersByTime(LIQUID_POPOVER.restFallbackMs * 3)
    })

    rerender(
      <>
        <LiquidPopoverLayer />
        <Harness open={false} />
      </>,
    )
    await act(async () => {})
    // 皮肤让给形状，形状接住这一块往回收。
    expect(getByTestId('popover').dataset.liquid).toBe('moving')
    expect(shape()?.style.visibility).toBe('visible')

    await act(async () => {
      vi.advanceTimersByTime(LIQUID_POPOVER.closeMs + 50)
    })
    expect(shape()?.style.visibility).toBe('')
  })
})
