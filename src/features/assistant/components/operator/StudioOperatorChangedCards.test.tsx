import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorChangedCards } from './StudioOperatorChangedCards'

// 方向 B（owner 2026-09-29）：这一轮改了哪几张，点一行 = 画布平移过去 + 卡面闪一下。
describe('StudioOperatorChangedCards', () => {
  it('一张卡一行，点一行把那张卡的 id 交给宿主去定位', () => {
    const onLocate = vi.fn()
    render(
      <StudioOperatorChangedCards
        cards={[
          { id: 'n_1', label: 'S02 · 公园 · 提示词' },
          { id: 'n_2', label: '时夜 · 参考图' },
        ]}
        onLocate={onLocate}
      />,
    )
    expect(screen.getAllByRole('button')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /时夜/ }))
    expect(onLocate).toHaveBeenCalledWith('n_2')
  })

  it('没有卡就什么都不画', () => {
    const { container } = render(
      <StudioOperatorChangedCards cards={[]} onLocate={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
