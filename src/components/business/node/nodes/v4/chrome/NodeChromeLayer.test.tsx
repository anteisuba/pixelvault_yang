import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { Position } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'

const zoom = vi.hoisted(() => ({ value: 1 }))
vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Bottom: 'bottom' },
  useStore: <T,>(
    selector: (state: { transform: [number, number, number] }) => T,
  ) => selector({ transform: [0, 0, zoom.value] }),
  NodeToolbar: (props: { isVisible: boolean; children: ReactNode }) =>
    props.isVisible ? <div>{props.children}</div> : null,
}))

import { NodeChromeLayer } from './NodeChromeLayer'

function scaleAt(value: number): string | null {
  zoom.value = value
  const { container, unmount } = render(
    <NodeChromeLayer show position={Position.Bottom}>
      <span>bar</span>
    </NodeChromeLayer>,
  )
  const scale = container
    .querySelector('[data-node-chrome-scale]')
    ?.getAttribute('data-node-chrome-scale')
  unmount()
  return scale ?? null
}

describe('工具条 / 提示词栏跟着画布缩放（owner 2026-09-29）', () => {
  it('缩小时一起缩，到 0.6 为止；放大不超过 1', () => {
    expect(scaleAt(0.8)).toBe('0.8')
    expect(scaleAt(0.3)).toBe('0.6')
    expect(scaleAt(1.5)).toBe('1')
  })
})
