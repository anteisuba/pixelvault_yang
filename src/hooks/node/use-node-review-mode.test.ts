import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import { useNodeReviewMode } from '@/hooks/node/use-node-review-mode'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

function node(
  id: string,
  url: string,
  state: string,
  markedAt?: string,
): NodeWorkflowNode {
  return {
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      prompt: '',
      status: 'idle',
      mediaUrl: url,
      mediaReview: { [url]: { state, ...(markedAt ? { markedAt } : {}) } },
    } as unknown as NodeWorkflowNodeData,
  }
}

const AWAITING = NODE_REVIEW_STATE_IDS.awaitingReview

function threeAwaiting(): NodeWorkflowNode[] {
  return [
    node('n1', 'https://cdn/1.png', AWAITING, '2026-08-01T00:00:01Z'),
    node('n2', 'https://cdn/2.png', AWAITING, '2026-08-01T00:00:02Z'),
    node('n3', 'https://cdn/3.png', AWAITING, '2026-08-01T00:00:03Z'),
  ]
}

function setup(initial: NodeWorkflowNode[]) {
  const focusNode = vi.fn()
  const view = renderHook(
    ({ nodes }: { nodes: NodeWorkflowNode[] }) =>
      useNodeReviewMode({ nodes, focusNode }),
    { initialProps: { nodes: initial } },
  )
  return { view, focusNode }
}

describe('useNodeReviewMode', () => {
  it('进入模式落在队首，并把相机飞过去', () => {
    const { view, focusNode } = setup(threeAwaiting())
    expect(view.result.current.active).toBe(false)
    expect(view.result.current.remaining).toBe(3)

    act(() => view.result.current.enter())
    expect(view.result.current.active).toBe(true)
    expect(view.result.current.current?.url).toBe('https://cdn/1.png')
    expect(focusNode).toHaveBeenCalledWith('n1')
  })

  it('队列为空时进不去 —— 没有可审的东西就没有模式', () => {
    const { view, focusNode } = setup([
      node('n1', 'https://cdn/1.png', NODE_REVIEW_STATE_IDS.approved),
    ])
    act(() => view.result.current.enter())
    expect(view.result.current.active).toBe(false)
    expect(focusNode).not.toHaveBeenCalled()
  })

  it('通过 → 自动跳下一张（判据是状态变了，不是谁点的按钮）', () => {
    const nodes = threeAwaiting()
    const { view, focusNode } = setup(nodes)
    act(() => view.result.current.enter())
    focusNode.mockClear()

    // 别处（这里模拟参数条上的「通过」）把第一张标成已通过
    const approved = [...nodes]
    approved[0] = node(
      'n1',
      'https://cdn/1.png',
      NODE_REVIEW_STATE_IDS.approved,
    )
    act(() => view.rerender({ nodes: approved }))

    expect(view.result.current.current?.url).toBe('https://cdn/2.png')
    expect(focusNode).toHaveBeenCalledWith('n2')
    expect(view.result.current.remaining).toBe(2)
  })

  it('打回 → 停在原地，不跳走', () => {
    // §4.2：打回常常紧接着「改词再来」，自动跳走会把用户从他刚做的决定里踢出去。
    const nodes = threeAwaiting()
    const { view, focusNode } = setup(nodes)
    act(() => view.result.current.enter())
    focusNode.mockClear()

    const rejected = [...nodes]
    rejected[0] = node(
      'n1',
      'https://cdn/1.png',
      NODE_REVIEW_STATE_IDS.rejected,
    )
    act(() => view.rerender({ nodes: rejected }))

    expect(view.result.current.current?.url).toBe('https://cdn/1.png')
    expect(view.result.current.currentDecided).toBe(true)
    expect(view.result.current.active).toBe(true)
    expect(focusNode).not.toHaveBeenCalled()
  })

  it('打回后按「下一张」才继续，顺序接得上', () => {
    const nodes = threeAwaiting()
    const { view } = setup(nodes)
    act(() => view.result.current.enter())

    const rejected = [...nodes]
    rejected[0] = node(
      'n1',
      'https://cdn/1.png',
      NODE_REVIEW_STATE_IDS.rejected,
    )
    act(() => view.rerender({ nodes: rejected }))
    act(() => view.result.current.goNext())

    expect(view.result.current.current?.url).toBe('https://cdn/2.png')
  })

  it('审完（队列空）自动退出', () => {
    const nodes = [node('n1', 'https://cdn/1.png', AWAITING, 'a')]
    const { view } = setup(nodes)
    act(() => view.result.current.enter())
    expect(view.result.current.active).toBe(true)

    act(() =>
      view.rerender({
        nodes: [
          node('n1', 'https://cdn/1.png', NODE_REVIEW_STATE_IDS.approved),
        ],
      }),
    )
    expect(view.result.current.active).toBe(false)
    expect(view.result.current.current).toBeNull()
  })

  it('打回最后一张不立刻退出 —— 那一屏要留给理由 / 改词', () => {
    const nodes = [node('n1', 'https://cdn/1.png', AWAITING, 'a')]
    const { view } = setup(nodes)
    act(() => view.result.current.enter())

    act(() =>
      view.rerender({
        nodes: [
          node('n1', 'https://cdn/1.png', NODE_REVIEW_STATE_IDS.rejected),
        ],
      }),
    )
    expect(view.result.current.active).toBe(true)
    expect(view.result.current.currentDecided).toBe(true)

    // 用户处理完，显式往下走 → 这时才结束
    act(() => view.result.current.goNext())
    expect(view.result.current.active).toBe(false)
  })

  it('先通过一张、再打回最后一张 —— 仍然停在原地，不会被误判成审完', () => {
    // 回归：自动前进只改「当前是哪张」，锚点若不跟着走，第二次裁决就会拿最初
    // 那张（已通过）去算，findNext 返回 null → 模式当场关掉。真机实测踩到过。
    const nodes = [
      node('n1', 'https://cdn/1.png', AWAITING, '2026-08-01T00:00:01Z'),
      node('n2', 'https://cdn/2.png', AWAITING, '2026-08-01T00:00:02Z'),
    ]
    const { view } = setup(nodes)
    act(() => view.result.current.enter())

    // 第一张通过 → 自动前进到第二张
    act(() =>
      view.rerender({
        nodes: [
          node('n1', 'https://cdn/1.png', NODE_REVIEW_STATE_IDS.approved),
          nodes[1]!,
        ],
      }),
    )
    expect(view.result.current.current?.url).toBe('https://cdn/2.png')

    // 第二张（也是最后一张）打回 → 必须停在它上面，等理由 / 改词
    act(() =>
      view.rerender({
        nodes: [
          node('n1', 'https://cdn/1.png', NODE_REVIEW_STATE_IDS.approved),
          node('n2', 'https://cdn/2.png', NODE_REVIEW_STATE_IDS.rejected),
        ],
      }),
    )
    expect(view.result.current.active).toBe(true)
    expect(view.result.current.current?.url).toBe('https://cdn/2.png')
    expect(view.result.current.currentDecided).toBe(true)
    expect(view.result.current.remaining).toBe(0)
  })

  it('中途新生成的图追加队尾，不插队', () => {
    const nodes = threeAwaiting()
    const { view } = setup(nodes)
    act(() => view.result.current.enter())
    expect(view.result.current.current?.url).toBe('https://cdn/1.png')

    act(() =>
      view.rerender({
        nodes: [
          ...nodes,
          node('n4', 'https://cdn/4.png', AWAITING, '2026-08-01T00:00:04Z'),
        ],
      }),
    )
    // 当前这张没被拽走
    expect(view.result.current.current?.url).toBe('https://cdn/1.png')
    expect(view.result.current.remaining).toBe(4)
    expect(view.result.current.queue.at(-1)?.url).toBe('https://cdn/4.png')
  })

  it('节点被删掉时自动推进，不停在一张已经不存在的图上', () => {
    const nodes = threeAwaiting()
    const { view } = setup(nodes)
    act(() => view.result.current.enter())

    act(() => view.rerender({ nodes: [nodes[1]!, nodes[2]!] }))
    expect(view.result.current.current?.url).toBe('https://cdn/2.png')
  })

  it('退出后不再持有当前项', () => {
    const { view } = setup(threeAwaiting())
    act(() => view.result.current.enter())
    act(() => view.result.current.exit())
    expect(view.result.current.active).toBe(false)
    expect(view.result.current.current).toBeNull()
    // 队列还在（徽标还要显示数量），只是不在模式里了
    expect(view.result.current.remaining).toBe(3)
  })

  it('上一张 / 下一张在队尾队首绕回', () => {
    const { view } = setup(threeAwaiting())
    act(() => view.result.current.enter())
    act(() => view.result.current.goPrev())
    expect(view.result.current.current?.url).toBe('https://cdn/3.png')
    act(() => view.result.current.goNext())
    expect(view.result.current.current?.url).toBe('https://cdn/1.png')
  })
})
