import { describe, expect, it } from 'vitest'

import { changedNodeIds } from '@/lib/node-state-diff'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

function node(id: string, body: string, x = 0): NodeV4 {
  return {
    id,
    position: { x, y: 0 },
    data: { kind: 'text', subtype: 'script', name: id, body },
  } as NodeV4
}

function state(...nodes: NodeV4[]): NodeWorkflowStateV4 {
  return { version: 4, nodes, edges: [] }
}

describe('changedNodeIds', () => {
  it('finds edited, moved and new cards by content, not by reference', () => {
    const before = state(node('a', '一'), node('b', '二'), node('c', '三'))
    // 全是新对象（服务端重新解析的那一份），只有 b 改了正文、c 挪了位置、d 是新的。
    const after = state(
      node('a', '一'),
      node('b', '二改'),
      node('c', '三', 40),
      node('d', '四'),
    )

    expect(changedNodeIds(before, after)).toEqual(['b', 'c', 'd'])
  })

  it('leaves out cards that were removed', () => {
    expect(changedNodeIds(state(node('a', '一')), state())).toEqual([])
  })
})
