import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NodeProgressBar, NodeProgressState } from './NodeProgressState'

/**
 * 台账 #14（owner 2026-08-03 拍板）。这组守的是那条轴本身：
 * **有真实百分比 → 确定式条**，**拿不到 → 不定式条**。四个落点共用一个器件，
 * 别再长出第五种说法。
 */
describe('NodeProgressBar · 一个器件两种行为', () => {
  it('给了百分比就是确定式：宽度随进度，且播报得出数值', () => {
    render(<NodeProgressBar progress={42} label="上传中" />)
    const bar = screen.getByRole('progressbar', { name: '上传中' })

    expect(bar).toHaveClass('canvas-progress-bar--determinate')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(
      bar.querySelector<HTMLElement>('.canvas-progress-bar-fill')?.style.width,
    ).toBe('42%')
  })

  // ⚠ 不定式**必须**省略 aria-valuenow：给个数字就是在假造进度。生成期间前端
  // 拿不到真实进度，规格 §5 原话「生成中 ↻（无百分比）」明确禁止假造一个。
  it('不给百分比就是不定式：不报数值，也不写死宽度', () => {
    render(<NodeProgressBar label="生成中" />)
    const bar = screen.getByRole('progressbar', { name: '生成中' })

    expect(bar).not.toHaveClass('canvas-progress-bar--determinate')
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar).not.toHaveAttribute('aria-valuemax')
    expect(
      bar.querySelector<HTMLElement>('.canvas-progress-bar-fill')?.style.width,
    ).toBe('')
  })

  it('越界的百分比夹回 0–100 并取整', () => {
    const { rerender } = render(<NodeProgressBar progress={-8} label="x" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    )

    rerender(<NodeProgressBar progress={140} label="x" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100',
    )

    rerender(<NodeProgressBar progress={41.6} label="x" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '42',
    )
  })
})

describe('NodeProgressState · 遮罩看情况', () => {
  // 规矩是「器件恒定、遮罩看情况」：底下有东西要遮才上，空态平白盖一层白是
  // 没有意义的（那是原来四份实现里 B 那份唯一做对的地方）。
  it('veiled 才上遮罩，器件两种情况都在', () => {
    const { container, rerender } = render(<NodeProgressState label="生成中" />)
    expect(container.querySelector('.canvas-progress-state')).not.toBeNull()
    expect(container.querySelector('.canvas-progress-state--veiled')).toBeNull()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()

    rerender(<NodeProgressState label="生成中" veiled />)
    expect(
      container.querySelector('.canvas-progress-state--veiled'),
    ).not.toBeNull()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('文案与额外动作都渲染出来', () => {
    render(
      <NodeProgressState
        label="上传中 42%"
        progress={42}
        veiled
        action={<button type="button">取消</button>}
      />,
    )
    expect(screen.getByText('上传中 42%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveClass(
      'canvas-progress-bar--determinate',
    )
  })
})
