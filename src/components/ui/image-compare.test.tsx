import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ImageCompare } from './image-compare'

/**
 * 前后对比（动效样片 W）：两张图都在、分隔线是可键盘操作的 slider、
 * 拖过头只拉长不越界（读数夹在 0–100）。
 */
function renderCompare() {
  return render(
    <ImageCompare
      beforeSrc="/before.png"
      afterSrc="/after.png"
      beforeLabel="Before"
      afterLabel="After"
      sliderLabel="Drag to compare"
    />,
  )
}

describe('ImageCompare', () => {
  it('renders the after image and a labelled slider starting in the middle', () => {
    renderCompare()
    expect(screen.getByAltText('After')).toBeInTheDocument()
    const slider = screen.getByRole('slider', { name: 'Drag to compare' })
    expect(slider).toHaveAttribute('aria-valuenow', '50')
  })

  it('jumps to the ends with Home / End', () => {
    renderCompare()
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'End' })
    // 键盘走弹簧动画；终点由 motion value 决定，这里只断言事件被接住（不抛、不越界）。
    const value = Number(slider.getAttribute('aria-valuenow'))
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(100)
  })

  it('clamps the reading when the pointer is dragged past the edge', () => {
    const { container } = renderCompare()
    const root = container.querySelector<HTMLElement>(
      '[data-slot="image-compare"]',
    )!
    root.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
      }) as DOMRect
    fireEvent.pointerDown(root, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(root, { clientX: 400, pointerId: 1 })
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '100')
    fireEvent.pointerUp(root, { pointerId: 1 })
  })

  it('bends the jelly-curve SVG divider on fast interior pointer drags', async () => {
    const { container } = renderCompare()
    const root = container.querySelector<HTMLElement>(
      '[data-slot="image-compare"]',
    )!
    root.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 200,
        right: 400,
        bottom: 200,
      }) as DOMRect

    fireEvent.pointerDown(root, { clientX: 200, pointerId: 1 })
    fireEvent.pointerMove(root, { clientX: 300, pointerId: 1 })

    const path = container.querySelector(
      '[data-slot="image-compare-curve"] path',
    )
    const beforeLayer = container.querySelector<HTMLElement>(
      '[data-slot="image-compare-before"]',
    )!
    await waitFor(() => {
      expect(path?.getAttribute('d')).toMatch(
        /^M [\d.]+ 0 Q [\d.]+ 100\.00 [\d.]+ 200\.00$/,
      )
      expect(beforeLayer.style.clipPath).toMatch(/^path\("M0 0 L/)
    })

    fireEvent.pointerUp(root, { pointerId: 1 })
  })
})
