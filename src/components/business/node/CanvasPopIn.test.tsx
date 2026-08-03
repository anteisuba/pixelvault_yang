import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DURATION, EASE_STANDARD } from '@/constants/motion'

import { CanvasPopIn } from './CanvasPopIn'

const captured: Array<Record<string, unknown>> = []

// motion/react 在 jsdom 里跑真动画意义不大（也拿不到中间帧），这里只截下传给
// motion.div 的 props —— 要守的是「进场用的是 canon 的时长与曲线、且只动
// opacity/transform」，那都在 props 里。
vi.mock('motion/react', () => ({
  useReducedMotion: () => false,
  motion: {
    div: ({
      initial,
      animate,
      transition,
      children,
      ...rest
    }: Record<string, unknown> & { children?: React.ReactNode }) => {
      captured.push({ initial, animate, transition })
      return <div {...rest}>{children}</div>
    },
  },
}))

function last() {
  return captured[captured.length - 1] as {
    initial: Record<string, number>
    animate: Record<string, number>
    transition: { duration: number; ease: number[] }
  }
}

describe('CanvasPopIn · 贴卡浮层的进场', () => {
  it('走 canon 的 base 档与全站唯一那条曲线', () => {
    render(
      <CanvasPopIn side="top">
        <span>x</span>
      </CanvasPopIn>,
    )
    const { transition } = last()
    // ⚠ 判据是台账 §13.2：面板 / 浮层展开 150–250ms、同一条 ease。
    expect(transition.duration).toBe(DURATION.base)
    expect(transition.duration * 1000).toBeGreaterThanOrEqual(150)
    expect(transition.duration * 1000).toBeLessThanOrEqual(250)
    expect(transition.ease).toEqual(EASE_STANDARD)
  })

  // §13.2 合成层判据：只动 transform / opacity，不碰 width/height/top/left。
  it('只动 opacity 与 transform', () => {
    render(
      <CanvasPopIn side="bottom">
        <span>x</span>
      </CanvasPopIn>,
    )
    const { initial, animate } = last()
    const allowed = new Set(['opacity', 'x', 'y', 'scale'])
    for (const key of [...Object.keys(initial), ...Object.keys(animate)]) {
      expect(allowed.has(key), `${key} 不是 transform/opacity`).toBe(true)
    }
    // 终态必须回到中性，否则浮层会永远偏移/缩着
    expect(animate).toMatchObject({ opacity: 1, x: 0, y: 0, scale: 1 })
  })

  it('三个方向各自从对应侧浮起', () => {
    render(
      <CanvasPopIn side="top">
        <span>t</span>
      </CanvasPopIn>,
    )
    // 挂在卡上方 → 从下方升起（y 为正）
    expect(last().initial.y).toBeGreaterThan(0)

    render(
      <CanvasPopIn side="bottom">
        <span>b</span>
      </CanvasPopIn>,
    )
    // 挂在卡下方 → 从上方落下（y 为负）
    expect(last().initial.y).toBeLessThan(0)

    render(
      <CanvasPopIn side="right">
        <span>r</span>
      </CanvasPopIn>,
    )
    // 挂在卡右侧 → 从左侧推出（x 为负）
    expect(last().initial.x).toBeLessThan(0)
  })

  it('照常渲染 children', () => {
    render(
      <CanvasPopIn side="top">
        <span>内容</span>
      </CanvasPopIn>,
    )
    expect(screen.getByText('内容')).toBeInTheDocument()
  })
})
