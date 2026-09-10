import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { NodeCardShell } from './NodeCardShell'

function setup(
  props: Partial<React.ComponentProps<typeof NodeCardShell>> = {},
) {
  const onRename = vi.fn(() => true)
  const view = render(
    <NodeCardShell
      name="S02 · 站台独白"
      renameAriaLabel="改名"
      onRename={onRename}
      {...props}
    >
      {props.children ?? <p>正文</p>}
    </NodeCardShell>,
  )
  return { onRename, ...view }
}

describe('NodeCardShell', () => {
  it('名字在卡外上方，⛔ 卡面上没有卡头 / kind 标 / chevron', () => {
    const { container } = setup()
    const surface = container.querySelector('[data-node-card-surface]')
    expect(surface?.textContent).toBe('正文')
    expect(screen.getByRole('button', { name: '改名' })).toBeInTheDocument()
  })

  it('名字选中变深、未选中是次文', () => {
    const { container, rerender } = setup()
    const label = container.querySelector('[data-node-rename-trigger]')
    expect(label?.className).toContain('text-muted-foreground')

    rerender(
      <NodeCardShell
        name="n"
        renameAriaLabel="改名"
        onRename={vi.fn(() => true)}
        selected
      >
        <p>正文</p>
      </NodeCardShell>,
    )
    expect(
      container.querySelector('[data-node-rename-trigger]')?.className,
    ).toContain('text-foreground')
  })

  it('选中 = 1.5px 前景色环 + 边透明（⛔ 不是 ring-2）', () => {
    const { container } = setup({ selected: true })
    const surface = container.querySelector('[data-node-card-surface]')
    expect(surface?.className).toContain('node-selected-ring')
    expect(surface?.className).toContain('border-transparent')
    expect(surface?.className).not.toContain('ring-2')
  })

  it('展开只换阴影档并抬 z（让位由引擎算）', () => {
    const { container } = setup({ expanded: true })
    expect(
      container.querySelector('[data-node-card-surface]')?.className,
    ).toContain('shadow-node-card-expanded')
  })

  it('空态 = 虚线框 + 一句提示 + 加号圆钮，⛔ 没有粘贴按钮', () => {
    const onEmptyAdd = vi.fn()
    const { container } = render(
      <NodeCardShell
        name="镜头图 2"
        renameAriaLabel="改名"
        onRename={vi.fn(() => true)}
        emptyHint="上传 · 粘贴 · 或写提示词"
        emptyAddAriaLabel="添加"
        onEmptyAdd={onEmptyAdd}
      />,
    )
    expect(
      container.querySelector('[data-node-chrome="card"]'),
    ).toHaveAttribute('data-empty', 'true')
    expect(
      container.querySelector('[data-node-card-surface]')?.className,
    ).toContain('border-dashed')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(onEmptyAdd).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /粘贴$/ })).toBeNull()
  })

  it('端口渲染在卡面之外（卡两侧留空给连线）', () => {
    const { container } = setup({
      ports: <span data-testid="port" />,
    })
    const surface = container.querySelector('[data-node-card-surface]')
    expect(surface?.querySelector('[data-testid="port"]')).toBeNull()
    expect(screen.getByTestId('port')).toBeInTheDocument()
  })

  it('双击名字进改名，提交回调拿到新名', () => {
    const { onRename } = setup()
    fireEvent.click(screen.getByRole('button', { name: '改名' }))
    const input = screen.getByLabelText('改名')
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('新名字')
  })
})
