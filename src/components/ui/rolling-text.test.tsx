import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RollingText } from './rolling-text'

describe('RollingText', () => {
  it('读屏读一份完整的字；每位数字是一根竖条，其余字符照排', () => {
    const { container } = render(<RollingText text="0:07.4" />)
    expect(screen.getByText('0:07.4')).toHaveClass('sr-only')
    const hidden = container.querySelector('[aria-hidden]')
    // 四位数字各一根 0–9 的竖条
    expect(hidden?.querySelectorAll('span.flex-col')).toHaveLength(4)
    expect(hidden?.textContent).toContain(':')
    expect(hidden?.textContent).toContain('.')
  })

  it('位置按从右数认：多出一位时右边那几根不换身份', () => {
    const { container, rerender } = render(<RollingText text="9.9" />)
    const tenths = container.querySelectorAll('span.flex-col')[1]
    rerender(<RollingText text="10.0" />)
    const columns = container.querySelectorAll('span.flex-col')
    expect(columns).toHaveLength(3)
    // 原来的十分位那根还是同一个节点（只是滚到新数字），⛔ 卸掉重建
    expect(columns[2]).toBe(tenths)
  })
})
