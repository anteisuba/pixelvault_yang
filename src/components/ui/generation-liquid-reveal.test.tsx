import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GENERATION_LIQUID_REVEAL } from '@/constants/motion'

import { GenerationLiquidReveal } from './generation-liquid-reveal'

describe('GenerationLiquidReveal · 三段液态凝结出图揭示', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts zero SVG filters when play is false (cached history / gallery)', () => {
    const { container } = render(
      <GenerationLiquidReveal revealKey="gen-cached" play={false}>
        <img src="/cached.png" alt="cached" />
      </GenerationLiquidReveal>,
    )

    expect(screen.getByAltText('cached')).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="generation-liquid-reveal"]'),
    ).toHaveAttribute('data-liquid-reveal', 'idle')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('plays the SVG liquid filter when play is true and unmounts it on completion', () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const onComplete = vi.fn()
    const { container, rerender } = render(
      <GenerationLiquidReveal
        revealKey="gen-fresh-1"
        play
        onComplete={onComplete}
      >
        <img src="/fresh.png" alt="fresh" />
      </GenerationLiquidReveal>,
    )

    const root = () =>
      container.querySelector('[data-slot="generation-liquid-reveal"]')
    expect(root()).toHaveAttribute('data-liquid-reveal', 'active')
    expect(container.querySelector('feTurbulence')).toBeInTheDocument()
    expect(container.querySelector('feDisplacementMap')).toBeInTheDocument()
    expect(container.querySelector('feGaussianBlur')).toBeInTheDocument()

    // 中途推进一帧：滤镜仍在运行，尚未卸载。
    act(() => {
      now = 1000 + Math.round(GENERATION_LIQUID_REVEAL.durationMs / 2)
      frames.shift()?.(now)
    })
    expect(root()).toHaveAttribute('data-liquid-reveal', 'active')
    expect(onComplete).not.toHaveBeenCalled()

    // 超过 durationMs：凝结完成，卸载 SVG 滤镜并回调 onComplete。
    act(() => {
      now = 1000 + GENERATION_LIQUID_REVEAL.durationMs + 50
      frames.shift()?.(now)
    })
    expect(root()).toHaveAttribute('data-liquid-reveal', 'idle')
    expect(container.querySelector('svg')).toBeNull()
    expect(onComplete).toHaveBeenCalledTimes(1)

    // 切换到全新 revealKey 时重新触发一轮。
    rerender(
      <GenerationLiquidReveal
        revealKey="gen-fresh-2"
        play
        onComplete={onComplete}
      >
        <img src="/fresh-2.png" alt="fresh-2" />
      </GenerationLiquidReveal>,
    )
    expect(root()).toHaveAttribute('data-liquid-reveal', 'active')
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
