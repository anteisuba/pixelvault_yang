import { render } from '@testing-library/react'
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
      className={props.className as string}
    />
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
