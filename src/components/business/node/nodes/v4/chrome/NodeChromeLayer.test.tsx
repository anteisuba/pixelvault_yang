import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { Position } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'

const zoom = vi.hoisted(() => ({ value: 1 }))
vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Bottom: 'bottom' },
  useNodeId: () => 'node-1',
  useStore: <T,>(
    selector: (state: {
      transform: [number, number, number]
      width: number
      height: number
      nodeLookup: Map<string, unknown>
    }) => T,
  ) =>
    selector({
      transform: [0, 0, zoom.value],
      width: 1440,
      height: 900,
      nodeLookup: new Map([
        [
          'node-1',
          {
            internals: { positionAbsolute: { x: 500, y: 300 } },
            measured: { width: 320, height: 202 },
          },
        ],
      ]),
    }),
  NodeToolbar: (props: { isVisible: boolean; children: ReactNode }) =>
    props.isVisible ? <div>{props.children}</div> : null,
}))
vi.mock('../NodeV4Context', () => ({
  useNodeV4Canvas: () => ({ safeLeftPx: 72 }),
}))

import { NodeChromeLayer } from './NodeChromeLayer'
import { REDUCED_GROW_FROM_EDGE } from './chrome-motion'

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

describe('减少动态效果的节点浮层', () => {
  it('保留 0.72/模糊 4 的开合形态，进退都在 1ms 内完成', () => {
    expect(REDUCED_GROW_FROM_EDGE.initial).toMatchObject({
      opacity: 0,
      scale: 0.72,
      filter: 'blur(4px)',
    })
    expect(REDUCED_GROW_FROM_EDGE.animate).toMatchObject({
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
      transition: { duration: 0.001, ease: 'linear' },
    })
    expect(REDUCED_GROW_FROM_EDGE.exit).toMatchObject({
      opacity: 0,
      scale: 0.72,
      filter: 'blur(4px)',
      transition: { duration: 0.001 },
    })
  })
})
