import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// `Handle` 要 ReactFlow store；这一组测的是**四族色与左右分工**，⛔ 不拉画布。
vi.mock('@xyflow/react', () => ({
  Handle: (props: Record<string, unknown>) => (
    <span
      data-testid="handle"
      data-type={props.type as string}
      data-position={props.position as string}
      data-family={props['data-family'] as string}
      data-slot={props['data-slot'] as string}
      data-output={props['data-output'] as string}
      data-lit={props['data-lit'] as string}
      data-connectable={String(props.isConnectable)}
      className={props.className as string}
      style={props.style as React.CSSProperties}
    />
  ),
  Position: { Left: 'left', Right: 'right' },
}))

import { NodePorts, PORT_CLASS } from './NodePorts'

describe('NodePorts', () => {
  it('左入右出，id 是槽名 / 出口名', () => {
    const { container } = render(
      <NodePorts
        kind="video"
        left={[
          { id: 'firstFrame', ariaLabel: '首帧' },
          { id: 'reference', ariaLabel: '参考' },
        ]}
        right={[{ id: 'video', ariaLabel: '视频' }]}
      />,
    )
    const handles = [...container.querySelectorAll('[data-testid="handle"]')]
    expect(handles.map((item) => item.getAttribute('data-type'))).toEqual([
      'target',
      'target',
      'source',
    ])
    expect(handles.map((item) => item.getAttribute('data-position'))).toEqual([
      'left',
      'left',
      'right',
    ])
    expect(handles[0]).toHaveAttribute('data-slot', 'firstFrame')
    expect(handles[2]).toHaveAttribute('data-output', 'video')
  })

  it('kind 决定四族色（同一份 PORT_CLASS，⛔ 不各卡复制）', () => {
    const { container } = render(
      <NodePorts kind="image" right={[{ id: 'image', ariaLabel: '图' }]} />,
    )
    const handle = container.querySelector('[data-testid="handle"]')!
    expect(handle).toHaveAttribute('data-family', 'image')
    expect(handle.className).toContain(PORT_CLASS.split(' ')[0])
    expect(PORT_CLASS).toContain('data-[family=image]:!bg-emerald-600')
  })

  it('多个端口按个数均分纵向位置（⛔ 不叠在中线上）', () => {
    const { container } = render(
      <NodePorts
        kind="text"
        left={[
          { id: 'a', ariaLabel: 'a' },
          { id: 'b', ariaLabel: 'b' },
        ]}
      />,
    )
    const handles = container.querySelectorAll<HTMLElement>(
      '[data-testid="handle"]',
    )
    expect(handles[0]!.style.top).not.toBe(handles[1]!.style.top)
  })

  it('拖拽中：未点亮的入口压暗且不可接', () => {
    const { container } = render(
      <NodePorts
        kind="text"
        dragging
        left={[
          { id: 'source', ariaLabel: '来源', lit: true },
          { id: 'text', ariaLabel: '文本', lit: false },
        ]}
      />,
    )
    const handles = container.querySelectorAll<HTMLElement>(
      '[data-testid="handle"]',
    )
    expect(handles[0]).toHaveAttribute('data-lit', 'true')
    expect(handles[0]).toHaveAttribute('data-connectable', 'true')
    expect(handles[1]).toHaveAttribute('data-lit', 'false')
    expect(handles[1]).toHaveAttribute('data-connectable', 'false')
    expect(handles[1]!.className).toContain('opacity-30')
  })
})
