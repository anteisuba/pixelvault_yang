import { fireEvent, render, screen } from '@testing-library/react'
import type { CSSProperties, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// `Handle` 要 ReactFlow store；这一组测的是**一入一出**，⛔ 不拉画布。
vi.mock('@xyflow/react', () => ({
  Handle: (props: Record<string, unknown>) => (
    <span
      data-testid="handle"
      data-type={props.type as string}
      data-position={props.position as string}
      data-port={props['data-port'] as string}
      data-hot={props['data-hot'] as string}
      data-id={props.id as string}
      data-grow={props['data-grow'] as string}
      aria-label={props['aria-label'] as string}
      className={props.className as string}
      style={props.style as CSSProperties}
      onClick={props.onClick as () => void}
    >
      {props.children as ReactNode}
    </span>
  ),
  Position: { Left: 'left', Right: 'right' },
}))

import { NODE_PORT_HANDLE_IDS } from '@/constants/node-slots'

import { NodeConnectStateProvider } from './node-connect-state'
import { NodePorts, portSpecOf } from './NodePorts'

describe('NodePorts', () => {
  it('一入一出：五个槽也只画一颗入口点（spec §1.13）', () => {
    const { container } = render(
      <NodePorts
        kind="video"
        left={[
          { id: 'firstFrame' },
          { id: 'lastFrame' },
          { id: 'reference' },
          { id: 'voice' },
          { id: 'text' },
        ]}
        right={[{ id: 'out' }, { id: 'tailFrame' }]}
      />,
    )
    const handles = [...container.querySelectorAll('[data-testid="handle"]')]
    expect(handles).toHaveLength(2)
    expect(handles.map((item) => item.getAttribute('data-type'))).toEqual([
      'target',
      'source',
    ])
    expect(handles[0]).toHaveAttribute('data-id', NODE_PORT_HANDLE_IDS.input)
    // `tailFrame` 出口不再画 —— 续拍走工具条。
    expect(handles[1]).toHaveAttribute('data-id', NODE_PORT_HANDLE_IDS.output)
  })

  it('叶子源没有入口 → 左侧不画点', () => {
    const { container } = render(
      <NodePorts kind="image" right={[{ id: 'out' }]} />,
    )
    const handles = [...container.querySelectorAll('[data-testid="handle"]')]
    expect(handles).toHaveLength(1)
    expect(handles[0]).toHaveAttribute('data-port', 'output')
  })

  it('拖线起点那颗出口变成 18px 黑底「＋」', () => {
    const { container } = render(
      <NodeConnectStateProvider
        value={{
          active: true,
          sourceId: 'n1',
          legalTargetIds: new Set(['n2']),
        }}
      >
        <NodePorts kind="image" right={[{ id: 'out' }]} nodeId="n1" />
      </NodeConnectStateProvider>,
    )
    const handle = container.querySelector('[data-testid="handle"]')!
    expect(handle).toHaveAttribute('data-hot', 'true')
    expect(handle.className).toContain('node-port--hot')
  })

  it('30% 缩放时普通口与拖线热口仍是屏幕 12/1.5 和 18/2', () => {
    const { container } = render(
      <NodeConnectStateProvider
        value={{ active: true, sourceId: 'n1', legalTargetIds: new Set() }}
      >
        <NodePorts
          kind="image"
          left={[{ id: 'in' }]}
          right={[{ id: 'out' }]}
          nodeId="n1"
          zoom={0.3}
        />
      </NodeConnectStateProvider>,
    )
    const [ordinary, hot] = container.querySelectorAll<HTMLElement>(
      '[data-testid="handle"]',
    )
    expect(ordinary?.style.width).toBe(`${12 / 0.3}px`)
    expect(ordinary?.style.borderWidth).toBe(`${1.5 / 0.3}px`)
    expect(hot?.style.width).toBe(`${18 / 0.3}px`)
    expect(hot?.style.borderWidth).toBe(`${2 / 0.3}px`)
    expect(hot).toHaveTextContent('+')
  })

  it('不是起点的卡上，出口点不带「＋」', () => {
    const { container } = render(
      <NodeConnectStateProvider
        value={{
          active: true,
          sourceId: 'n1',
          legalTargetIds: new Set(['n2']),
        }}
      >
        <NodePorts kind="image" right={[{ id: 'out' }]} nodeId="n2" />
      </NodeConnectStateProvider>,
    )
    const handle = container.querySelector('[data-testid="handle"]')!
    expect(handle).toHaveAttribute('data-hot', 'false')
  })
})

describe('NodePorts 出口「+」（§1 第 18 条尾句）', () => {
  it('只有一个去处：点一下直接做，⛔ 不弹菜单', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <NodePorts
        kind="video"
        right={[{ id: 'out' }]}
        grow={{ choices: [{ id: 'continue', label: '续拍', onSelect }] }}
      />,
    )
    const handle = container.querySelector('[data-port="output"]')!
    expect(handle).toHaveAttribute('data-grow', 'true')
    expect(handle).toHaveAttribute('aria-label', 'growOne')
    expect(handle.className).toContain('node-port--grow')
    expect(handle).toHaveTextContent('+')
    fireEvent.click(handle)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('两个去处：点一下贴着出口弹菜单，选哪个做哪个', () => {
    const toImage = vi.fn()
    const toVideo = vi.fn()
    const { container } = render(
      <NodePorts
        kind="image"
        right={[{ id: 'out' }]}
        grow={{
          choices: [
            { id: 'image', label: '图片', onSelect: toImage },
            { id: 'video', label: '视频', onSelect: toVideo },
          ],
        }}
      />,
    )
    const handle = container.querySelector('[data-port="output"]')!
    expect(handle).toHaveAttribute('aria-label', 'grow')
    fireEvent.click(handle)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '视频' }))
    expect(toVideo).toHaveBeenCalledTimes(1)
    expect(toImage).not.toHaveBeenCalled()
  })

  it('还没东西可接（disabled）：只剩拖线的点，没有「+」', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <NodePorts
        kind="audio"
        right={[{ id: 'out' }]}
        grow={{
          disabled: true,
          choices: [{ id: 'video', label: '视频', onSelect }],
        }}
      />,
    )
    const handle = container.querySelector('[data-port="output"]')!
    expect(handle).not.toHaveAttribute('data-grow')
    expect(handle).toHaveAttribute('aria-label', 'output')
    expect(handle).not.toHaveTextContent('+')
    fireEvent.click(handle)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('portSpecOf', () => {
  it('从端口表读两侧有没有口（⛔ 卡上不硬写）', () => {
    const shot = portSpecOf({ data: { kind: 'video', subtype: 'shot' } })
    expect(shot.left).toHaveLength(5)
    expect(shot.right).toHaveLength(2)

    const leaf = portSpecOf({ data: { kind: 'image', subtype: 'reference' } })
    expect(leaf.left).toHaveLength(0)
    expect(leaf.right).toHaveLength(1)
  })
})
