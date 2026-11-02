import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChipPopover } from './ChipPopover'

function setup(onOpenChange = vi.fn()) {
  render(
    <ChipPopover
      trigger={<button type="button">16:9 · 2K</button>}
      ariaLabel="画面"
      width={300}
      onOpenChange={onOpenChange}
    >
      <p>比例</p>
    </ChipPopover>,
  )
  return onOpenChange
}

describe('ChipPopover', () => {
  it('默认关着，点 chip 才开', async () => {
    setup()
    expect(screen.queryByLabelText('画面')).toBeNull()
    fireEvent.pointerDown(screen.getByText('16:9 · 2K'), { button: 0 })
    fireEvent.click(screen.getByText('16:9 · 2K'))
    expect(await screen.findByLabelText('画面')).toBeInTheDocument()
    expect(screen.getByText('比例')).toBeInTheDocument()
  })

  it('Esc 关闭（Radix 自带，⛔ 不自己写一份键盘处理）', async () => {
    const onOpenChange = vi.fn()
    render(
      <ChipPopover
        open
        onOpenChange={onOpenChange}
        trigger={<button type="button">chip</button>}
        ariaLabel="模型"
      >
        <p>Seedream</p>
      </ChipPopover>,
    )
    fireEvent.keyDown(await screen.findByLabelText('模型'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('受控 open 时贴 chip 右对齐，并带 nowheel（画布滚动不穿透）', async () => {
    render(
      <ChipPopover
        open
        trigger={<button type="button">chip</button>}
        ariaLabel="模型"
      >
        <p>x</p>
      </ChipPopover>,
    )
    const content = await screen.findByLabelText('模型')
    expect(content.className).toContain('nowheel')
    expect(content).toHaveAttribute('data-node-chrome', 'chip-popover')
  })
})
