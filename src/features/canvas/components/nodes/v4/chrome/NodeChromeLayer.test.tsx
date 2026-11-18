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

function anchorAt(value: number) {
  zoom.value = value
  const { container, unmount } = render(
    <NodeChromeLayer show position={Position.Bottom}>
      <span>bar</span>
    </NodeChromeLayer>,
  )
  const host = container.querySelector('[data-node-chrome-left]')
  const result = {
    left: Number(host?.getAttribute('data-node-chrome-left')),
    top: Number(host?.getAttribute('data-node-chrome-top')),
    scaled: container.querySelector('[data-node-chrome-scale]') !== null,
  }
  unmount()
  return result
}

describe('工具条 / 提示词栏屏幕恒 1 倍、锚在卡上（2026-11-18）', () => {
  it('缩放只改锚点位置，⛔ 不改浮层大小', () => {
    // jsdom 没有布局：浮层量出 0×0，left = 卡中心 x，top = 卡底 + 10。
    // 卡 (500,300) 320×202，卡名行 22 屏幕像素不随缩放。
    const far = anchorAt(0.3)
    expect(far.scaled).toBe(false)
    expect(far.left).toBeCloseTo((500 + 160) * 0.3)
    expect(far.top).toBeCloseTo((300 + 202) * 0.3 + 10)

    const near = anchorAt(1.5)
    expect(near.scaled).toBe(false)
    expect(near.left).toBeCloseTo((500 + 160) * 1.5)
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
