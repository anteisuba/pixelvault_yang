import { fireEvent, render, screen } from '@testing-library/react'
import { Copy, Trash2 } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

import { NodeToolbar } from './NodeToolbar'

const action = (id: string, extra = {}) => ({
  id,
  label: id,
  icon: Copy,
  onSelect: vi.fn(),
  ...extra,
})

describe('NodeToolbar', () => {
  it('分组之间画一条竖线，组内不画（分隔线是语义，不是装饰）', () => {
    const { container } = render(
      <NodeToolbar
        ariaLabel="工具条"
        groups={[[action('a'), action('b')], [action('c')]]}
      />,
    )
    expect(container.querySelectorAll('[data-toolbar-divider]')).toHaveLength(1)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('纯图标 + aria-label（⛔ 不上文字标签）', () => {
    render(<NodeToolbar ariaLabel="工具条" groups={[[action('download')]]} />)
    const button = screen.getByRole('button', { name: 'download' })
    expect(button.textContent).toBe('')
  })

  // ⚠ 回归闸：`ToolbarCell` 曾把 `{...rest}` 展开在 `onClick` **之后**，
  // Radix `Tooltip.Trigger` 自带的 onClick 把动作整个盖掉——真机上工具条每个键
  // 都点不动（2026-09-10）。这一条必须用**真的** Tooltip 壳跑，桩掉就测不到。
  it('点一下就调 onSelect（tooltip trigger 的 onClick ⛔ 不能盖掉动作）', () => {
    const download = action('download')
    render(<NodeToolbar ariaLabel="工具条" groups={[[download]]} />)
    fireEvent.click(screen.getByRole('button', { name: 'download' }))
    expect(download.onSelect).toHaveBeenCalledTimes(1)
  })

  it('带 menu 的项点一下同样调 onSelect（菜单与动作各跑各的）', () => {
    const edit = action('edit', {
      menu: <DropdownMenuItem>局部重绘</DropdownMenuItem>,
    })
    render(<NodeToolbar ariaLabel="工具条" groups={[[edit]]} />)
    fireEvent.click(screen.getByRole('button', { name: 'edit' }))
    expect(edit.onSelect).toHaveBeenCalledTimes(1)
  })

  it('禁用项点不动', () => {
    const off = action('off', { disabled: true })
    render(<NodeToolbar ariaLabel="工具条" groups={[[off]]} />)
    fireEvent.click(screen.getByRole('button', { name: 'off' }))
    expect(off.onSelect).not.toHaveBeenCalled()
  })

  it('危险项走 destructive 皮肤，禁用项不可点', () => {
    render(
      <NodeToolbar
        ariaLabel="工具条"
        groups={[
          [
            action('del', { icon: Trash2, danger: true }),
            action('off', { disabled: true }),
          ],
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'del' }).className).toContain(
      'text-destructive',
    )
    expect(screen.getByRole('button', { name: 'off' })).toBeDisabled()
  })

  it('带 menu 的项点开出子菜单（用现有 DropdownMenu 原语）', async () => {
    render(
      <NodeToolbar
        ariaLabel="工具条"
        groups={[
          [
            action('edit', {
              menu: <DropdownMenuItem>局部重绘</DropdownMenuItem>,
            }),
          ],
        ]}
      />,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'edit' }), {
      button: 0,
      ctrlKey: false,
    })
    expect(await screen.findByText('局部重绘')).toBeInTheDocument()
  })

  it('工具条上双击不冒泡到卡片（owner 真机反馈第五条）', () => {
    const onCardDoubleClick = vi.fn()
    render(
      <div onDoubleClick={onCardDoubleClick}>
        <NodeToolbar ariaLabel="工具条" groups={[[action('expand')]]} />
      </div>,
    )
    fireEvent.doubleClick(screen.getByRole('toolbar'))
    expect(onCardDoubleClick).not.toHaveBeenCalled()
  })
})
