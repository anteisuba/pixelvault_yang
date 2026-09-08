import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { collectDownstream } from '@/lib/node-downstream'
import type { NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/**
 * 「只重跑下游」的拓扑闸（第三期）。
 *
 * 最值得留的是**汇合**与**环**那两条：前者写错会让同一个节点被重跑两次（花两次
 * 钱），后者写错会让右键菜单那一帧直接把页面吊死。
 */

function edge(source: string, target: string): NodeWorkflowEdgeV4 {
  return {
    id: `${source}->${target}`,
    source,
    sourceHandle: 'out',
    target,
    slot: NODE_SLOT_IDS.reference,
  } as NodeWorkflowEdgeV4
}

describe('collectDownstream', () => {
  it('一条链按广度优先给出顺序，⛔ 不含起点自己', () => {
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')]
    expect(collectDownstream('a', edges)).toEqual(['b', 'c', 'd'])
  })

  it('分叉：两条支路都进来，同一层的按边表顺序', () => {
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd')]
    expect(collectDownstream('a', edges)).toEqual(['b', 'c', 'd'])
  })

  it('⭐ 汇合点只出现一次（否则它会被重跑两次 = 花两次钱）', () => {
    const edges = [
      edge('a', 'b'),
      edge('a', 'c'),
      edge('b', 'z'),
      edge('c', 'z'),
    ]
    const result = collectDownstream('a', edges)
    expect(result.filter((id) => id === 'z')).toHaveLength(1)
    expect(result).toEqual(['b', 'c', 'z'])
  })

  it('⭐ 环不会把它转死（边表是用户与助手一起写的）', () => {
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
    expect(collectDownstream('a', edges)).toEqual(['b', 'c'])
  })

  it('自环直接忽略', () => {
    expect(collectDownstream('a', [edge('a', 'a'), edge('a', 'b')])).toEqual([
      'b',
    ])
  })

  it('⛔ 不碰上游与无关分支', () => {
    const edges = [edge('up', 'a'), edge('a', 'b'), edge('other', 'elsewhere')]
    expect(collectDownstream('a', edges)).toEqual(['b'])
  })

  it('没有出边 / 图里根本没有这个节点 → 空数组', () => {
    expect(collectDownstream('a', [])).toEqual([])
    expect(collectDownstream('ghost', [edge('a', 'b')])).toEqual([])
  })
})
