import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImageAccordion } from './image-accordion'

const SAMPLE_ITEMS = [
  {
    id: 'ref-1',
    src: 'https://cdn.example.com/1.png',
    alt: '精确参考 #1',
    label: '角色与画风',
    active: true,
  },
  {
    id: 'ref-2',
    src: 'https://cdn.example.com/2.png',
    alt: '精确参考 #2',
    label: '服装',
    active: false,
  },
  {
    id: 'ref-3',
    src: 'https://cdn.example.com/3.png',
    alt: '精确参考 #3',
    label: '画风',
    active: false,
  },
] as const

describe('ImageAccordion · 高斯邻域手风琴照片条', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing for empty items', () => {
    const { container } = render(<ImageAccordion items={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders interactive slices with active state and calls onSelect', () => {
    const onSelect = vi.fn()
    render(
      <ImageAccordion
        items={SAMPLE_ITEMS}
        ariaLabel="精确参考"
        onSelect={onSelect}
      />,
    )

    expect(screen.getByRole('group', { name: '精确参考' })).toBeInTheDocument()
    const first = screen.getByRole('button', {
      name: '角色与画风 · 精确参考 #1',
    })
    const second = screen.getByRole('button', { name: '服装 · 精确参考 #2' })
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(second).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(second)
    expect(onSelect).toHaveBeenCalledWith('ref-2')
  })

  it('expands the hovered slice more than distant neighbors via Gaussian spring', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb)
      return callbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const { container } = render(<ImageAccordion items={SAMPLE_ITEMS} />)
    const slices = container.querySelectorAll<HTMLButtonElement>(
      '[data-slot="image-accordion-slice"]',
    )

    fireEvent.mouseEnter(slices[2]!)

    act(() => {
      for (let step = 0; step < 30; step += 1) {
        now += 16.67
        const cb = callbacks.shift()
        if (cb) cb(now)
      }
    })

    const grow0 = Number(slices[0]!.style.flexGrow)
    const grow1 = Number(slices[1]!.style.flexGrow)
    const grow2 = Number(slices[2]!.style.flexGrow)
    expect(grow2).toBeGreaterThan(grow1)
    expect(grow1).toBeGreaterThan(grow0)
  })
})
