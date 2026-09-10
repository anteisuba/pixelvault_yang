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

  it('←→ 切换并在两端停住', () => {
    const onSelect = setup(0)
    const group = screen.getByRole('radiogroup')
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
