import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DURATION_MS } from '@/constants/motion'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', () => ({ useReducedMotion: () => motion.reduced }))

import { StudioStageSwap } from './StudioStageSwap'

function Stage({ panel }: { panel: string | null }) {
  return (
    <StudioStageSwap
      panelKey={panel}
      renderPanel={(key) => <div data-testid="panel">{key}</div>}
      renderResults={(motionClass) => (
        <div data-testid="results" className={motionClass} />
      )}
    />
  )
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('舞台换场', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    motion.reduced = false
  })
  afterEach(() => vi.useRealTimers())

  it('打开：结果先淡出一拍，淡完面板才上来；结果藏起来但不卸载', () => {
    const { rerender } = render(<Stage panel={null} />)
    rerender(<Stage panel="templates" />)
    // 淡出那一拍面板还没上来，结果不吃点击。
    expect(screen.queryByTestId('panel')).toBeNull()
    expect(screen.getByTestId('results')).toHaveClass(
      'fade-out-0',
      'pointer-events-none',
    )
    advance(DURATION_MS.fast)
    expect(screen.getByTestId('panel')).toHaveTextContent('templates')
    // 结果还在树上，只是被藏起来 —— 正在跑的那一批不能丢。
    expect(screen.getByTestId('results').parentElement).toHaveClass('hidden')
  })

  it('收起：面板先淡出一拍再摘，结果再淡回来', () => {
    const { rerender } = render(<Stage panel="templates" />)
    rerender(<Stage panel={null} />)
    // 淡出那一拍面板还在、不吃点击。
    expect(screen.getByTestId('panel').parentElement).toHaveClass(
      'fade-out-0',
      'pointer-events-none',
    )
    advance(DURATION_MS.fast)
    expect(screen.queryByTestId('panel')).toBeNull()
    expect(screen.getByTestId('results')).toHaveClass('fade-in-0')
    advance(DURATION_MS.slow)
    expect(screen.getByTestId('results').className).toBe('')
  })

  it('面板之间换：直接换上，不绕回结果', () => {
    const { rerender } = render(<Stage panel="templates" />)
    rerender(<Stage panel="catalog" />)
    expect(screen.getByTestId('panel')).toHaveTextContent('catalog')
  })

  it('面板还没上来就又收了：结果直接淡回来', () => {
    const { rerender } = render(<Stage panel={null} />)
    rerender(<Stage panel="templates" />)
    rerender(<Stage panel={null} />)
    advance(DURATION_MS.fast)
    expect(screen.queryByTestId('panel')).toBeNull()
    expect(screen.getByTestId('results')).toHaveClass('fade-in-0')
  })

  it('「减少动态效果」时直切', () => {
    motion.reduced = true
    const { rerender } = render(<Stage panel={null} />)
    rerender(<Stage panel="templates" />)
    expect(screen.getByTestId('panel')).toHaveTextContent('templates')
    rerender(<Stage panel={null} />)
    expect(screen.queryByTestId('panel')).toBeNull()
    expect(screen.getByTestId('results').className).toBe('')
  })
})
