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
    fireEvent.click(button)
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
})
