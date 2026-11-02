import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { LoraAspectRatioChip } from './LoraAspectRatioChip'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `LoraWorkbench:${key}`,
}))

beforeAll(() => {
  // Radix 的浮层在 jsdom 里要这几样才肯挂载。
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.HTMLElement.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function openChip() {
  const chip = screen.getByRole('button', {
    name: 'LoraWorkbench:generate.aspectRatioLabel',
  })
  fireEvent.pointerDown(chip, { button: 0 })
  fireEvent.click(chip)
  return chip
}

describe('LoraAspectRatioChip — 与图片台同一颗规格 chip', () => {
  it('shows the current ratio and a morphing ratio glyph on the trigger', () => {
    render(<LoraAspectRatioChip value="3:4" onChange={vi.fn()} />)

    const chip = openChip()
    expect(chip).toHaveTextContent('3:4')
    expect(chip.querySelector('[data-ratio-glyph="3:4"]')).not.toBeNull()
    // 弹层里是带小形状的分段条，当前那一格选中。
    expect(screen.getByRole('radio', { checked: true })).toHaveTextContent(
      '3:4',
    )
  })

  it('offers all five ratios and reports selection via onChange', () => {
    const onChange = vi.fn()
    render(<LoraAspectRatioChip value="1:1" onChange={onChange} />)
    openChip()

    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      '1:1',
      '3:4',
      '4:3',
      '16:9',
      '9:16',
    ])

    fireEvent.click(screen.getByRole('radio', { name: '9:16' }))
    expect(onChange).toHaveBeenCalledWith('9:16')
  })

  it('grows the popover out of the chip (blur-in), not the old blue popover', () => {
    render(<LoraAspectRatioChip value="1:1" onChange={vi.fn()} />)
    openChip()

    const popover = document.querySelector(
      '[data-spec-chip-popover]',
    ) as HTMLElement
    expect(popover.style.getPropertyValue('--tw-enter-blur')).not.toBe('')
    expect(document.querySelector('.text-primary')).toBeNull()
  })
})
