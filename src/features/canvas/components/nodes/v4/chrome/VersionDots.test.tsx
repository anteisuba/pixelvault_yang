import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VersionDots } from './VersionDots'

function setup(current = 1, onSelect = vi.fn()) {
  render(
    <VersionDots
      count={3}
      current={current}
      onSelect={onSelect}
      ariaLabel="版本"
      labelOf={(index) => `第 ${index + 1} 版`}
    />,
  )
  return onSelect
}

describe('VersionDots', () => {
  it('只有一版时整排不渲染（⛔ 不留一颗孤点）', () => {
    const { container } = render(
      <VersionDots
        count={1}
        current={0}
        onSelect={vi.fn()}
        ariaLabel="版本"
        labelOf={() => 'v1'}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('当前版是 checked 的 radio，点别的会回调', () => {
    const onSelect = setup()
    expect(screen.getByRole('radio', { name: '第 2 版' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '第 3 版' }))
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('三颗都是 6px 圆点、可见间距 6px；当前深色，其余 11% 填充', () => {
    setup()
    const group = screen.getByRole('radiogroup')
    expect(group).toHaveClass('h-2.5')
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    for (const radio of radios) {
      expect(radio).toHaveClass('h-6', 'w-3')
      expect(radio.firstElementChild).toHaveClass('size-1.5', 'rounded-full')
    }
    expect(radios[1]?.firstElementChild).toHaveClass('bg-foreground')
    expect(radios[0]?.firstElementChild).toHaveClass('bg-surface-fill-track')
    expect(radios[2]?.firstElementChild).toHaveClass('bg-surface-fill-track')
  })

  it('←→ 切换并在两端停住', () => {
    const onSelect = setup(0)
    const group = screen.getByRole('radiogroup')
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('出完图多出来的那一版才弹出来；挂载时就在的点不演（owner 2026-10-08）', () => {
    const props = {
      current: 0,
      onSelect: vi.fn(),
      ariaLabel: '版本',
      labelOf: (index: number) => `第 ${index + 1} 版`,
    }
    const { container, rerender } = render(<VersionDots {...props} count={2} />)
    expect(container.querySelectorAll('[data-version-dot-fresh]')).toHaveLength(
      0,
    )

    rerender(<VersionDots {...props} count={3} current={2} />)
    const fresh = container.querySelectorAll('[data-version-dot-fresh]')
    expect(fresh).toHaveLength(1)
    expect(
      fresh[0]?.closest('[data-version-dot]')?.getAttribute('data-version-dot'),
    ).toBe('2')
  })
})
