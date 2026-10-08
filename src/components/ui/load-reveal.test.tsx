import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LOAD_REVEAL } from '@/constants/motion'

import {
  ArrivalReveal,
  revealStep,
  useArrivedAfterWait,
  useMediaReveal,
  useRevealBatchStart,
} from './load-reveal'

describe('revealStep', () => {
  it('counts column + row from the top-left and caps at maxSteps', () => {
    expect(revealStep(0, 0)).toBe(0)
    expect(revealStep(2, 1)).toBe(3)
    expect(revealStep(9, 9)).toBe(LOAD_REVEAL.media.maxSteps)
    expect(revealStep(-1, -3)).toBe(0)
  })
})

describe('useArrivedAfterWait', () => {
  it('is true only after this mount actually waited', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useArrivedAfterWait(loading),
      { initialProps: { loading: true } },
    )
    expect(result.current).toBe(false)
    rerender({ loading: false })
    expect(result.current).toBe(true)
  })

  it('stays false when the data was already in hand', () => {
    const { result } = renderHook(() => useArrivedAfterWait(false))
    expect(result.current).toBe(false)
  })
})

describe('useRevealBatchStart', () => {
  it('starts each appended batch from its own first item', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useRevealBatchStart(count),
      { initialProps: { count: 20 } },
    )
    expect(result.current(7)).toBe(0)
    rerender({ count: 40 })
    expect(result.current(7)).toBe(0)
    expect(result.current(25)).toBe(20)
    // 列表变短（换筛选）= 从头记。
    rerender({ count: 10 })
    expect(result.current(5)).toBe(0)
  })
})

function RevealImage({ src }: { src: string }) {
  const { phase, imageRef, onLoad, onError, style, className } = useMediaReveal(
    { src, step: 3 },
  )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      src={src}
      alt=""
      data-phase={phase}
      onLoad={onLoad}
      onError={onError}
      style={style}
      className={className}
    />
  )
}

describe('useMediaReveal', () => {
  it('holds the image blurred and transparent until it loads, then reveals it', () => {
    const { container } = render(<RevealImage src="/a.png" />)
    const image = container.querySelector('img') as HTMLImageElement
    expect(image.dataset.phase).toBe('waiting')
    expect(image.className).toContain('opacity-0')
    expect(image.className).toContain('blur-reveal')
    expect(image.className).toContain('motion-reduce:blur-none')

    act(() => {
      fireEvent.load(image)
    })
    expect(image.dataset.phase).toBe('revealing')
    expect(image.className).not.toContain('opacity-0')
    expect(image.className).toContain('duration-reveal')
  })

  it('reports a failed load so the host can fall back', () => {
    const { container } = render(<RevealImage src="/broken.png" />)
    const image = container.querySelector('img') as HTMLImageElement
    act(() => {
      fireEvent.error(image)
    })
    expect(image.dataset.phase).toBe('failed')
  })

  it('starts over when the source changes', () => {
    const { container, rerender } = render(<RevealImage src="/a.png" />)
    const image = container.querySelector('img') as HTMLImageElement
    act(() => {
      fireEvent.load(image)
    })
    rerender(<RevealImage src="/b.png" />)
    expect(
      (container.querySelector('img') as HTMLImageElement).dataset.phase,
    ).toBe('waiting')
  })
})

describe('ArrivalReveal', () => {
  it('blurs in only when the content arrives after a wait', () => {
    const { container, rerender } = render(
      <ArrivalReveal loading>
        <span>row</span>
      </ArrivalReveal>,
    )
    expect(container.querySelector('[data-load-reveal="play"]')).toBeNull()
    rerender(
      <ArrivalReveal loading={false}>
        <span>row</span>
      </ArrivalReveal>,
    )
    expect(container.querySelector('[data-load-reveal="play"]')).not.toBeNull()
  })

  it('shows content directly when it was already there', () => {
    const { container } = render(
      <ArrivalReveal loading={false}>
        <span>row</span>
      </ArrivalReveal>,
    )
    expect(container.querySelector('[data-load-reveal="play"]')).toBeNull()
  })
})
