import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioTagPageTabs } from './StudioTagPageTabs'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}(${Object.values(values).join(',')})` : key,
}))

function renderTabs(activeIndex: number | null, negative = false) {
  const onSelect = vi.fn()
  render(
    <StudioTagPageTabs
      whole={{ count: 2, preview: '1girl, solo' }}
      characters={[
        { count: 1, preview: 'aemeath' },
        { count: 0 },
      ]}
      activeIndex={activeIndex}
      negative={negative}
      negativeCount={0}
      canAdd
      disabled={false}
      onSelect={onSelect}
      onNegative={vi.fn()}
      onAdd={vi.fn()}
      onEnabledChange={vi.fn()}
      onRemove={vi.fn()}
    />,
  )
  return { onSelect, row: screen.getByRole('tablist') }
}

describe('StudioTagPageTabs 滚轮切页', () => {
  it('整体往下滚一格 = 角色 1', () => {
    const { onSelect, row } = renderTabs(null)
    fireEvent.wheel(row, { deltaY: 100 })
    expect(onSelect).toHaveBeenCalledWith(0)
  })

  it('小幅滚动攒够一格才切', () => {
    const { onSelect, row } = renderTabs(0)
    fireEvent.wheel(row, { deltaY: 15 })
    fireEvent.wheel(row, { deltaY: 15 })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.wheel(row, { deltaY: 15 })
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('到头停住，不回绕', () => {
    const { onSelect, row } = renderTabs(1)
    fireEvent.wheel(row, { deltaY: 100 })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('往上滚回整体；横滑也算', () => {
    const { onSelect, row } = renderTabs(0)
    fireEvent.wheel(row, { deltaX: -100 })
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('在负向里滚 = 回到正面', () => {
    const { onSelect, row } = renderTabs(1, true)
    fireEvent.wheel(row, { deltaY: 100 })
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
