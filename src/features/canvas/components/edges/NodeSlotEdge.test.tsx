import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// 边组件只要路径与浮层容器；⛔ 不把 ReactFlow store 拉进来。
vi.mock('@xyflow/react', () => ({
  getBezierPath: () => ['M0,0 L10,10', 5, 5],
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const onApplyOp = vi.fn()
const onApplyBatch = vi.fn()
vi.mock('../nodes/v4/NodeV4Context', () => ({
  useNodeV4Canvas: () => ({ onApplyOp, onApplyBatch }),
}))

import { NODE_SLOT_IDS } from '@/constants/node-slots'

import { NodeSlotEdge, isRoleChangeableEdge } from './NodeSlotEdge'

function renderEdge(data: Record<string, unknown>) {
  // 只喂组件实际读的那几个 prop（EdgeProps 其余项与本组无关）。
  const props = {
    id: 'e1',
    source: 'img',
    target: 'shot',
    sourceX: 0,
    sourceY: 0,
    targetX: 10,
    targetY: 10,
    sourcePosition: 'right',
    targetPosition: 'left',
    data,
  } as unknown as React.ComponentProps<typeof NodeSlotEdge>
  return render(<NodeSlotEdge {...props} />)
}

describe('NodeSlotEdge（spec §1.13）', () => {
  it('平时不出胶囊；两端任一卡选中时浮出槽名', () => {
    const idle = renderEdge({ slot: NODE_SLOT_IDS.firstFrame })
    expect(idle.container.querySelector('[data-node-edge-capsule]')).toBeNull()

    renderEdge({ slot: NODE_SLOT_IDS.firstFrame, endpointSelected: true })
    expect(screen.getByText('slots.firstFrame')).toBeInTheDocument()
  })

  it('图边的胶囊点开就是改角色，且断旧连新是**一条**撤销（一次 batch）', () => {
    onApplyBatch.mockClear()
    renderEdge({
      slot: NODE_SLOT_IDS.firstFrame,
      endpointSelected: true,
      roleChangeable: true,
    })
    fireEvent.click(screen.getByText('slots.firstFrame'))
    fireEvent.click(screen.getByText('edgeRole.reference') as HTMLButtonElement)
    expect(onApplyBatch).toHaveBeenCalledTimes(1)
    expect(onApplyBatch.mock.calls[0]![0]).toEqual([
      { op: 'disconnect', edgeId: 'e1' },
      {
        op: 'connect',
        source: 'img',
        target: 'shot',
        slot: NODE_SLOT_IDS.reference,
      },
    ])
  })

  it('语音 / 文本边只写槽名，⛔ 没有改角色那一层', () => {
    const { container } = renderEdge({
      slot: NODE_SLOT_IDS.voice,
      endpointSelected: true,
    })
    expect(screen.getByText('slots.voice')).toBeInTheDocument()
    expect(container.querySelector('[data-node-edge-role]')).toBeNull()
  })

  it('胶囊尾部 × = 断开', () => {
    onApplyOp.mockClear()
    const { container } = renderEdge({
      slot: NODE_SLOT_IDS.reference,
      endpointSelected: true,
    })
    fireEvent.click(
      container.querySelector('[data-node-edge-disconnect]') as HTMLElement,
    )
    expect(onApplyOp).toHaveBeenCalledWith({ op: 'disconnect', edgeId: 'e1' })
  })
})

describe('isRoleChangeableEdge', () => {
  it('只有图片源的首帧 / 尾帧 / 参考三档可以互换', () => {
    expect(isRoleChangeableEdge('image', NODE_SLOT_IDS.firstFrame)).toBe(true)
    expect(isRoleChangeableEdge('image', NODE_SLOT_IDS.reference)).toBe(true)
    expect(isRoleChangeableEdge('image', NODE_SLOT_IDS.text)).toBe(false)
    expect(isRoleChangeableEdge('video', NODE_SLOT_IDS.reference)).toBe(false)
    expect(isRoleChangeableEdge(undefined, NODE_SLOT_IDS.reference)).toBe(false)
  })
})
