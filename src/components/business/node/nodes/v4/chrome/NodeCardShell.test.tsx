import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const flowZoom = vi.hoisted(() => ({ value: 1 }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// `Handle` 要 ReactFlow store；这一组测的是**卡骨架**，⛔ 不把画布拉进来。
vi.mock('@xyflow/react', () => ({
  Handle: (props: Record<string, unknown>) => (
    <span
      data-testid="handle"
      data-family={props['data-family'] as string}
      data-port={props['data-port'] as string}
      data-id={props.id as string}
    />
  ),
  Position: { Left: 'left', Right: 'right' },
  // 卡壳被直接渲染时不在任何节点里 —— 拖线反馈退成静止态。
  useNodeId: () => null,
  useStore: <T,>(
    selector: (state: { transform: [number, number, number] }) => T,
  ) => selector({ transform: [0, 0, flowZoom.value] }),
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

  it('30% 与放大时名字都反向缩放为屏幕 12px，宽度跟卡的屏幕宽度一致', () => {
    flowZoom.value = 0.3
    const { container, rerender } = setup()
    const name = container.querySelector('[data-node-card-name]') as HTMLElement
    expect(name.style.transform).toBe(`scale(${1 / 0.3})`)
    expect(name.style.width).toBe('30%')
    expect(name.className).toContain('text-xs')
    expect(name.className).toContain('leading-4')
    expect(name.parentElement?.className).toContain('absolute')
    expect(container.firstElementChild?.getAttribute('style')).toContain(
      '/ 0.3)',
    )

    flowZoom.value = 1
    rerender(
      <NodeCardShell
        name="n"
        renameAriaLabel="改名"
        onRename={vi.fn(() => true)}
      >
        <p>正文</p>
      </NodeCardShell>,
    )
    expect(name.style.transform).toBe('scale(1)')
    expect(name.style.width).toBe('100%')

    flowZoom.value = 2
    rerender(
      <NodeCardShell
        name="n"
        renameAriaLabel="改名"
        onRename={vi.fn(() => true)}
      >
        <p>正文</p>
      </NodeCardShell>,
    )
    expect(name.style.transform).toBe('scale(0.5)')
    expect(name.style.width).toBe('200%')
    flowZoom.value = 1
  })

  it('非空卡无内描边，选中环为屏幕 2px', () => {
    const { container } = setup({ selected: true })
    const surface = container.querySelector('[data-node-card-surface]')
    expect(surface?.className).toContain('node-selected-ring')
    expect(surface?.className).not.toContain('border-transparent')
    expect(surface?.className).not.toContain('border-border')
    expect(surface?.className).not.toContain('ring-2')
    expect((surface as HTMLElement).style.outlineWidth).toBe('2px')
  })

  it('展开只换阴影档并抬 z（让位由引擎算）', () => {
    const { container } = setup({ expanded: true })
    expect(
      container.querySelector('[data-node-card-surface]')?.className,
    ).toContain('shadow-node-card-expanded')
  })

  it('空态透明无影，虚线与选中环按屏幕像素反算；拖入变实线和深底', () => {
    flowZoom.value = 0.3
    const { container } = render(
      <NodeCardShell
        name="镜头图 2"
        renameAriaLabel="改名"
        onRename={vi.fn(() => true)}
        selected
        emptyDragging
        emptyContent={<span>双击开始写</span>}
      />,
    )
    expect(
      container.querySelector('[data-node-chrome="card"]'),
    ).toHaveAttribute('data-empty', 'true')
    const surface = container.querySelector<HTMLElement>(
      '[data-node-card-surface]',
    )!
    expect(surface).toHaveClass(
      'border-solid',
      'border-foreground/24',
      'bg-surface-fill-hover',
    )
    expect(surface.className).not.toContain('shadow-node-card')
    expect(surface.style.borderWidth).toBe(`${1.5 / 0.3}px`)
    expect(surface.style.outlineWidth).toBe(`${2 / 0.3}px`)
    expect(surface).toHaveTextContent('双击开始写')
    flowZoom.value = 1
  })

  it('显式空态以空内容槽为准，忽略节点 JSX 的残留 children', () => {
    const { container } = render(
      <NodeCardShell
        name="镜头 5"
        renameAriaLabel="改名"
        empty
        emptyContent={<span>上传一段 · 或写这个镜头怎么拍</span>}
      >
        <span>旧卡面</span>
      </NodeCardShell>,
    )
    const surface = container.querySelector('[data-node-card-surface]')!
    expect(surface).toHaveTextContent('上传一段 · 或写这个镜头怎么拍')
    expect(surface).not.toHaveTextContent('旧卡面')
  })

  it('端口渲染在卡面之外（卡两侧留空给连线）', () => {
    const { container } = setup({
      ports: <span data-testid="port" />,
    })
    const surface = container.querySelector('[data-node-card-surface]')
    expect(surface?.querySelector('[data-testid="port"]')).toBeNull()
    expect(screen.getByTestId('port')).toBeInTheDocument()
  })

  // ⚠ 端口渲染件上收进 chrome：调用方只给 `portSpec`，⛔ 不再各自复制一份
  // `Handle`（文本卡曾把四族色写死成蓝，2026-09-10 抓到）。
  it('`portSpec` 由 NodePorts 默认渲染（一入一出，S6e）', () => {
    const { container } = setup({
      portSpec: {
        kind: 'text',
        left: [{ id: 'source', ariaLabel: '来源' }],
        right: [{ id: 'text', ariaLabel: '文本' }],
      },
    })
    const handles = container.querySelectorAll('[data-testid="handle"]')
    expect(handles).toHaveLength(2)
    expect(handles[0]).toHaveAttribute('data-family', 'text')
    expect(
      container
        .querySelector('[data-node-card-surface]')
        ?.querySelector('[data-testid="handle"]'),
    ).toBeNull()
  })

  it('名字**双击**才进改名（单击只选卡，⛔ 不掉进输入框）', () => {
    const { onRename } = setup()
    const label = screen.getByRole('button', { name: '改名' })
    fireEvent.click(label)
    expect(screen.queryByRole('textbox')).toBeNull()

    fireEvent.doubleClick(label)
    const input = screen.getByLabelText('改名')
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('新名字')
  })

  // spec §7 变更高亮：上游出了新版本 → 名字旁一颗细点。
  it('`changed` 在名字旁点一颗细点，⛔ 不染卡面', () => {
    const { container, rerender } = setup()
    expect(container.querySelector('[data-node-card-changed]')).toBeNull()
    expect(
      container.querySelector('[data-node-chrome="card"]'),
    ).toHaveAttribute('data-changed', 'false')

    rerender(
      <NodeCardShell
        name="n"
        renameAriaLabel="改名"
        onRename={vi.fn(() => true)}
        changed
      >
        <p>正文</p>
      </NodeCardShell>,
    )
    expect(container.querySelector('[data-node-card-changed]')).not.toBeNull()
    expect(
      container.querySelector('[data-node-card-surface]')?.className,
    ).not.toContain('bg-primary')
  })

  // ⋯ 菜单的「改名」走这条受控入口，⛔ 不再 querySelector 那个触发器再 .click()。
  it('`renameRequest` 每变一次进一次编辑态', () => {
    const onRename = vi.fn(() => true)
    const { rerender } = render(
      <NodeCardShell
        name="n"
        renameAriaLabel="改名"
        onRename={onRename}
        renameRequest={0}
      >
        <p>正文</p>
      </NodeCardShell>,
    )
    expect(screen.queryByRole('textbox')).toBeNull()

    rerender(
      <NodeCardShell
        name="n"
        renameAriaLabel="改名"
        onRename={onRename}
        renameRequest={1}
      >
        <p>正文</p>
      </NodeCardShell>,
    )
    const input = screen.getByLabelText('改名')
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('新名字')
  })
})
